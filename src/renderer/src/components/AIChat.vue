<template>
  <div class="ai-chat-container">
    <!-- 头部工具栏 -->
    <div class="chat-header">
      <div class="header-left">
        <h3 class="chat-title">{{ currentSession?.title || 'AI助手' }}</h3>
        <span class="session-info" v-if="currentSession">
          {{ formatDate(currentSession.createdAt) }}
        </span>
      </div>
      <div class="header-right">
        <button 
          class="btn btn-secondary btn-sm"
          @click="showSettings = !showSettings"
          :class="{ active: showSettings }"
        >
          <i class="icon-settings"></i>
          设置
        </button>
        <button 
          class="btn btn-primary btn-sm"
          @click="createNewSession"
          :disabled="isLoading"
        >
          <i class="icon-plus"></i>
          新对话
        </button>
      </div>
    </div>

    <!-- 设置面板 -->
    <div class="settings-panel" v-if="showSettings">
      <div class="settings-content">
        <div class="setting-group">
          <label>模型提供商</label>
          <select v-model="config.currentModel.provider" @change="updateConfig">
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="deepseek">DeepSeek</option>
          </select>
        </div>
        <div class="setting-group">
          <label>模型名称</label>
          <input 
            type="text" 
            v-model="config.currentModel.modelName" 

            @blur="updateConfig"
            placeholder="输入模型名称"
          >
        </div>
        <div class="setting-group">
          <label>API密钥</label>
          <input 
            type="password" 
            v-model="config.currentModel.apiKey" 
            @blur="updateConfig"
            placeholder="输入API密钥"
          >
        </div>
        <div class="setting-group">
          <label>温度 ({{ config.currentModel.temperature }})</label>
          <input 
            type="range" 
            min="0" 
            max="2" 
            step="0.1" 
            v-model.number="config.currentModel.temperature"
            @input="updateConfig"
          >
        </div>
        <div class="setting-group">
          <label>最大令牌数</label>
          <input 
            type="number" 
            v-model.number="config.currentModel.maxTokens" 
            @blur="updateConfig"
            min="1"
            max="32000"
          >
        </div>
      </div>
    </div>

    <!-- 会话列表侧边栏 -->
    <div class="sessions-sidebar" v-if="showSessions">
      <div class="sidebar-header">
        <h4>对话历史</h4>
        <button class="btn-close" @click="showSessions = false">
          <i class="icon-close"></i>
        </button>
      </div>
      <div class="sessions-list">
        <div 
          v-for="session in sessions" 
          :key="session.id"
          class="session-item"
          :class="{ active: currentSession?.id === session.id }"
          @click="switchSession(session.id)"
        >
          <div class="session-title">{{ session.title }}</div>
          <div class="session-meta">
            <span class="session-date">{{ formatDate(session.updatedAt) }}</span>
            <span class="session-count">{{ session.metadata?.messageCount || session.messages.length || 0 }}条消息</span>
          </div>
          <div class="session-actions">
            <button 
              class="btn-action"
              @click.stop="editSessionTitle(session)"
              title="重命名"
            >
              <i class="icon-edit"></i>
            </button>
            <button 
              class="btn-action btn-danger"
              @click.stop="deleteSession(session.id)"
              title="删除"
            >
              <i class="icon-delete"></i>
            </button>
          </div>
        </div>
      </div>
      <div class="sidebar-footer">
        <button class="btn btn-secondary btn-sm" @click="clearAllSessions">
          清空所有对话
        </button>
      </div>
    </div>

    <!-- 主聊天区域 -->
    <div class="chat-main" :class="{ 'with-sidebar': showSessions }">
      <!-- 消息列表 -->
      <div class="messages-container" ref="messagesContainer">
        <div class="messages-list">
          <!-- 欢迎消息 -->
          <div v-if="messages.length === 0" class="welcome-message">
            <div class="welcome-content">
              <h2>👋 欢迎使用AI助手</h2>
              <p>我是您的智能助手，可以帮您解答问题、协助创作、分析数据等。</p>
              <div class="quick-actions">
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
                <div v-if="message.type === 'assistant' && message.metadata?.isStreaming" class="streaming-indicator">
                  <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
                <div class="message-text" v-html="formatMessageContent(message.content)"></div>
                <div v-if="message.metadata?.toolCalls && message.metadata.toolCalls.length > 0" class="tool-calls">
                  <div class="tool-calls-header">🔧 工具调用</div>
                  <div 
                    v-for="toolCall in message.metadata.toolCalls" 
                    :key="toolCall.id"
                    class="tool-call-item"
                  >
                    <div class="tool-call-name">{{ toolCall.name }}</div>
                    <div class="tool-call-args">{{ JSON.stringify(toolCall.arguments, null, 2) }}</div>
                  </div>
                </div>
              </div>
              <div class="message-actions" v-if="message.type === 'assistant'">
                <button 
                  class="btn-action"
                  @click="copyMessage(message.content)"
                  title="复制"
                >
                  <i class="icon-copy"></i>
                </button>
                <button 
                  class="btn-action"
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
          <div v-if="isLoading" class="loading-indicator">
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
          <button 
            class="btn-tool"
            @click="showSessions = !showSessions"
            :class="{ active: showSessions }"
            title="对话历史"
          >
            <i class="icon-history"></i>
          </button>
          <button 
            class="btn-tool"
            @click="clearCurrentSession"
            title="清空当前对话"
            :disabled="messages.length === 0"
          >
            <i class="icon-clear"></i>
          </button>
          <div class="token-counter" v-if="estimatedTokens > 0">
            约 {{ estimatedTokens }} tokens
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

    <!-- 状态栏 -->
    <div class="status-bar">
      <div class="status-left">
        <span class="status-item" v-if="agentState">
          <i class="icon-status" :class="getStatusIcon(agentState.status)"></i>
          {{ getStatusText(agentState.status) }}
        </span>
        <span class="status-item" v-if="currentSession">
          {{ currentSession.metadata?.messageCount || currentSession.messages.length || 0 }} 条消息
        </span>
      </div>
      <div class="status-right">
        <span class="status-item" v-if="tokenUsage">
          已用: {{ tokenUsage.totalTokens }} tokens
        </span>
        <span class="status-item">
          {{ config.currentModel.provider }} / {{ config.currentModel.modelName }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { aiAgentAPI } from '../services/ai-agent'
import type {
  AgentConfig,
  ChatMessage,
  ChatSession,
  AgentState,
  TokenUsage,
  ModelProvider
} from '../../../shared/types/agent'
import { MessageType } from '../../../shared/types/agent'

// 响应式数据
const messages = ref<ChatMessage[]>([])
const sessions = ref<ChatSession[]>([])
const currentSession = ref<ChatSession | null>(null)
const agentState = ref<AgentState | null>(null)
const tokenUsage = ref<TokenUsage | null>(null)
const inputMessage = ref('')
const isLoading = ref(false)
const showSettings = ref(false)
const showSessions = ref(false)
const estimatedTokens = ref(0)

// 配置
const config = reactive<AgentConfig>({
  currentModel: {
    provider: 'openai' as ModelProvider,
    modelName: 'gpt-4',
    apiKey: '',
    temperature: 0.7,
    maxTokens: 2000,
    maxRetries: 4,
    timeout: 200000,
    baseURL: '',
    displayName: 'GPT-3.5 Turbo',
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    stream: true, // 确保总是使用流式传输
    retries: 0,
    stop: []
  },
  availableModels: {},
  systemPrompt: '',
  contextWindowSize: 50,
  enablePersistence: true,
  enableMCPTools: true,
  enabledTools: []
})

// 快捷操作
const quickActions = [
  { text: '📝 帮我写作', message: '请帮我写一篇关于人工智能的文章' },
  { text: '💡 创意灵感', message: '给我一些创新的项目想法' },
  { text: '🔍 数据分析', message: '如何进行有效的数据分析？' },
  { text: '🛠️ 技术问题', message: '我遇到了一个技术问题，需要帮助' }
]

// 计算属性
const canSend = computed(() => {
  return inputMessage.value.trim().length > 0 && !isLoading.value
})

// 引用
const messagesContainer = ref<HTMLElement>()
const messageInput = ref<HTMLTextAreaElement>()

// 生命周期
onMounted(async () => {
  await initializeAIAgent()
  await loadSessions()
  setupEventListeners()
})

onUnmounted(() => {
  removeEventListeners()
})

// 监听输入变化，估算token数量
watch(inputMessage, async (newValue) => {
  if (newValue.trim()) {
    estimatedTokens.value = await aiAgentAPI.estimateTokens(newValue)
  } else {
    estimatedTokens.value = 0
  }
})

// 方法
async function initializeAIAgent() {
  try {
    const result = await aiAgentAPI.initialize(config)
    if (result.success) {
      agentState.value = await aiAgentAPI.getState()
      console.log('AI Agent初始化成功')
    } else {
      console.error('AI Agent初始化失败:', result.error)
    }
  } catch (error) {
    console.error('初始化AI Agent时出错:', error)
  }
}

async function loadSessions() {
  try {
    sessions.value = await aiAgentAPI.getAllSessions()
    if (sessions.value.length > 0) {
      await switchSession(sessions.value[0].id)
    }
  } catch (error) {
    console.error('加载会话列表失败:', error)
  }
}

async function createNewSession() {
  try {
    const session = await aiAgentAPI.createSession('新对话')
    if (session) {
      sessions.value.unshift(session)
      await switchSession(session.id)
    }
  } catch (error) {
    console.error('创建新会话失败:', error)
  }
}

async function switchSession(sessionId: string) {
  try {
    const session = sessions.value.find(s => s.id === sessionId)
    if (session) {
      currentSession.value = session
      messages.value = await aiAgentAPI.getSessionMessages(sessionId)
      await scrollToBottom()
    }
  } catch (error) {
    console.error('切换会话失败:', error)
  }
}

async function sendMessage() {
  if (!canSend.value) return

  const message = inputMessage.value.trim()
  inputMessage.value = ''
  isLoading.value = true

  try {
    // 添加用户消息
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: MessageType.USER,
      content: message,
      timestamp: Date.now()
    }
    messages.value.push(userMessage)
    await scrollToBottom()

    // 创建空的AI回复消息，用于流式更新
    const assistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      type: MessageType.ASSISTANT,
      content: '',
      timestamp: Date.now(),
      metadata: {
        isStreaming: true
      }
    }
    messages.value.push(assistantMessage)
    await scrollToBottom()

    // 发送消息到AI（流式传输）
    const result = await aiAgentAPI.sendMessage(message, currentSession.value?.id)
    
    if (!result.success) {
      // 更新错误消息
      assistantMessage.content = `抱歉，发生了错误: ${result.error || '未知错误'}`
      assistantMessage.metadata = { isStreaming: false }
    }
  } catch (error) {
    console.error('发送消息失败:', error)
    // 更新最后一条消息为错误消息
    const lastMessage = messages.value[messages.value.length - 1]
    if (lastMessage && lastMessage.type === MessageType.ASSISTANT) {
      lastMessage.content = '抱歉，发送消息时发生了错误，请稍后重试。'
      lastMessage.metadata = { isStreaming: false }
    }
  } finally {
    isLoading.value = false
    await scrollToBottom()
    await nextTick(() => {
      messageInput.value?.focus()
    })
  }
}

async function sendQuickMessage(message: string) {
  inputMessage.value = message
  await sendMessage()
}

async function regenerateMessage(index: number) {
  if (index <= 0 || index >= messages.value.length) return
  
  const userMessage = messages.value[index - 1]
  if (userMessage.type !== MessageType.USER) return

  // 移除之前的AI回复
  messages.value.splice(index)
  
  // 重新发送用户消息
  inputMessage.value = userMessage.content
  await sendMessage()
}

async function deleteSession(sessionId: string) {
  if (!confirm('确定要删除这个对话吗？')) return

  try {
    const success = await aiAgentAPI.deleteSession(sessionId)
    if (success) {
      sessions.value = sessions.value.filter(s => s.id !== sessionId)
      if (currentSession.value?.id === sessionId) {
        if (sessions.value.length > 0) {
          await switchSession(sessions.value[0].id)
        } else {
          currentSession.value = null
          messages.value = []
        }
      }
    }
  } catch (error) {
    console.error('删除会话失败:', error)
  }
}

async function clearCurrentSession() {
  if (!currentSession.value || !confirm('确定要清空当前对话吗？')) return

  try {
    await aiAgentAPI.deleteSession(currentSession.value.id)
    const newSession = await aiAgentAPI.createSession('新对话')
    if (newSession) {
      sessions.value = sessions.value.filter(s => s.id !== currentSession.value!.id)
      sessions.value.unshift(newSession)
      await switchSession(newSession.id)
    }
  } catch (error) {
    console.error('清空对话失败:', error)
  }
}

async function clearAllSessions() {
  if (!confirm('确定要清空所有对话吗？此操作不可恢复。')) return

  try {
    const success = await aiAgentAPI.clearAllSessions()
    if (success) {
      sessions.value = []
      currentSession.value = null
      messages.value = []
      await createNewSession()
    }
  } catch (error) {
    console.error('清空所有对话失败:', error)
  }
}

async function updateConfig() {
  try {
    const result = await aiAgentAPI.updateConfig(config)
    if (result.success) {
      agentState.value = await aiAgentAPI.getState()
      console.log('配置更新成功')
    } else {
      console.error('配置更新失败:', result.error)
    }
  } catch (error) {
    console.error('更新配置时出错:', error)
  }
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

function handleInput(event: Event) {
  const textarea = event.target as HTMLTextAreaElement
  textarea.style.height = 'auto'
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
}

async function scrollToBottom() {
  await nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
}

function copyMessage(content: string) {
  navigator.clipboard.writeText(content).then(() => {
    console.log('消息已复制到剪贴板')
  })
}

function editSessionTitle(session: ChatSession) {
  const newTitle = prompt('请输入新的对话标题:', session.title)
  if (newTitle && newTitle.trim() !== session.title) {
    aiAgentAPI.updateSessionTitle(session.id, newTitle.trim()).then(success => {
      if (success) {
        session.title = newTitle.trim()
      }
    })
  }
}

// 工具函数
function formatMessageContent(content: string): string {
  // 简单的Markdown渲染
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
}

function formatDate(date: number | Date): string {
  const targetDate = typeof date === 'number' ? new Date(date) : date
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(targetDate)
}

function formatTime(date: number | Date): string {
  const targetDate = typeof date === 'number' ? new Date(date) : date
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(targetDate)
}

function getMessageIcon(type: string): string {
  switch (type) {
    case 'user': return 'icon-user'
    case 'assistant': return 'icon-robot'
    case 'system': return 'icon-system'
    default: return 'icon-message'
  }
}

function getRoleName(type: string): string {
  switch (type) {
    case 'user': return '用户'
    case 'assistant': return 'AI助手'
    case 'system': return '系统'
    default: return '未知'
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'ready': return 'status-ready'
    case 'busy': return 'status-busy'
    case 'error': return 'status-error'
    default: return 'status-unknown'
  }
}

function getStatusText(status: string): string {
  switch (status) {
    case 'ready': return '就绪'
    case 'busy': return '忙碌'
    case 'error': return '错误'
    default: return '未知'
  }
}

// 事件监听
function setupEventListeners() {
  aiAgentAPI.addEventListener('state-changed', (state: AgentState) => {
    agentState.value = state
  })

  aiAgentAPI.addEventListener('message-received', (data: any) => {
    // 处理流式消息
    if (messages.value.length > 0) {
      const lastMessage = messages.value[messages.value.length - 1]
      if (lastMessage.type === MessageType.ASSISTANT) {
        // 追加内容
        if (data.content) {
          lastMessage.content += data.content
        }
        
        // 更新流式状态和元数据
        if (!lastMessage.metadata) {
          lastMessage.metadata = {}
        }
        lastMessage.metadata.isStreaming = !data.isComplete
        
        // 如果传输完成，更新最终数据
        if (data.isComplete) {
          if (data.toolCalls) {
            lastMessage.metadata.toolCalls = data.toolCalls
          }
          if (data.tokenUsage) {
            tokenUsage.value = data.tokenUsage
          }
          
          // 更新会话信息
          if (currentSession.value) {
            if (!currentSession.value.metadata) {
              currentSession.value.metadata = {}
            }
            currentSession.value.metadata.messageCount = messages.value.length
            currentSession.value.updatedAt = Date.now()
          }
        }
        
        // 自动滚动到底部
        scrollToBottom()
      }
    }
  })

  aiAgentAPI.addEventListener('error-occurred', (error: string) => {
    console.error('AI Agent错误:', error)
    // 更新最后一条消息的错误状态
    if (messages.value.length > 0) {
      const lastMessage = messages.value[messages.value.length - 1]
      if (lastMessage.type === MessageType.ASSISTANT && lastMessage.metadata?.isStreaming) {
        lastMessage.content = `抱歉，发生了错误: ${error}`
        lastMessage.metadata.isStreaming = false
      }
    }
  })
}

function removeEventListeners() {
  aiAgentAPI.removeAllEventListeners()
}
</script>

<style scoped>
.ai-chat-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f5f5f5;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* 头部工具栏 */
.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.chat-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.session-info {
  font-size: 12px;
  color: #666;
}

.header-right {
  display: flex;
  gap: 8px;
}

/* 按钮样式 */
.btn {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  background: white;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn:hover {
  background: #f8f9fa;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

.btn-primary:hover {
  background: #0056b3;
}

.btn-secondary {
  background: #6c757d;
  color: white;
  border-color: #6c757d;
}

.btn-secondary:hover {
  background: #545b62;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

.btn.active {
  background: #007bff;
  color: white;
}

/* 设置面板 */
.settings-panel {
  background: white;
  border-bottom: 1px solid #e0e0e0;
  padding: 16px;
}

.settings-content {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  max-width: 800px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-group label {
  font-size: 12px;
  font-weight: 500;
  color: #555;
}

.setting-group input,
.setting-group select {
  padding: 6px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

/* 会话侧边栏 */
.sessions-sidebar {
  position: fixed;
  left: 0;
  top: 0;
  width: 300px;
  height: 100vh;
  background: white;
  border-right: 1px solid #e0e0e0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #e0e0e0;
}

.sidebar-header h4 {
  margin: 0;
  font-size: 16px;
  color: #333;
}

.btn-close {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 4px;
  color: #666;
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.session-item {
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 4px;
  transition: background 0.2s;
}

.session-item:hover {
  background: #f8f9fa;
}

.session-item.active {
  background: #e3f2fd;
  border-left: 3px solid #007bff;
}

.session-title {
  font-weight: 500;
  margin-bottom: 4px;
  color: #333;
}

.session-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}

.session-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.session-item:hover .session-actions {
  opacity: 1;
}

.btn-action {
  background: none;
  border: none;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  color: #666;
  font-size: 12px;
}

.btn-action:hover {
  background: #e9ecef;
}

.btn-danger:hover {
  color: #dc3545;
  background: #f8d7da;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid #e0e0e0;
}

/* 主聊天区域 */
.chat-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  transition: margin-left 0.3s;
}

.chat-main.with-sidebar {
  margin-left: 300px;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.messages-list {
  max-width: 800px;
  margin: 0 auto;
}

/* 欢迎消息 */
.welcome-message {
  text-align: center;
  padding: 40px 20px;
}

.welcome-content h2 {
  color: #333;
  margin-bottom: 16px;
}

.welcome-content p {
  color: #666;
  margin-bottom: 24px;
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
  background: white;
  border: 1px solid #ddd;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.quick-action-btn:hover {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

/* 消息项 */
.message-item {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.message-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.user-message .message-avatar {
  background: #007bff;
  color: white;
}

.assistant-message .message-avatar {
  background: #28a745;
  color: white;
}

.system-message .message-avatar {
  background: #6c757d;
  color: white;
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.message-role {
  font-weight: 500;
  font-size: 12px;
  color: #666;
}

.message-time {
  font-size: 11px;
  color: #999;
}

.message-body {
  background: white;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid #e0e0e0;
  position: relative;
}

.user-message .message-body {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

.message-text {
  line-height: 1.5;
  word-wrap: break-word;
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
  background: #666;
  border-radius: 50%;
  animation: typing 1.4s infinite;
}

.typing-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% { opacity: 0.3; }
  30% { opacity: 1; }
}

.tool-calls {
  margin-top: 12px;
  padding: 8px;
  background: #f8f9fa;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}

.tool-calls-header {
  font-size: 12px;
  font-weight: 500;
  color: #666;
  margin-bottom: 8px;
}

.tool-call-item {
  margin-bottom: 8px;
}

.tool-call-name {
  font-weight: 500;
  font-size: 13px;
  color: #333;
  margin-bottom: 4px;
}

.tool-call-args {
  font-family: 'Courier New', monospace;
  font-size: 11px;
  color: #666;
  background: white;
  padding: 4px 6px;
  border-radius: 3px;
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

/* 加载指示器 */
.loading-indicator {
  display: flex;
  justify-content: center;
  padding: 20px;
}

.loading-content {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #666;
  font-size: 14px;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #e0e0e0;
  border-top: 2px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid #e0e0e0;
  border-top: 2px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 输入区域 */
.input-container {
  background: white;
  border-top: 1px solid #e0e0e0;
  padding: 16px;
}

.input-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  max-width: 800px;
  margin-left: auto;
  margin-right: auto;
}

.btn-tool {
  background: none;
  border: 1px solid #ddd;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  color: #666;
  transition: all 0.2s;
}

.btn-tool:hover {
  background: #f8f9fa;
}

.btn-tool.active {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

.token-counter {
  font-size: 12px;
  color: #666;
  padding: 4px 8px;
  background: #f8f9fa;
  border-radius: 4px;
}

.input-area {
  display: flex;
  gap: 12px;
  max-width: 800px;
  margin: 0 auto;
  align-items: flex-end;
}

.message-input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid #ddd;
  border-radius: 20px;
  font-size: 14px;
  line-height: 1.4;
  resize: none;
  outline: none;
  transition: border-color 0.2s;
  min-height: 44px;
  max-height: 120px;
}

.message-input:focus {
  border-color: #007bff;
}

.message-input:disabled {
  background: #f8f9fa;
  color: #666;
}

.send-button {
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: #007bff;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex-shrink: 0;
}

.send-button:hover {
  background: #0056b3;
  transform: scale(1.05);
}

.send-button:disabled {
  background: #ccc;
  cursor: not-allowed;
  transform: none;
}

.send-button.loading {
  background: #6c757d;
}

/* 状态栏 */
.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: #f8f9fa;
  border-top: 1px solid #e0e0e0;
  font-size: 12px;
  color: #666;
}

.status-left,
.status-right {
  display: flex;
  gap: 16px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-ready {
  background: #28a745;
}

.status-busy {
  background: #ffc107;
}

.status-error {
  background: #dc3545;
}

.status-unknown {
  background: #6c757d;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .sessions-sidebar {
    width: 100%;
  }
  
  .chat-main.with-sidebar {
    margin-left: 0;
  }
  
  .settings-content {
    grid-template-columns: 1fr;
  }
  
  .quick-actions {
    flex-direction: column;
    align-items: center;
  }
  
  .input-toolbar {
    flex-wrap: wrap;
    gap: 8px;
  }
}
</style>