export type ReasoningChannelMode = 'native' | 'emulated'

export type TurnReasoningSegment = {
  id: string
  text: string
  mode: ReasoningChannelMode
  modelStep: number
  createdAt: string
  followsObservation: boolean
}

export type FinalContentCandidate = {
  messageId: string
  content: string
  source: 'native_content' | 'final_composition'
}
