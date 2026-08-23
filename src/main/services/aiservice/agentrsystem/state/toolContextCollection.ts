import type { ToolContextItem } from './messageState'

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
