<template>
  <div class="chat-interface-container">
    <!-- 消息列表 -->
    <div class="messages-container" ref="messagesContainer">
      <div class="messages-list">
        <!-- 欢迎消息 -->
        <div v-if="messages.length === 0" class="welcome-message">
          <div class="welcome-content">
            <h2>👋 欢迎使用AI助手</h2>
            <p>我是您的智能助手，可以帮您解答问题、协助创作、分析数据等。</p>
            <div class="quick-actions" v-if="quickActions.length > 0">
              <button 
                v-for="action in quickActions" 
                :key="action.text"
                class="quick-action-btn"
                @click="sendQuickMessage(action.message)"
              >
                {{ action.text }}
              </button>
            </div>
          </div>
        </div>

        <!-- 消息列表 -->
        <div 
          v-for="(message, index) in messages" 
          :key="message.id"
          class="message-item"
          :class="{
            'user-message': message.type === 'user',
            'assistant-message': message.type === 'assistant',
            'system-message': message.type === 'system'
          }"
        >
          <div class="message-avatar">
            <i :class="getMessageIcon(message.type)"></i>
          </div>
          <div class="message-content">
            <div class="message-header">
              <span class="message-role">{{ getRoleName(message.type) }}</span>
              <span class="message-time">{{ formatTime(message.timestamp) }}</span>
            </div>
            <div class="message-body">
              <!-- 流式输入指示器 -->
              <div v-if="message.type === 'assistant' && isStreaming && index === messages.length - 1" class="streaming-indicator">
                <div class="typing-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
              
              <!-- 消息内容 -->
              <div class="message-text" v-html="formatMessageContent(message.content)"></div>
              
              <!-- 工具调用显示 -->
              <div v-if="message.metadata?.toolCalls && message.metadata.toolCalls.length > 0" class="tool-calls">
                <div class="tool-calls-header">🔧 工具调用</div>
                <div 
                  v-for="toolCall in message.metadata.toolCalls" 
                  :key="toolCall.id"
                  class="tool-call-item"
                >
                  <div class="tool-call-name">{{ toolCall.name }}</div>
                  <div class="tool-call-args">{{ formatToolArgs(toolCall.arguments) }}</div>
                </div>
              </div>
            </div>
            
            <!-- 消息操作按钮 -->
            <div class="message-actions" v-if="message.type === 'assistant'">
              <button 
                class="action-btn"
                @click="copyMessage(message.content)"
                title="复制"
              >
                <i class="icon-copy"></i>
              </button>
              <button 
                class="action-btn"
                @click="regenerateMessage(index)"
                title="重新生成"
                :disabled="isLoading"
              >
                <i class="icon-refresh"></i>
              </button>
            </div>
          </div>
        </div>

        <!-- 加载指示器 -->
        <div v-if="isLoading && !isStreaming" class="loading-indicator">
          <div class="loading-content">
            <div class="spinner"></div>
            <span>AI正在思考中...</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-container">
      <div class="input-toolbar">
        <div class="toolbar-left">
          <button 
            class="btn-tool"
            @click="attachFile"
            title="附加文件"
            :disabled="isLoading"
          >
            <i class="icon-attach"></i>
          </button>
          <button 
            class="btn-tool"
            @click="clearMessages"
            title="清空对话"
            :disabled="messages.length === 0 || isLoading"
          >
            <i class="icon-clear"></i>
          </button>
        </div>
        <div class="toolbar-right">
          <div class="token-counter" v-if="estimatedTokens > 0">
            约 {{ estimatedTokens }} tokens
          </div>
        </div>
      </div>
      
      <div class="input-area">
        <textarea 
          ref="messageInput"
          v-model="inputMessage"
          @keydown="handleKeyDown"
          @input="handleInput"
          placeholder="输入消息... (Shift+Enter换行，Enter发送)"
          class="message-input"
          :disabled="isLoading"
          rows="1"
        ></textarea>
        <button 
          class="send-button"
          @click="sendMessage"
          :disabled="!canSend"
          :class="{ loading: isLoading }"
        >
          <i v-if="!isLoading" class="icon-send"></i>
          <div v-else class="spinner-small"></div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { useAIAgent } from '../../composables/useAIAgent'
import type { ChatMessage } from '../../../../shared/cache-types/agent/agent'

// Props
interface Props {
  sessionId?: string
  quickActions?: Array<{ text: string; message: string }>
}

const props = withDefaults(defineProps<Props>(), {
  sessionId: '',
  quickActions: () => [
    { text: '📝 帮我写作', message: '请帮我写一篇关于人工智能的文章' },
    { text: '💡 创意灵感', message: '给我一些创新的项目想法' },
    { text: '🔍 数据分析', message: '如何进行有效的数据分析？' },
    { text: '🛠️ 技术问题', message: '我遇到了一个技术问题，需要帮助' }
  ]
})

// Emits
const emit = defineEmits<{
  'message-sent': [message: ChatMessage]
  'message-received': [message: ChatMessage]
  'messages-cleared': []
  'file-attached': [file: File]
}>()

// 使用AI Agent组合式API
const {
  currentSessionMessages: messages,
  isLoading,
  isStreaming,
  sendMessage: sendAIMessage,
  regenerateLastMessage,
  clearCurrentSession,
  estimateTokens
} = useAIAgent()

// 本地状态
const inputMessage = ref('')
const estimatedTokens = ref(0)

// 引用
const messagesContainer = ref<HTMLElement>()
const messageInput = ref<HTMLTextAreaElement>()

// 计算属性
const canSend = computed(() => {
  return inputMessage.value.trim().length > 0 && !isLoading.value
})

// 方法
const sendMessage = async () => {
  if (!canSend.value) return

  const messageText = inputMessage.value.trim()
  inputMessage.value = ''
  estimatedTokens.value = 0

  try {
    const userMessage: ChatMessage = {
      id: generateId(),
      type: 'user',
      content: messageText,
      timestamp: new Date().toISOString(),
      metadata: {}
    }

    emit('message-sent', userMessage)
    
    const response = await sendAIMessage(messageText)
    if (response) {
      emit('message-received', response)
    }
    
    await scrollToBottom()
  } catch (error) {
    console.error('发送消息失败:', error)
  }
}

const sendQuickMessage = (message: string) => {
  inputMessage.value = message
  sendMessage()
}

const copyMessage = async (content: string) => {
  try {
    await navigator.clipboard.writeText(content)
    // 可以添加提示消息
  } catch (error) {
    console.error('复制失败:', error)
  }
}

const regenerateMessage = async (index: number) => {
  try {
    const response = await regenerateLastMessage()
    if (response) {
      emit('message-received', response)
    }
  } catch (error) {
    console.error('重新生成消息失败:', error)
  }
}

const clearMessages = async () => {
  if (confirm('确定要清空当前对话吗？')) {
    try {
      await clearCurrentSession()
      emit('messages-cleared')
    } catch (error) {
      console.error('清空对话失败:', error)
    }
  }
}

const attachFile = () => {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.txt,.md,.pdf,.doc,.docx,.json'
  input.onchange = (e) => {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      emit('file-attached', file)
    }
  }
  input.click()
}

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

const handleInput = async () => {
  adjustTextareaHeight()
  
  if (inputMessage.value.trim()) {
    estimatedTokens.value = await estimateTokens(inputMessage.value)
  } else {
    estimatedTokens.value = 0
  }
}

const adjustTextareaHeight = () => {
  const textarea = messageInput.value
  if (textarea) {
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
  }
}

const scrollToBottom = async () => {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// 格式化方法
const getMessageIcon = (type: string): string => {
  switch (type) {
    case 'user': return 'icon-user'
    case 'assistant': return 'icon-bot'
    case 'system': return 'icon-system'
    default: return 'icon-message'
  }
}

const getRoleName = (type: string): string => {
  switch (type) {
    case 'user': return '用户'
    case 'assistant': return 'AI助手'
    case 'system': return '系统'
    default: return '未知'
  }
}

const formatTime = (timestamp: string | Date): string => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

const formatMessageContent = (content: string): string => {
  // 简单的Markdown渲染
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
}

const formatToolArgs = (args: any): string => {
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return String(args)
  }
}

const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

// 监听消息变化，自动滚动到底部
watch(messages, () => {
  scrollToBottom()
}, { deep: true })

// 监听输入变化，估算token数量
watch(inputMessage, async (newValue) => {
  if (newValue.trim()) {
    estimatedTokens.value = await estimateTokens(newValue)
  } else {
    estimatedTokens.value = 0
  }
})

// 生命周期
onMounted(() => {
  scrollToBottom()
})
</script>

<style scoped>
.chat-interface-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color, #ffffff);
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  background: var(--messages-bg, #f9fafb);
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-width: 800px;
  margin: 0 auto;
}

.welcome-message {
  text-align: center;
  padding: 40px 20px;
}

.welcome-content h2 {
  margin: 0 0 12px;
  color: var(--text-primary, #111827);
  font-size: 24px;
}

.welcome-content p {
  margin: 0 0 24px;
  color: var(--text-secondary, #6b7280);
  font-size: 16px;
}

.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}

.quick-action-btn {
  padding: 8px 16px;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 20px;
  background: var(--bg-color, #ffffff);
  color: var(--text-primary, #111827);
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.quick-action-btn:hover {
  background: var(--primary-color, #3b82f6);
  color: white;
  border-color: var(--primary-color, #3b82f6);
}

.message-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.user-message {
  flex-direction: row-reverse;
}

.user-message .message-content {
  background: var(--primary-color, #3b82f6);
  color: white;
  border-radius: 18px 18px 4px 18px;
}

.assistant-message .message-content {
  background: var(--bg-color, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 18px 18px 18px 4px;
}

.system-message .message-content {
  background: var(--warning-bg, #fef3c7);
  border: 1px solid var(--warning-border, #f59e0b);
  border-radius: 8px;
}

.message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--avatar-bg, #f3f4f6);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.message-content {
  max-width: 70%;
  padding: 12px 16px;
  position: relative;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
  font-size: 12px;
  opacity: 0.7;
}

.message-body {
  line-height: 1.5;
}

.streaming-indicator {
  margin-bottom: 8px;
}

.typing-dots {
  display: flex;
  gap: 4px;
}

.typing-dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-secondary, #6b7280);
  animation: typing 1.4s infinite ease-in-out;
}

.typing-dots span:nth-child(1) { animation-delay: -0.32s; }
.typing-dots span:nth-child(2) { animation-delay: -0.16s; }

@keyframes typing {
  0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}

.message-text {
  word-wrap: break-word;
}

.tool-calls {
  margin-top: 12px;
  padding: 12px;
  background: var(--code-bg, #f3f4f6);
  border-radius: 8px;
  font-size: 12px;
}

.tool-calls-header {
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-primary, #111827);
}

.tool-call-item {
  margin-bottom: 8px;
}

.tool-call-name {
  font-weight: 500;
  color: var(--primary-color, #3b82f6);
}

.tool-call-args {
  margin-top: 4px;
  padding: 8px;
  background: var(--bg-color, #ffffff);
  border-radius: 4px;
  font-family: monospace;
  white-space: pre-wrap;
}

.message-actions {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  opacity: 0;
  transition: opacity 0.2s;
}

.message-item:hover .message-actions {
  opacity: 1;
}

.action-btn {
  padding: 4px 8px;
  border: none;
  background: var(--hover-bg, #f3f4f6);
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary, #6b7280);
  transition: all 0.2s;
  font-size: 12px;
}

.action-btn:hover {
  background: var(--primary-color, #3b82f6);
  color: white;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-indicator {
  display: flex;
  justify-content: center;
  padding: 20px;
}

.loading-content {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--text-secondary, #6b7280);
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color, #e5e7eb);
  border-top: 2px solid var(--primary-color, #3b82f6);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.input-container {
  border-top: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-color, #ffffff);
}

.input-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-light, #f3f4f6);
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-tool {
  padding: 6px 8px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary, #6b7280);
  transition: all 0.2s;
}

.btn-tool:hover {
  background: var(--hover-bg, #f3f4f6);
  color: var(--text-primary, #111827);
}

.btn-tool:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.token-counter {
  font-size: 12px;
  color: var(--text-tertiary, #9ca3af);
  padding: 4px 8px;
  background: var(--badge-bg, #f3f4f6);
  border-radius: 12px;
}

.input-area {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  padding: 16px;
}

.message-input {
  flex: 1;
  min-height: 40px;
  max-height: 120px;
  padding: 10px 12px;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  background: var(--input-bg, #ffffff);
  transition: border-color 0.2s;
}

.message-input:focus {
  outline: none;
  border-color: var(--primary-color, #3b82f6);
  box-shadow: 0 0 0 3px var(--primary-color-alpha, rgba(59, 130, 246, 0.1));
}

.message-input:disabled {
  background: var(--disabled-bg, #f9fafb);
  cursor: not-allowed;
}

.send-button {
  width: 40px;
  height: 40px;
  border: none;
  border-radius: 8px;
  background: var(--primary-color, #3b82f6);
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.send-button:hover:not(:disabled) {
  background: var(--primary-hover, #2563eb);
}

.send-button:disabled {
  background: var(--disabled-bg, #d1d5db);
  cursor: not-allowed;
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 图标样式 */
.icon-user::before { content: '👤'; }
.icon-bot::before { content: '🤖'; }
.icon-system::before { content: '⚙️'; }
.icon-message::before { content: '💬'; }
.icon-copy::before { content: '📋'; }
.icon-refresh::before { content: '🔄'; }
.icon-attach::before { content: '📎'; }
.icon-clear::before { content: '🗑️'; }
.icon-send::before { content: '➤'; }
</style>