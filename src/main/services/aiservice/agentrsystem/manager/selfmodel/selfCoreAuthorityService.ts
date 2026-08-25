import { In, type EntityManager, type Repository } from 'typeorm'
import type { SelfCoreRevisionDraft, SelfCoreSnapshot } from '@share/cache/AItype/states/selfCore'
import { SelfCoreRevisionRecord } from '@share/entity/database/SelfCoreRevisionRecord'
import { SelfExperienceRecord } from '@share/entity/database/SelfExperienceRecord'
import { loadAuthoredNarrativeTemplate } from '../../../prompt/main_agent/persona/characterPromptStore'
import {
  DEFAULT_CHARACTER_PROMPT,
  isLegacyDefaultCharacterPrompt
} from '../../../prompt/main_agent/shared/promptConstants'
import { createDefaultSelfCore, DEFAULT_SELF_CORE_ID } from './selfCoreDefinition'
import {
  assertSelfCoreRevision,
  createAuthoredNarrativeRevision,
  parseSelfCoreSnapshot
} from './selfCoreEvolution'
import {
  auditSelfCoreRevisionChain,
  collectSelfCoreEvidenceExperienceIds,
  type SelfCoreIntegrityReport
} from './selfCoreIntegrityAudit'

const toSnapshot = (row: SelfCoreRevisionRecord): SelfCoreSnapshot =>
  parseSelfCoreSnapshot(JSON.parse(row.stateJson))

export type SelfCoreAuthorityServiceDependencies = {
  coreId?: string
  loadAuthoredNarrative?: () => Promise<string>
}

export class SelfCoreAuthorityService {
  private lastIntegrityReport: SelfCoreIntegrityReport | null = null
  private lastAuditedRevision: number | null = null
  private readonly coreId: string
  private readonly loadAuthoredNarrative: () => Promise<string>

  constructor(dependencies: SelfCoreAuthorityServiceDependencies = {}) {
    this.coreId = dependencies.coreId?.trim() || DEFAULT_SELF_CORE_ID
    this.loadAuthoredNarrative = dependencies.loadAuthoredNarrative ?? loadAuthoredNarrativeTemplate
  }

  private async repo(manager?: EntityManager): Promise<Repository<SelfCoreRevisionRecord>> {
    if (manager) return manager.getRepository(SelfCoreRevisionRecord)
    const { AppDataSource } = await import('../../../../../database')
    return AppDataSource.getRepository(SelfCoreRevisionRecord)
  }

  private async experienceRepo(manager?: EntityManager): Promise<Repository<SelfExperienceRecord>> {
    if (manager) return manager.getRepository(SelfExperienceRecord)
    const { AppDataSource } = await import('../../../../../database')
    return AppDataSource.getRepository(SelfExperienceRecord)
  }

  private findLatestRevision(repo: Repository<SelfCoreRevisionRecord>): Promise<SelfCoreRevisionRecord | null> {
    return repo.findOne({
      where: { coreId: this.coreId },
      order: { revision: 'DESC' }
    })
  }

  async load(manager?: EntityManager): Promise<SelfCoreSnapshot> {
    const repo = await this.repo(manager)
    const current = await this.findLatestRevision(repo)
    if (current) {
      const snapshot = toSnapshot(current)
      if (isLegacyDefaultCharacterPrompt(snapshot.identity.authoredNarrative)) {
        const migration = createAuthoredNarrativeRevision(snapshot, DEFAULT_CHARACTER_PROMPT)
        if (migration) {
          try {
            return await this.commitRevision(migration, manager)
          } catch (error) {
            const raced = await this.findLatestRevision(repo)
            if (raced && raced.revision > snapshot.revision) {
              await this.refreshIntegrityAuditIfNeeded(raced.revision, manager)
              return toSnapshot(raced)
            }
            throw error
          }
        }
      }
      await this.refreshIntegrityAuditIfNeeded(current.revision, manager)
      return snapshot
    }

    const initial = createDefaultSelfCore(await this.loadAuthoredNarrative())
    if (initial.coreId !== this.coreId) {
      throw new Error(`Self Core authority mismatch: expected ${this.coreId}, received ${initial.coreId}.`)
    }
    const row = repo.create({
      id: `${initial.coreId}:${initial.revision}`,
      coreId: initial.coreId,
      schemaVersion: initial.schemaVersion,
      revision: initial.revision,
      stateJson: JSON.stringify(initial),
      changeKind: 'bootstrap',
      sourceRefsJson: JSON.stringify(['character_prompt:legacy_authorized_narrative']),
      previousRevision: null
    })
    try {
      await repo.save(row)
      await this.refreshIntegrityAuditIfNeeded(initial.revision, manager)
      return initial
    } catch (error) {
      const raced = await this.findLatestRevision(repo)
      if (raced) {
        await this.refreshIntegrityAuditIfNeeded(raced.revision, manager)
        return toSnapshot(raced)
      }
      throw error
    }
  }

  async auditIntegrity(manager?: EntityManager): Promise<SelfCoreIntegrityReport> {
    const revisionRepo = await this.repo(manager)
    const records = await revisionRepo.find({
      where: { coreId: this.coreId },
      order: { revision: 'ASC' }
    })
    const experienceIds = collectSelfCoreEvidenceExperienceIds(records)
    const knownExperiences = experienceIds.length
      ? await (await this.experienceRepo(manager)).find({
            select: { id: true },
            where: { id: In(experienceIds) }
          })
      : []
    const report = auditSelfCoreRevisionChain({
      records,
      knownExperienceIds: new Set(knownExperiences.map((experience) => experience.id))
    })
    this.lastIntegrityReport = report
    this.lastAuditedRevision = report.latestRevision ?? null
    return report
  }

  getLastIntegrityReport(): SelfCoreIntegrityReport | null {
    return this.lastIntegrityReport
      ? JSON.parse(JSON.stringify(this.lastIntegrityReport)) as SelfCoreIntegrityReport
      : null
  }

  invalidateIntegrityAudit(): void {
    this.lastIntegrityReport = null
    this.lastAuditedRevision = null
  }

  async commitRevision(
    draft: SelfCoreRevisionDraft,
    manager?: EntityManager
  ): Promise<SelfCoreSnapshot> {
    const next = parseSelfCoreSnapshot(draft.next)
    const repo = await this.repo(manager)
    const currentRow = await this.findLatestRevision(repo)
    const current = currentRow ? toSnapshot(currentRow) : await this.load(manager)
    if (current.revision !== draft.baseRevision || current.coreId !== next.coreId) {
      throw new Error('Self Core revision conflict: the authoritative state has changed.')
    }
    assertSelfCoreRevision(current, draft)
    const row = repo.create({
      id: `${next.coreId}:${next.revision}`,
      coreId: next.coreId,
      schemaVersion: next.schemaVersion,
      revision: next.revision,
      stateJson: JSON.stringify(next),
      changeKind: draft.changeKind,
      sourceRefsJson: JSON.stringify([...new Set(draft.sourceRefs.filter(Boolean))]),
      previousRevision: current.revision
    })
    await repo.save(row)
    await this.auditIntegrity(manager)
    return next
  }

  /**
   * 显式修改当前 Self Core 中的作者叙事，并写入身份修订链。
   * 这与修改未来首次建核所用的叙事模板是两种不同操作。
   */
  async replaceAuthoredNarrative(
    authoredNarrative: string,
    manager?: EntityManager
  ): Promise<SelfCoreSnapshot> {
    const current = await this.load(manager)
    const draft = createAuthoredNarrativeRevision(current, authoredNarrative)
    return draft ? this.commitRevision(draft, manager) : current
  }

  async clear(manager?: EntityManager): Promise<void> {
    await (await this.repo(manager)).delete({ coreId: this.coreId })
    this.invalidateIntegrityAudit()
  }

  private async refreshIntegrityAuditIfNeeded(
    revision: number,
    manager?: EntityManager
  ): Promise<void> {
    if (this.lastAuditedRevision === revision) return
    await this.auditIntegrity(manager)
  }
}

export const selfCoreAuthorityService = new SelfCoreAuthorityService()
