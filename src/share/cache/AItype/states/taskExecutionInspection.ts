export interface TaskExecutionInspectionField {
  key: string
  label: string
  value: string
}

export interface TaskExecutionInspectionSection {
  title: string
  summary?: string
  fields: TaskExecutionInspectionField[]
  rawJson?: string
}
