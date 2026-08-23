import type { EntityManager } from 'typeorm'
import { AppDataSource } from '../../../../../database'
import { SelfExperienceRecord } from '@share/entity/database/SelfExperienceRecord'
import type {
  SelfExperienceDraft,
  SelfExperienceSnapshot,
  SelfModelItemUpdate,
  SelfModelSnapshot
} from '@share/cache/AItype/states/selfModel'
import { foldOpenSelfModelItems } from '../../cognition/selfExperienceIntegration'

const parseArray = <T>(value: string): T[] => {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as T[] : []
  } catch {
    return []
  }
}

const toSnapshot = (row: SelfExperienceRecord): SelfExperienceSnapshot => ({
  id: row.id,
  eventId: row.eventId,
  turnId: row.turnId,
  sessionId: row.sessionId,
  kind: row.kind as SelfExperienceSnapshot['kind'],
  summary: row.summary,
  understanding: row.understanding,
  selfPosition: row.selfPosition,
  personalMeaning: row.personalMeaning || undefined,
  stance: row.stance || undefined,
  relationshipMeaning: row.relationshipMeaning || undefined,
  selfNarrative: row.selfNarrative || undefined,
  commitmentUpdates: parseArray<SelfModelItemUpdate>(row.commitmentUpdatesJson),
  concernUpdates: parseArray<SelfModelItemUpdate>(row.concernUpdatesJson),
  evidenceRefs: parseArray<string>(row.evidenceRefsJson),
  confidence: row.confidence,
  revision: row.revision,
  supersedesExperienceId: row.supersedesExperienceId || undefined,
  occurredAt: row.occurredAt,
  createdAt: row.createdAt.toISOString()
})

class SelfExperienceService {
  async commitTurnExperience(
    input: {
      eventId: string
      turnId: number
      sessionId: string
      draft: SelfExperienceDraft
    },
    manager: EntityManager
  ): Promise<SelfExperienceSnapshot> {
    const repo = manager.getRepository(SelfExperienceRecord)
    const id = `experience:${input.eventId}`
    const existing = await repo.findOneBy({ id })
    if (existing) return toSnapshot(existing)

    const row = repo.create({
      id,
      eventId: input.eventId,
      turnId: input.turnId,
      sessionId: input.sessionId,
      kind: input.draft.kind,
      summary: input.draft.summary,
      understanding: input.draft.understanding,
      selfPosition: input.draft.selfPosition,
      personalMeaning: input.draft.personalMeaning || '',
      stance: input.draft.stance || '',
      relationshipMeaning: input.draft.relationshipMeaning || '',
      selfNarrative: input.draft.selfNarrative || '',
      commitmentUpdatesJson: JSON.stringify(input.draft.commitmentUpdates),
      concernUpdatesJson: JSON.stringify(input.draft.concernUpdates),
      evidenceRefsJson: JSON.stringify(input.draft.evidenceRefs),
      confidence: input.draft.confidence,
      revision: 1,
      supersedesExperienceId: null,
      occurredAt: input.draft.occurredAt
    })
    return toSnapshot(await repo.save(row))
  }

  async getSnapshot(limit = 24): Promise<SelfModelSnapshot> {
    const allExperiences = (await AppDataSource.getRepository(SelfExperienceRecord).find({
      order: { createdAt: 'DESC' }
    })).map(toSnapshot)
    const recentExperiences = allExperiences.slice(0, Math.max(1, Math.min(limit, 100)))

    return {
      recentExperiences,
      activeCommitments: foldOpenSelfModelItems(allExperiences, (item) => item.commitmentUpdates),
      openConcerns: foldOpenSelfModelItems(allExperiences, (item) => item.concernUpdates)
    }
  }

  async revertTurnExperience(turnId: number, manager?: EntityManager): Promise<void> {
    const repo = manager?.getRepository(SelfExperienceRecord) ?? AppDataSource.getRepository(SelfExperienceRecord)
    await repo.delete({ turnId })
  }
}

export const selfExperienceService = new SelfExperienceService()
