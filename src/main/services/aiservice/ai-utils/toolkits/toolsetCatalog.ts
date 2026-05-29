import type { AgentToolRegistryEntry, ToolsetRegistryEntry } from './toolRegistryTypes'

export type ToolsetCatalogItem = {
  id: string
  title: string
  summary: string
  tags: string[]
  activationHints: string[]
  whenToUse: string[]
  whenNotToUse: string[]
  toolCount: number
  toolNames: string[]
}

let toolsetCatalogProvider: (() => ToolsetCatalogItem[]) | null = null

export const configureToolsetCatalogProvider = (
  provider: () => ToolsetCatalogItem[]
): void => {
  toolsetCatalogProvider = provider
}

export const toToolsetCatalogItem = (
  toolset: ToolsetRegistryEntry,
  entries: AgentToolRegistryEntry[]
): ToolsetCatalogItem => ({
  id: toolset.id,
  title: toolset.title,
  summary: toolset.summary,
  tags: toolset.tags,
  activationHints: toolset.activationHints,
  whenToUse: toolset.whenToUse,
  whenNotToUse: toolset.whenNotToUse ?? [],
  toolCount: entries.length,
  toolNames: entries.map((entry) => entry.tool.name)
})

export const listToolsetCatalog = (): ToolsetCatalogItem[] =>
  toolsetCatalogProvider?.() ?? []
