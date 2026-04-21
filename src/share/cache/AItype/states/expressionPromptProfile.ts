export type ExpressionPromptProfileId = 'default' | 'daily_chat' | 'reflective_discussion'

export interface ExpressionPromptProfileState {
  id: ExpressionPromptProfileId
  title: string
  summary: string
  prompt: string
}
