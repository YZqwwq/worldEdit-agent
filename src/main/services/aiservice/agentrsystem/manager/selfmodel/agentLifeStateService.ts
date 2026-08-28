import type { EntityManager, Repository } from 'typeorm'
import type {
  AgentLifeStateCandidate,
  AgentLifeStateSnapshot
} from '@share/cache/AItype/states/agentLifeState'
import { AgentLifeStateRecord } from '@share/entity/database/AgentLifeStateRecord'

const SINGLETON_ID = 1

const toSnapshot = (record: AgentLifeStateRecord): AgentLifeStateSnapshot => ({
  narrative: record.narrative,
  revision: record.revision,
  updatedAt: record.updatedAt.toISOString(),
  sourceTurnId: record.sourceTurnId
})

class AgentLifeStateService {
  private async repository(manager?: EntityManager): Promise<Repository<AgentLifeStateRecord>> {
    if (manager) return manager.getRepository(AgentLifeStateRecord)
    const { AppDataSource } = await import('../../../../../database')
    return AppDataSource.getRepository(AgentLifeStateRecord)
  }

  async load(manager?: EntityManager): Promise<AgentLifeStateSnapshot> {
    const repository = await this.repository(manager)
    const existing = await repository.findOneBy({ id: SINGLETON_ID })
    if (existing) return toSnapshot(existing)

    const created = repository.create({
      id: SINGLETON_ID,
      narrative: '',
      revision: 0,
      sourceTurnId: null
    })
    try {
      return toSnapshot(await repository.save(created))
    } catch {
      const raced = await repository.findOneBy({ id: SINGLETON_ID })
      if (!raced) throw new Error('Failed to initialize Agent life state.')
      return toSnapshot(raced)
    }
  }

  async commitCandidateWithManager(
    candidate: AgentLifeStateCandidate,
    baseRevision: number,
    manager: EntityManager
  ): Promise<boolean> {
    const narrative = candidate.narrative.trim()
    if (!narrative) return false
    const result = await manager.getRepository(AgentLifeStateRecord).update(
      { id: SINGLETON_ID, revision: baseRevision },
      {
        narrative,
        revision: baseRevision + 1,
        sourceTurnId: candidate.sourceTurnId
      }
    )
    return result.affected === 1
  }
}

export const agentLifeStateService = new AgentLifeStateService()
