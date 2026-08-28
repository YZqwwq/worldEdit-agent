export type AgentLifeStateSnapshot = {
  narrative: string
  revision: number
  updatedAt: string
  sourceTurnId: number | null
}

export type AgentLifeStateCandidate = {
  narrative: string
  sourceTurnId: number
}
