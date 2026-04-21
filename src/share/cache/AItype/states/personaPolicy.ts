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

export interface PersonaMemoryPolicy {
  archiveThreshold: number
  shortTermLimit: number
}

export interface PersonaPolicy {
  generatedAt: string
  sampling: PersonaSamplingPolicy
  tool: PersonaToolPolicy
  memory: PersonaMemoryPolicy
  signals: string[]
}
