import type { ToolContextItem, ToolContextSourceRef } from './messageState'

export const uniqueToolContextItems = (items: ToolContextItem[]): ToolContextItem[] => {
  const byKey = new Map<string, ToolContextItem>()
  for (const item of items) {
    byKey.set(
      item.supersessionKey || `${item.toolName}:${item.argsSummary}:${item.resultSummary}`,
      item
    )
  }
  return [...byKey.values()]
}

const renderSourceRef = (ref: ToolContextSourceRef): string => {
  if (ref.type === 'entity') {
    const identity = [ref.entityType || 'entity', ref.title, ref.id].filter(Boolean).join(' / ')
    return ref.worldId ? `${identity}（worldId=${ref.worldId}）` : identity
  }
  if (ref.type === 'document') {
    const identity = ['document', ref.title, ref.id].filter(Boolean).join(' / ')
    const metadata = [
      ref.worldId ? `worldId=${ref.worldId}` : '',
      typeof ref.revision === 'number' ? `revision=${ref.revision}` : ''
    ].filter(Boolean)
    return metadata.length ? `${identity}（${metadata.join('，')}）` : identity
  }
  if (ref.type === 'url') return [ref.title, ref.url].filter(Boolean).join(' / ')
  return [ref.type, ref.title, ref.id].filter(Boolean).join(' / ')
}

export const renderToolContextItems = (title: string, items: ToolContextItem[]): string =>
  items.length
    ? [
        title,
        ...items.map((item, index) => {
          const refs = (item.sourceRefs ?? []).slice(0, 8).map(renderSourceRef).filter(Boolean)
          return [
            `${index + 1}. ${item.toolName}：${item.resultSummary}`,
            refs.length ? `   已确认引用：${refs.join('；')}` : ''
          ]
            .filter(Boolean)
            .join('\n')
        })
      ].join('\n')
    : ''
