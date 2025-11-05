import { ref, type Ref } from 'vue'

// Define the structure of a chat message
export interface ChatMessage {
  id: number
  text: string
  sender: 'user' | 'ai'
}

// A reactive reference to hold the list of chat messages
const messages = ref<ChatMessage[]>([
  { id: Date.now(), text: '你好！有什么可以帮助你的吗？', sender: 'ai' }
])

// A reactive reference to track if the AI is currently thinking
const isLoading = ref(false)

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
  };
  messages.value.push(aiMessagePlaceholder);


  try {
    // 3. Call the main process API
    const aiResponse = await window.api.sendMessage(text)

    // 4. Update the placeholder with the actual AI response
    aiMessagePlaceholder.text = aiResponse;

  } catch (error) {
    console.error('Error sending message to AI:', error)
    // Optionally, update the placeholder with an error message
    aiMessagePlaceholder.text = '抱歉，与AI通信时发生错误。';

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
} {
  return {
    messages,
    isLoading,
    sendMessage
  }
}