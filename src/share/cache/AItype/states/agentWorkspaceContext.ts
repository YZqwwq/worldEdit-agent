import {
  isWorldInstanceEntityType,
  type WorldEntityType,
  type WorldInstanceEntityType
} from '../../worldbuilding/worldbuilding'

export type AgentWorkspacePageKind =
  | 'home'
  | 'world'
  | 'entity'
  | 'document'
  | 'chat'
  | 'other'

export interface AgentWorkspaceContext {
  pageKind: AgentWorkspacePageKind
  routeName: string
  capturedAt: string
  world?: {
    id: string
    name?: string
  }
  entity?: {
    id: string
    type?: WorldInstanceEntityType
    name?: string
  }
  document?: {
    id: string
    title?: string
    parentDocumentId?: string | null
    revision?: number
  }
}

const PAGE_KINDS = new Set<AgentWorkspacePageKind>([
  'home',
  'world',
  'entity',
  'document',
  'chat',
  'other'
])

const normalizeText = (value: unknown, maxLength = 160): string | undefined => {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized ? normalized.slice(0, maxLength) : undefined
}

const normalizeRevision = (value: unknown): number | undefined => {
  const revision = Number(value)
  return Number.isSafeInteger(revision) && revision > 0 ? revision : undefined
}

export const normalizeAgentWorkspaceContext = (
  value: unknown
): AgentWorkspaceContext | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const pageKind = PAGE_KINDS.has(raw.pageKind as AgentWorkspacePageKind)
    ? (raw.pageKind as AgentWorkspacePageKind)
    : 'other'
  const routeName = normalizeText(raw.routeName, 80) || 'Unknown'
  const capturedAtRaw = normalizeText(raw.capturedAt, 64)
  const capturedAt =
    capturedAtRaw && !Number.isNaN(new Date(capturedAtRaw).getTime())
      ? new Date(capturedAtRaw).toISOString()
      : new Date().toISOString()

  const rawWorld =
    raw.world && typeof raw.world === 'object' && !Array.isArray(raw.world)
      ? (raw.world as Record<string, unknown>)
      : null
  const worldId = normalizeText(rawWorld?.id, 80)
  const world = worldId
    ? { id: worldId, name: normalizeText(rawWorld?.name) }
    : undefined

  const rawEntity =
    raw.entity && typeof raw.entity === 'object' && !Array.isArray(raw.entity)
      ? (raw.entity as Record<string, unknown>)
      : null
  const entityId = normalizeText(rawEntity?.id, 80)
  const entityType: WorldInstanceEntityType | undefined =
    typeof rawEntity?.type === 'string' &&
    isWorldInstanceEntityType(rawEntity.type as WorldEntityType)
      ? (rawEntity.type as WorldInstanceEntityType)
      : undefined
  const entity = entityId
    ? { id: entityId, type: entityType, name: normalizeText(rawEntity?.name) }
    : undefined

  const rawDocument =
    raw.document && typeof raw.document === 'object' && !Array.isArray(raw.document)
      ? (raw.document as Record<string, unknown>)
      : null
  const documentId = normalizeText(rawDocument?.id, 80)
  const document = documentId
    ? {
        id: documentId,
        title: normalizeText(rawDocument?.title),
        parentDocumentId:
          rawDocument?.parentDocumentId === null
            ? null
            : normalizeText(rawDocument?.parentDocumentId, 80),
        revision: normalizeRevision(rawDocument?.revision)
      }
    : undefined

  return {
    pageKind,
    routeName,
    capturedAt,
    world,
    entity,
    document
  }
}
