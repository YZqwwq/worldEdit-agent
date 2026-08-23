// 渲染层通用聊天消息类型（与 UI 状态匹配）
import type { MainAgentMessageFileMediaType } from '../../AItype/states/mainAgentMessageContent'
import type { MainAgentMessageStatus } from '../../AItype/states/mainAgentTurnState'
import type { AgentArtifactKind } from '../../AItype/states/agentArtifact'

export type ChatSender = 'user' | 'ai' | 'system'

export interface ChatMessageAttachment {
  fileId: string
  fileName: string
  fileUrl: string
  mimeType?: string
  mediaType: MainAgentMessageFileMediaType
}

export interface ChatMessageArtifactReference {
  artifactId: string
  artifactKind: AgentArtifactKind
  title: string
  summary?: string
}

export interface ChatMessageDocumentDiffReference {
  diffRef: string
  documentId: string
  title: string
  summary?: string
  afterRevision?: number
  addedLines: number
  removedLines: number
}

export interface ChatMessage {
  id: number
  text: string
  attachments?: ChatMessageAttachment[]
  artifacts?: ChatMessageArtifactReference[]
  documentDiffs?: ChatMessageDocumentDiffReference[]
  sender: ChatSender
  timestamp?: number
  turnId?: number
  status?: MainAgentMessageStatus
}
