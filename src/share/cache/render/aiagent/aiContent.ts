// 统一 AI 富结构内容类型定义（供主/渲染进程共享）

export interface TextPart {
  type: 'text'
  text: string
}

export interface CodePart {
  type: 'code'
  code: string
  language?: string
}

export interface ListPart {
  type: 'list'
  items: string[]
  ordered?: boolean
}

export interface HeadingPart {
  type: 'heading'
  text: string
  level?: number
}

export interface BlockquotePart {
  type: 'blockquote'
  text: string
}

export interface ErrorPart {
  type: 'error'
  message: string
}

// 其它未识别类型，使用 JSON 字符串保留原数据，避免 any/unknown
export interface OtherPart {
  type: 'other'
  json: string
}

export type AIContentPart =
  | TextPart
  | CodePart
  | ListPart
  | HeadingPart
  | BlockquotePart
  | ErrorPart
  | OtherPart

export interface AIStructuredResponse {
  parts: AIContentPart[]
}
