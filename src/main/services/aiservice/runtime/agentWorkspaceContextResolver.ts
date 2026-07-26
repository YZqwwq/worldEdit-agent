import { AppDataSource } from '../../../database'
import { WorldRecord } from '@share/entity/database/WorldRecord'
import { WorldEntityRecord } from '@share/entity/database/WorldEntityRecord'
import { WorldEntityDocumentRecord } from '@share/entity/database/WorldEntityDocumentRecord'
import {
  normalizeAgentWorkspaceContext,
  type AgentWorkspaceContext
} from '@share/cache/AItype/states/agentWorkspaceContext'
import { isWorldInstanceEntityType } from '@share/cache/worldbuilding/worldbuilding'

export const resolveAgentWorkspaceContext = async (
  value: unknown
): Promise<AgentWorkspaceContext | undefined> => {
  const context = normalizeAgentWorkspaceContext(value)
  if (!context) return undefined

  let world: AgentWorkspaceContext['world']
  let entity: AgentWorkspaceContext['entity']
  let document: AgentWorkspaceContext['document']

  if (context.document?.id) {
    const record = await AppDataSource.getRepository(WorldEntityDocumentRecord).findOneBy({
      id: context.document.id
    })
    if (record) {
      document = {
        id: record.id,
        title: record.title,
        ownerKind: record.ownerKind,
        parentDocumentId: record.parentDocumentId,
        revision: record.revision
      }
      world = { id: record.worldId }
      if (record.ownerEntityId) entity = { id: record.ownerEntityId }
    }
  }

  const requestedEntityId = entity?.id || context.entity?.id
  if (requestedEntityId) {
    const record = await AppDataSource.getRepository(WorldEntityRecord).findOneBy({
      id: requestedEntityId
    })
    if (record && (!world?.id || record.worldId === world.id)) {
      entity = {
        id: record.id,
        type: isWorldInstanceEntityType(record.type) ? record.type : undefined,
        name: record.name
      }
      world = { id: record.worldId }
    } else {
      entity = undefined
      if (document?.ownerKind === 'entity') document = undefined
    }
  }

  const requestedWorldId = world?.id || context.world?.id
  if (requestedWorldId) {
    const record = await AppDataSource.getRepository(WorldRecord).findOneBy({
      id: requestedWorldId
    })
    if (record) {
      world = { id: record.id, name: record.name }
    } else {
      world = undefined
      entity = undefined
      document = undefined
    }
  }

  return {
    pageKind: context.pageKind,
    routeName: context.routeName,
    capturedAt: context.capturedAt,
    world,
    entity,
    document
  }
}
