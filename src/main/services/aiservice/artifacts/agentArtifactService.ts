import { randomUUID } from 'node:crypto'
import type { EntityManager } from 'typeorm'
import { AppDataSource } from '../../../database'
import type {
  AgentArtifactKind,
  AgentArtifactPayload
} from '@share/cache/AItype/states/agentArtifact'
import { AgentArtifactRecord } from '@share/entity/database/AgentArtifactRecord'
import { MainAgentEventRecord } from '@share/entity/database/MainAgentEventRecord'
import { getToolEffectExecutionContext } from '../../toolEffects/toolEffectExecutionContext'

const compactWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim()

const deriveSummary = (body: string): string => {
  const plainText = compactWhitespace(
    body.replace(/```[\s\S]*?```/g, ' ').replace(/[#>*_`~\[\]()!-]/g, ' ')
  )
  return plainText.slice(0, 180)
}

const toPayload = (record: AgentArtifactRecord): AgentArtifactPayload => ({
  id: record.id,
  eventId: record.eventId,
  turnId: record.turnId,
  sessionId: record.sessionId,
  toolCallId: record.toolCallId,
  worldId: record.worldId || undefined,
  entityId: record.entityId || undefined,
  documentId: record.documentId || undefined,
  kind: record.kind,
  title: record.title,
  summary: record.summary,
  body: record.body,
  bodyFormat: record.bodyFormat,
  status: record.status,
  createdAt: record.createdAt.toISOString(),
  updatedAt: record.updatedAt.toISOString()
})

const resolveWorkspaceRefs = async (
  eventId: string
): Promise<{
  worldId?: string
  entityId?: string
  documentId?: string
}> => {
  const event = await AppDataSource.getRepository(MainAgentEventRecord).findOneBy({ id: eventId })
  if (!event) return {}
  try {
    const payload = JSON.parse(event.payloadJson) as {
      workspaceContext?: {
        world?: { id?: unknown }
        entity?: { id?: unknown }
        document?: { id?: unknown }
      }
    }
    const workspace = payload.workspaceContext
    return {
      worldId: typeof workspace?.world?.id === 'string' ? workspace.world.id : undefined,
      entityId: typeof workspace?.entity?.id === 'string' ? workspace.entity.id : undefined,
      documentId: typeof workspace?.document?.id === 'string' ? workspace.document.id : undefined
    }
  } catch {
    return {}
  }
}

class AgentArtifactService {
  async publish(input: {
    kind: AgentArtifactKind
    title: string
    body: string
    summary?: string
  }): Promise<AgentArtifactPayload> {
    const execution = getToolEffectExecutionContext()
    if (!execution) {
      throw new Error('Agent artifact publishing requires an active tool execution context.')
    }

    const repo = AppDataSource.getRepository(AgentArtifactRecord)
    const existing = await repo.findOneBy({
      eventId: execution.eventId,
      toolCallId: execution.toolCallId
    })
    if (existing) return toPayload(existing)

    const refs = await resolveWorkspaceRefs(execution.eventId)
    const record = repo.create({
      id: randomUUID(),
      eventId: execution.eventId,
      turnId: execution.turnId,
      sessionId: execution.sessionId,
      toolCallId: execution.toolCallId,
      worldId: refs.worldId ?? null,
      entityId: refs.entityId ?? null,
      documentId: refs.documentId ?? null,
      kind: input.kind,
      title: input.title.trim(),
      summary: compactWhitespace(input.summary || '') || deriveSummary(input.body),
      body: input.body.trim(),
      bodyFormat: 'markdown',
      status: 'draft'
    })
    return toPayload(await repo.save(record))
  }

  async getById(id: string, includeDraft = false): Promise<AgentArtifactPayload | null> {
    const record = await AppDataSource.getRepository(AgentArtifactRecord).findOneBy({ id })
    if (
      !record ||
      (includeDraft
        ? record.status !== 'committed' && record.status !== 'draft'
        : record.status !== 'committed')
    ) {
      return null
    }
    return toPayload(record)
  }

  async listForTurn(
    eventId: string,
    turnId: number,
    manager?: EntityManager
  ): Promise<AgentArtifactRecord[]> {
    const repo = manager
      ? manager.getRepository(AgentArtifactRecord)
      : AppDataSource.getRepository(AgentArtifactRecord)
    return repo.find({
      where: { eventId, turnId },
      order: { createdAt: 'ASC' }
    })
  }

  async commitTurnArtifacts(
    eventId: string,
    turnId: number,
    manager: EntityManager
  ): Promise<AgentArtifactRecord[]> {
    const repo = manager.getRepository(AgentArtifactRecord)
    const records = await this.listForTurn(eventId, turnId, manager)
    for (const record of records) {
      record.status = 'committed'
    }
    return records.length > 0 ? repo.save(records) : []
  }

  async revertTurnArtifacts(turnId: number, manager?: EntityManager): Promise<void> {
    const repo = manager?.getRepository(AgentArtifactRecord) ?? AppDataSource.getRepository(AgentArtifactRecord)
    const records = await repo.find({ where: { turnId } })
    for (const record of records) {
      record.status = 'reverted'
    }
    if (records.length > 0) await repo.save(records)
  }

  async discardTurnDrafts(eventId: string, turnId: number, manager: EntityManager): Promise<void> {
    await manager.getRepository(AgentArtifactRecord).delete({
      eventId,
      turnId,
      status: 'draft'
    })
  }
}

export const agentArtifactService = new AgentArtifactService()
