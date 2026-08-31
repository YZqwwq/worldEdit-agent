export type PromptInspectionSection = {
  id: string
  title: string
  category: 'static' | 'dynamic'
  source: string
  content: string
  mock?: string
  editable?: boolean
  messageType?: string
  messageIndex?: number
  prefix?: string
}

export type PromptInspectionPayload = {
  generatedAt: string
  runtimeCapturedAt?: string
  modelStep?: number
  model?: string
  profile?: string
  hasRuntimeSnapshot: boolean
  snapshotSource?: 'runtime' | 'trace'
  sections: PromptInspectionSection[]
  fullText: string
}

export type SavePromptInspectionInput = {
  sections: Array<Pick<PromptInspectionSection, 'id' | 'content'>>
}
