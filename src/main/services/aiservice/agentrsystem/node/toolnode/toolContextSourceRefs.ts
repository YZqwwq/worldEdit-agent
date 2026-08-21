import type { ToolContextSourceRef } from '../../state/messageState'

const ENTITY_TYPES = new Set([
  'character',
  'race',
  'faction',
  'nation',
  'city',
  'region',
  'map',
  'map_location',
  'event',
  'item',
  'rule',
  'custom'
])

export const extractEntitySourceRefs = (data: Record<string, unknown>): ToolContextSourceRef[] => {
  const refs: ToolContextSourceRef[] = []

  const addCandidate = (candidate: Record<string, unknown>, parentKey?: string): void => {
    const id =
      typeof candidate.entityId === 'string'
        ? candidate.entityId
        : typeof candidate.characterEntityId === 'string'
          ? candidate.characterEntityId
          : typeof candidate.id === 'string' && ENTITY_TYPES.has(String(candidate.type))
            ? candidate.id
            : undefined
    if (!id) return

    const rawType = candidate.entityType ?? candidate.type
    const entityType = ENTITY_TYPES.has(String(rawType))
      ? (rawType as ToolContextSourceRef['entityType'])
      : candidate.characterEntityId || parentKey === 'character'
        ? 'character'
        : undefined
    const title = candidate.name ?? candidate.title ?? candidate.label
    refs.push({
      type: 'entity',
      id,
      title: typeof title === 'string' ? title : undefined,
      entityType,
      worldId: typeof candidate.worldId === 'string' ? candidate.worldId : undefined
    })
  }

  const visit = (value: unknown, depth = 0, parentKey?: string): void => {
    if (!value || depth > 4 || refs.length >= 12) return
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1, parentKey)
      return
    }
    if (typeof value !== 'object') return
    const record = value as Record<string, unknown>
    addCandidate(record, parentKey)
    for (const [key, child] of Object.entries(record)) visit(child, depth + 1, key)
  }

  visit(data)
  return [...new Map(refs.map((ref) => [`${ref.type}:${String(ref.id)}`, ref])).values()]
}
