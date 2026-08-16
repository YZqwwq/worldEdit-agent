export type AgentArtifactKind = 'agent_opinion' | 'analysis' | 'proposal'
export type AgentArtifactStatus = 'draft' | 'committed' | 'reverted'
export type AgentArtifactBodyFormat = 'markdown'

export interface AgentArtifactPayload {
  id: string
  eventId: string
  turnId: number
  sessionId: string
  toolCallId: string
  worldId?: string
  entityId?: string
  documentId?: string
  kind: AgentArtifactKind
  title: string
  summary: string
  body: string
  bodyFormat: AgentArtifactBodyFormat
  status: AgentArtifactStatus
  createdAt: string
  updatedAt: string
}
