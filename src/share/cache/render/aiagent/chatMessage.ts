// 渲染层通用聊天消息类型（与 UI 状态匹配）
export type ChatSender = 'user' | 'ai'

export interface ChatMessage {
  id: number
  text: string
  sender: ChatSender
}
