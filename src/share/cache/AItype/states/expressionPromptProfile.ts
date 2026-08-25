export type ExpressionPromptProfileId =
  | 'default'
  | 'calm'
  | 'joyful'
  | 'excited'
  | 'angry'
  | 'sad'
  | 'hurt'
  | 'uneasy'

export interface ExpressionPromptProfileState {
  id: ExpressionPromptProfileId
  title: string
  summary: string
  prompt: string
}
