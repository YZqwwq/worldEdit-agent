// 渲染层通用聊天消息类型（与 UI 状态匹配）
import type { MainAgentMessageFileMediaType } from '../../AItype/states/mainAgentMessageContent'
import type { MainAgentMessageStatus } from '../../AItype/states/mainAgentTurnState'

export type ChatSender = 'user' | 'ai'

export interface ChatMessageAttachment {
  fileId: string
  fileName: string
  fileUrl: string
  mimeType?: string
  mediaType: MainAgentMessageFileMediaType
}

export interface ChatMessage {
  id: number
  text: string
  attachments?: ChatMessageAttachment[]
  sender: ChatSender
  timestamp?: number
  turnId?: number
  status?: MainAgentMessageStatus
}
