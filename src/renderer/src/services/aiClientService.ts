import { ref, type Ref } from 'vue'
import type { ChatMessage } from '../../../share/cache/render/aiagent/chatMessage'
import { partsToMarkdown } from '../utils/aiToMarkdown'
import type { StreamChunk } from '../../../share/cache/render/aiagent/aiContent'

// A reactive reference to hold the list of chat messages
const messages = ref<ChatMessage[]>([])

// A reactive reference to track if the AI is currently thinking
const isLoading = ref(false)

// 当前正在响应的消息 ID，用于流式追加内容
let currentStreamingMessageId: number | null = null
let currentStreamingText = ''
let stopListening: (() => void) | null = null

/**
 * 处理流式数据包
 */
function handleStreamChunk(chunk: StreamChunk): void {
  // 如果收到 chunk 时还没有占位消息，理论上不应发生，但为了安全
  if (!currentStreamingMessageId) return

  // 找到当前消息对象
  const msg = messages.value.find((m) => m.id === currentStreamingMessageId)
  if (!msg) return

  switch (chunk.type) {
    case 'text_delta':
      // 如果是第一次收到文本，清除“思考中”占位符
      if (msg.text === '正在思考中...') {
        msg.text = ''
      }
      currentStreamingText += chunk.content
      msg.text = currentStreamingText
      break
    
    case 'stream_error':
      msg.text += `\n\n[Error: ${chunk.message}]`
      isLoading.value = false
      cleanupListener()
      break

    case 'done':
      // 结束信号，可选用完整富结构替换
      if (chunk.fullContent) {
        msg.text = partsToMarkdown(chunk.fullContent)
      }
      isLoading.value = false
      cleanupListener()
      break
  }
}

function cleanupListener(): void {
  if (stopListening) {
    stopListening()
    stopListening = null
  }
  currentStreamingMessageId = null
  currentStreamingText = ''
}

/**
 * 加载历史记录
 */
async function loadHistory(): Promise<void> {
  try {
    const history = await window.api.getHistory()
    if (history && Array.isArray(history)) {
      messages.value = history.map((msg: any) => ({
        id: msg.id,
        text: msg.content, // 直接使用 content 字段，假设存储的是 Markdown
        sender: msg.role
      }))
    }
  } catch (error) {
    console.error('Failed to load history:', error)
  }
}

/**
 * Sends a message to the AI and updates the chat.
 * @param text - The message text from the user.
 */
async function sendMessage(text: string): Promise<void> {
  if (!text.trim() || isLoading.value) {
    return
  }

  // 1. Add user's message to the list
  messages.value.push({
    id: Date.now(),
    text: text,
    sender: 'user'
  })

  // 2. Set loading state & Init listener
  isLoading.value = true
  
  // 注册监听器
  cleanupListener() // 确保清理旧的
  stopListening = window.api.onStreamChunk(handleStreamChunk)

  // Add a placeholder for the AI response
  const aiMsgId = Date.now() + 1
  currentStreamingMessageId = aiMsgId
  currentStreamingText = '' // 重置缓冲文本
  
  messages.value.push({
    id: aiMsgId,
    text: '正在思考中...',
    sender: 'ai'
  })

  try {
    // 3. 调用流式接口
    window.api.sendMessageStream(text)
  } catch (error) {
    console.error('Error sending message to AI:', error)
    const msg = messages.value.find((m) => m.id === aiMsgId)
    if (msg) msg.text = '抱歉，与AI通信时发生错误。'
    isLoading.value = false
    cleanupListener()
  }
}

// This is the "service" that the Vue component will use.
// It exposes the reactive state and the function to modify it.
export function useAIChatService(): {
  messages: Ref<ChatMessage[]>
  isLoading: Ref<boolean>
  sendMessage: (text: string) => Promise<void>
  loadHistory: () => Promise<void>
} {
  return {
    messages,
    isLoading,
    sendMessage,
    loadHistory
  }
}
