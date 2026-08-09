import type { AgentWorkspaceContext } from '@share/cache/AItype/states/agentWorkspaceContext'

export const resolveContextualToolsets = (
  workspaceContext: AgentWorkspaceContext | undefined
): string[] => (workspaceContext?.pageKind === 'document' ? ['world_document_editor'] : [])
