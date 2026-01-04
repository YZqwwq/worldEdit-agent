import { ref, type Ref } from 'vue'
import { sendMessageStructured as sendMessageStructuredApi } from '../bridge/aiBridge'
import type { ChatMessage } from '../../../share/cache/render/aiagent/chatMessage'
import { partsToMarkdown } from '../utils/aiToMarkdown'
import type { AIContentPart } from '../../../share/cache/render/aiagent/aiContent'

// A reactive reference to hold the list of chat messages
const messages = ref<ChatMessage[]>([
  // { id: Date.now(), text: '你好！有什么可以帮助你的吗？', sender: 'ai' }
])

// A reactive reference to track if the AI is currently thinking
const isLoading = ref(false)

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

  // 2. Set loading state
  isLoading.value = true
  // Add a placeholder for the AI response
  const aiMessagePlaceholder = {
    id: Date.now() + 1,
    text: '正在思考中...',
    sender: 'ai' as const
  }
  messages.value.push(aiMessagePlaceholder)

  try {
    // 3. 调用结构化接口，保留富结构
    const structured = await sendMessageStructuredApi(text)
    const parts = (structured?.parts ?? []) as AIContentPart[]
    const md = partsToMarkdown(parts)

    // 4. 用 Markdown 更新占位消息
    aiMessagePlaceholder.text = md
  } catch (error) {
    console.error('Error sending message to AI:', error)
    // Optionally, update the placeholder with an error message
    aiMessagePlaceholder.text = '抱歉，与AI通信时发生错误。'
  } finally {
    // 5. Reset loading state
    isLoading.value = false
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
