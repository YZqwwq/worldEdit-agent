export type ReasoningChannelMode = 'native' | 'emulated'

export type ReasoningProtocolPreference = ReasoningChannelMode | 'auto'

export type CognitionDraft = {
  text: string
  mode: 'native' | 'emulated'
  modelStep: number
  followsObservation: boolean
  createdAt: string
}

export const appendCognitionDraftText = (previous: string | undefined, increment: string): string =>
  [previous?.trim(), increment.trim()].filter(Boolean).join('\n\n')

export type FinalContentCandidate = {
  messageId: string
  content: string
  source: 'final_composition'
  committedLifeNarrative?: string
}
