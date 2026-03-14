export type PersonaDetailLevel = 'brief' | 'balanced' | 'detailed'
export type PersonaTone = 'casual' | 'neutral' | 'formal'

export interface PersonaSamplingPolicy {
  temperature: number
  topP: number
  maxTokens: number
}

export interface PersonaToolPolicy {
  confirmBeforeSensitiveTools: boolean
  allowRiskyTools: boolean
  exploratoryBias: number
}

export interface PersonaStylePolicy {
  detailLevel: PersonaDetailLevel
  tone: PersonaTone
  instruction: string
}

export interface PersonaMemoryPolicy {
  compressThreshold: number
  shortTermLimit: number
}

export interface PersonaPolicy {
  generatedAt: string
  sampling: PersonaSamplingPolicy
  tool: PersonaToolPolicy
  style: PersonaStylePolicy
  memory: PersonaMemoryPolicy
  signals: string[]
}
