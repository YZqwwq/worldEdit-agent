import type { AgentToolRegistryEntry } from './toolRegistryTypes'

export type ExtensionToolCatalogItem = {
  name: string
  category: string
  capabilityGroup: string
  summary: string
  whenToUse: string[]
  inputSummary: string
  outputSummary: string
}

let extensionToolCatalogProvider: (() => ExtensionToolCatalogItem[]) | null = null

export const configureExtensionToolCatalogProvider = (
  provider: () => ExtensionToolCatalogItem[]
): void => {
  extensionToolCatalogProvider = provider
}

export const toExtensionToolCatalogItem = (
  entry: AgentToolRegistryEntry
): ExtensionToolCatalogItem => ({
  name: entry.tool.name,
  category: entry.category,
  capabilityGroup: entry.capabilityGroup,
  summary: entry.capabilitySummary || entry.tool.baseDescription,
  whenToUse: entry.tool.agentMetadata.whenToUse,
  inputSummary: entry.tool.agentMetadata.inputSummary,
  outputSummary: entry.tool.agentMetadata.outputSummary
})

export const listExtensionToolCatalog = (): ExtensionToolCatalogItem[] =>
  extensionToolCatalogProvider?.() ?? []
