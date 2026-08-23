export type SelfModelItemStatus = 'open' | 'fulfilled' | 'released'

export type SelfModelItemUpdate = {
  content: string
  status: SelfModelItemStatus
}

export type TurnExperienceIntent = {
  relationshipMeaning?: string
  selfNarrative?: string
  commitmentUpdates: SelfModelItemUpdate[]
  concernUpdates: SelfModelItemUpdate[]
  confidence: number
}

export type SelfExperienceDraft = {
  kind: 'dialogue' | 'task_result'
  summary: string
  understanding: string
  selfPosition: string
  personalMeaning?: string
  stance?: string
  relationshipMeaning?: string
  selfNarrative?: string
  commitmentUpdates: SelfModelItemUpdate[]
  concernUpdates: SelfModelItemUpdate[]
  evidenceRefs: string[]
  confidence: number
  occurredAt: string
}

export type SelfExperienceSnapshot = SelfExperienceDraft & {
  id: string
  eventId: string
  turnId: number
  sessionId: string
  revision: number
  supersedesExperienceId?: string
  createdAt: string
}

export type SelfModelSnapshot = {
  recentExperiences: SelfExperienceSnapshot[]
  activeCommitments: string[]
  openConcerns: string[]
}
