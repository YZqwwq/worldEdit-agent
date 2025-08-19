<template>
  <div class="ai-agent-container">
    <!-- 顶部导航栏 -->
    <header class="ai-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m12 19-7-7 7-7"/>
            <path d="m19 12H5"/>
          </svg>
        </button>
        <h1 class="page-title">AI 智能助手</h1>
      </div>
      <div class="header-right">
        <button class="header-btn" @click="showModelConfig = true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="m12 1 2.09 2.09L16.18 1 17 1.82l-2.09 2.09L17 6l-1.82.82-2.09-2.09L11 6.91 9.91 4.82 7.82 6.91 6 6l2.09-2.09L6 1.82 6.82 1l2.09 2.09L11 1.82 12 1z"/>
          </svg>
          模型配置
        </button>
        <button class="header-btn" @click="showHistory = !showHistory">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 3v5h5"/>
            <path d="m3 8 9-5 9 5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          历史记录
        </button>
        <button class="header-btn" @click="clearChat">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18"/>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
          清空对话
        </button>
      </div>
    </header>

    <div class="ai-main">
      <!-- 左侧：对话区域 -->
      <div class="chat-section" :class="{ 'with-history': showHistory }">
        <!-- 模型状态栏 -->
        <div class="model-status">
          <div class="model-info">
            <div class="model-name">{{ modelConfig.displayName || modelConfig.modelName || '未配置模型' }}</div>
            <div class="model-provider">{{ modelConfig.provider || 'openai' }}</div>
          </div>
          <div class="connection-status" :class="connectionStatus">
            <div class="status-dot"></div>
            <span>{{ getStatusText(connectionStatus) }}</span>
          </div>
        </div>

        <!-- 对话消息区域 -->
        <div class="messages-container" ref="messagesContainer">
          <div v-if="messages.length === 0" class="empty-chat">
            <div class="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
              </svg>
            </div>
            <h3>开始与AI对话</h3>
            <p>您可以询问任何问题，我会尽力为您提供帮助</p>
            <div class="quick-prompts">
              <button 
                v-for="prompt in quickPrompts" 
                :key="prompt.id"
                class="quick-prompt-btn"
                @click="sendQuickPrompt(prompt.text)"
              >
                {{ prompt.text }}
              </button>
            </div>
          </div>

          <div v-else class="messages-list">
            <div 
              v-for="message in messages" 
              :key="message.id"
              class="message-item"
              :class="message.type"
            >
              <div class="message-avatar">
                <div v-if="message.type === 'user'" class="user-avatar">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <div v-else class="ai-avatar">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                  </svg>
                </div>
              </div>
              <div class="message-content">
                <div class="message-text" v-html="formatMessage(message.content)"></div>
                <div class="message-meta">
                  <span class="message-time">{{ formatTime(message.timestamp) }}</span>
                  <div v-if="message.type === MessageType.ASSISTANT && message.metadata?.tokenUsage" class="token-usage">
                  <span>Tokens: {{ message.metadata.tokenUsage.totalTokens }}</span>
                </div>
                </div>
              </div>
              <div class="message-actions">
                <button class="action-btn" @click="copyMessage(message.content)" title="复制">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
                    <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
                  </svg>
                </button>
                <button v-if="message.type === 'assistant'" class="action-btn" @click="regenerateResponse(message)" title="重新生成">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
                    <path d="M21 3v5h-5"/>
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
                    <path d="M3 21v-5h5"/>
                  </svg>
                </button>
              </div>
            </div>

            <!-- 正在输入指示器 -->
            <div v-if="isTyping" class="message-item assistant typing">
              <div class="message-avatar">
                <div class="ai-avatar">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
                  </svg>
                </div>
              </div>
              <div class="message-content">
                <div class="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 输入区域 -->
        <div class="input-section">
          <div class="input-container">
            <textarea
              v-model="inputMessage"
              ref="messageInput"
              class="message-input"
              placeholder="输入您的问题..."
              rows="1"
              @keydown="handleKeyDown"
              @input="adjustTextareaHeight"
              :disabled="isTyping"
            ></textarea>
            <div class="input-actions">
              <button class="input-btn" @click="attachFile" title="附加文件">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
              </button>
              <button 
                class="send-btn" 
                @click="sendMessage" 
                :disabled="!inputMessage.trim() || isTyping"
                :class="{ active: inputMessage.trim() }"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="m22 2-7 20-4-9-9-4Z"/>
                  <path d="M22 2 11 13"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="input-footer">
            <div class="token-info">
              <span>字符数: {{ inputMessage.length }}</span>
              <span v-if="estimatedTokens > 0">预估Tokens: {{ estimatedTokens }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：历史记录 -->
      <div v-if="showHistory" class="history-section">
        <div class="history-header">
          <h3>对话历史</h3>
          <button class="close-history" @click="showHistory = false">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m18 6-12 12"/>
              <path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
        <div class="history-list">
          <div 
            v-for="session in chatSessions" 
            :key="session.id"
            class="history-item"
            :class="{ active: session.id === currentSessionId }"
            @click="loadSession(session.id)"
          >
            <div class="session-info">
              <h4>{{ session.title || '新对话' }}</h4>
              <p>{{ formatDate(session.updatedAt) }}</p>
              <div class="session-stats">
                <span>{{ session.messages.length }} 条消息</span>
              </div>
            </div>
            <div class="session-actions">
              <button class="session-action" @click.stop="renameSession(session)" title="重命名">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>
                </svg>
              </button>
              <button class="session-action danger" @click.stop="deleteSession(session.id)" title="删除">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 6h18"/>
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                </svg>
              </button>
            </div>
          </div>
          <div v-if="chatSessions.length === 0" class="empty-history">
            <p>暂无对话历史</p>
          </div>
        </div>
        <div class="history-footer">
          <button class="new-session-btn" @click="createNewSession">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14"/>
              <path d="M5 12h14"/>
            </svg>
            新建对话
          </button>
        </div>
      </div>
    </div>

    <!-- 模型配置对话框 -->
    <div v-if="showModelConfig" class="dialog-overlay" @click="closeModelConfig">
      <div class="dialog model-config-dialog" @click.stop>
        <div class="dialog-header">
          <h3>模型配置</h3>
          <button class="dialog-close" @click="closeModelConfig">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="m18 6-12 12"/>
              <path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>
        
        <div class="dialog-content">
          <div class="config-section">
            <h4>API 配置</h4>
            <div class="api-config">
              <div class="config-item">
                <label>API Key</label>
                <div class="input-group">
                  <input 
                    type="password" 
                    v-model="modelConfig.apiKey"
                    class="api-key-input"
                    placeholder="请输入您的API Key"
                  />
                  <button 
                    type="button" 
                    class="toggle-visibility"
                    @click="toggleApiKeyVisibility"
                  >
                    <svg v-if="showApiKey" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <path d="M1 1l22 22"/>
                    </svg>
                  </button>
                </div>
                <p class="config-desc">请输入对应模型提供商的API密钥</p>
              </div>
              
              <div class="config-item">
                 <label>Base URL (可选)</label>
                 <input 
                   type="text" 
                   v-model="modelConfig.baseURL"
                   class="base-url-input"
                   placeholder="https://api.openai.com/v1 (留空使用默认)"
                 />
                 <p class="config-desc">自定义API端点，支持代理或第三方服务</p>
               </div>
            </div>
          </div>

          <div class="config-section">
            <h4>模型配置</h4>
            <div class="model-config">
              <div class="config-item">
                <label>模型提供商</label>
                <select 
                  v-model="modelConfig.provider"
                  class="provider-select"
                >
                  <option value="openai">OpenAI</option>
                  <option value="claude">Anthropic (Claude)</option>
                  <option value="deepseek">DeepSeek</option>
                  <option value="other">其他</option>
                </select>
                <p class="config-desc">选择AI模型的提供商</p>
              </div>
              
              <div class="config-item">
                <label>模型名称</label>
                <input 
                  type="text" 
                  v-model="modelConfig.modelName"
                  class="model-name-input"
                  placeholder="例如: gpt-4, claude-3-opus, deepseek-chat"
                />
                <p class="config-desc">输入具体的模型名称，支持任意AI模型</p>
              </div>
              
              <div class="config-item">
                <label>模型显示名称 (可选)</label>
                <input 
                  type="text" 
                  v-model="modelConfig.displayName"
                  class="model-display-name-input"
                  placeholder="自定义显示名称，留空则使用模型名称"
                />
                <p class="config-desc">在界面中显示的友好名称</p>
              </div>
            </div>
          </div>

          <div class="config-section">
            <h4>参数设置</h4>
            <div class="config-grid">
              <div class="config-item">
                <label>Temperature (创造性)</label>
                <div class="slider-container">
                  <input 
                    type="range" 
                    v-model="modelConfig.temperature" 
                    min="0" 
                    max="2" 
                    step="0.1"
                    class="slider"
                  />
                  <span class="slider-value">{{ modelConfig.temperature }}</span>
                </div>
                <p class="config-desc">控制回答的创造性，值越高越有创意</p>
              </div>
              
              <div class="config-item">
                <label>Max Tokens (最大长度)</label>
                <div class="slider-container">
                  <input 
                    type="range" 
                    v-model="modelConfig.maxTokens" 
                    min="100" 
                    max="4000" 
                    step="100"
                    class="slider"
                  />
                  <span class="slider-value">{{ modelConfig.maxTokens }}</span>
                </div>
                <p class="config-desc">限制单次回答的最大长度</p>
              </div>
              
              <div class="config-item">
                <label>Top P (核心采样)</label>
                <div class="slider-container">
                  <input 
                    type="range" 
                    v-model="modelConfig.topP" 
                    min="0" 
                    max="1" 
                    step="0.05"
                    class="slider"
                  />
                  <span class="slider-value">{{ modelConfig.topP }}</span>
                </div>
                <p class="config-desc">控制词汇选择的多样性</p>
              </div>
            </div>
          </div>

          <div class="config-section">
            <h4>系统提示词</h4>
            <textarea 
              v-model="modelConfig.systemPrompt"
              class="system-prompt-input"
              placeholder="输入系统提示词来定制AI的行为..."
              rows="4"
            ></textarea>
          </div>
        </div>
        
        <div class="dialog-actions">
          <button class="btn btn-secondary" @click="resetConfig">重置</button>
          <button class="btn btn-primary" @click="saveConfig">保存配置</button>
        </div>
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import type { ChatMessage, ModelConfig, ChatSession, TokenUsage, AgentStatus } from '../types/agent'
import { ModelProvider, MessageType } from '../types/agent'

const router = useRouter()

// 响应式数据
const showModelConfig = ref(false)
const showHistory = ref(false)
const loading = ref(false)
const isTyping = ref(false)
const inputMessage = ref('')
const messages = ref<ChatMessage[]>([])
const currentSessionId = ref<string>('')
const connectionStatus = ref<'connected' | 'disconnected' | 'connecting'>('disconnected')
const showApiKey = ref(false)

// 引用
const messagesContainer = ref<HTMLElement>()
const messageInput = ref<HTMLTextAreaElement>()

// 模型配置
const modelConfig = ref({
  provider: 'openai' as ModelProvider,
  apiKey: '',
  modelName: 'gpt-4',
  displayName: '',
  baseURL: '',
  temperature: 0.7,
  maxTokens: 2000,
  maxRetries: 3,
  timeout: 30000,
  topP: 0.9,
  systemPrompt: '你是一个有用的AI助手，请用中文回答问题。'
})



// 对话会话列表
const chatSessions = ref<ChatSession[]>([])

// 快速提示词
const quickPrompts = ref([
  { id: 1, text: '帮我写一个故事' },
  { id: 2, text: '解释一个概念' },
  { id: 3, text: '代码调试帮助' },
  { id: 4, text: '翻译文本' }
])

// 计算属性
const estimatedTokens = computed(() => {
  return Math.ceil(inputMessage.value.length / 4)
})

// 辅助函数：创建纯净的模型配置对象副本
const createCleanModelConfig = () => {
  return {
    provider: modelConfig.value.provider,
    apiKey: modelConfig.value.apiKey,
    modelName: modelConfig.value.modelName,
    displayName: modelConfig.value.displayName,
    baseURL: modelConfig.value.baseURL,
    temperature: modelConfig.value.temperature,
    maxTokens: modelConfig.value.maxTokens,
    maxRetries: modelConfig.value.maxRetries,
    timeout: modelConfig.value.timeout,
    topP: modelConfig.value.topP,
    systemPrompt: modelConfig.value.systemPrompt
  }
}

// 方法
const goBack = () => {
  router.go(-1)
}

const getStatusText = (status: string) => {
  const statusMap = {
    connected: '已连接',
    disconnected: '未连接',
    connecting: '连接中'
  }
  return statusMap[status as keyof typeof statusMap] || '未知'
}

const sendQuickPrompt = (prompt: string) => {
  inputMessage.value = prompt
  sendMessage()
}

const sendMessage = async () => {
  if (!inputMessage.value.trim() || isTyping.value) return
  
  const userMessage: ChatMessage = {
    id: Date.now().toString(),
    type: MessageType.USER,
    content: inputMessage.value.trim(),
    timestamp: Date.now()
  }
  
  messages.value.push(userMessage)
  const messageContent = inputMessage.value.trim()
  inputMessage.value = ''
  isTyping.value = true
  
  await nextTick()
  scrollToBottom()
  
  try {
    // 通过IPC发送消息到主进程
    const result = await window.electron.ipcRenderer.invoke(
      'ai-agent:send-message',
      messageContent,
      currentSessionId.value
    )
    
    if (result.success && result.data) {
      // 如果没有当前会话，创建新会话
      if (!currentSessionId.value && result.data.sessionId) {
        currentSessionId.value = result.data.sessionId
        const newSessions = await window.electron.ipcRenderer.invoke(
          'ai-agent:get-all-sessions'
        )
        const session = newSessions.find((s: ChatSession) => s.id === result.data.sessionId)
        if (session) {
          chatSessions.value.unshift(session)
        }
      }
      
      // AI回复会通过事件监听器接收
    } else {
      throw new Error(result.error || '发送消息失败')
    }
    
  } catch (error) {
    console.error('发送消息失败:', error)
    // 添加错误消息
    const errorMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      type: MessageType.ASSISTANT,
      content: `抱歉，发送消息时出现错误：${error instanceof Error ? error.message : '未知错误'}`,
      timestamp: Date.now()
    }
    messages.value.push(errorMessage)
    await nextTick()
    scrollToBottom()
  } finally {
    isTyping.value = false
  }
}

const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

const adjustTextareaHeight = () => {
  const textarea = messageInput.value
  if (textarea) {
    textarea.style.height = 'auto'
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'
  }
}

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

const formatMessage = (content: string) => {
  // 简单的markdown渲染
  return content
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const copyMessage = async (content: string) => {
  try {
    await navigator.clipboard.writeText(content)
    // 可以添加提示
  } catch (error) {
    console.error('复制失败:', error)
  }
}

const regenerateResponse = (message: ChatMessage) => {
  // 重新生成回复的逻辑
  console.log('重新生成回复:', message)
}

const clearChat = () => {
  if (confirm('确定要清空当前对话吗？')) {
    messages.value = []
  }
}

const attachFile = () => {
  // 文件附加逻辑
  console.log('附加文件')
}

// 模型配置相关
const closeModelConfig = () => {
  showModelConfig.value = false
}

const toggleApiKeyVisibility = () => {
  showApiKey.value = !showApiKey.value
  // 切换输入框类型
  const input = document.querySelector('.api-key-input') as HTMLInputElement
  if (input) {
    input.type = showApiKey.value ? 'text' : 'password'
  }
}

const resetConfig = () => {
  modelConfig.value = {
    provider: ModelProvider.OPENAI,
    apiKey: '',
    modelName: 'gpt-4',
    displayName: '',
    baseURL: '',
    temperature: 0.7,
    maxTokens: 2000,
    maxRetries: 3,
    timeout: 30000,
    topP: 0.9,
    systemPrompt: '你是一个有用的AI助手，请用中文回答问题。'
  }
}

const saveConfig = () => {
  // 验证API Key
  if (!modelConfig.value.apiKey.trim()) {
    alert('请输入API Key')
    return
  }
  
  // 保存配置到本地存储
  try {
    const cleanConfig = createCleanModelConfig()
    localStorage.setItem('ai-agent-config', JSON.stringify(cleanConfig))
    console.log('配置已保存:', cleanConfig)
    showModelConfig.value = false
    alert('配置保存成功！')
  } catch (error) {
    console.error('保存配置失败:', error)
    alert('保存配置失败，请重试')
  }
}

// 历史记录相关
const loadSession = async (sessionId: string) => {
  currentSessionId.value = sessionId
  
  try {
    // 从主进程加载会话消息
    const sessionMessages = await window.electron.ipcRenderer.invoke(
      'ai-agent:get-session-messages',
      sessionId
    )
    messages.value = sessionMessages || []
    
    // 滚动到底部
    await nextTick()
    scrollToBottom()
  } catch (error) {
    console.error('加载会话消息失败:', error)
    messages.value = []
  }
}

const createNewSession = async () => {
  try {
    // 通过IPC创建新会话
    const newSession = await window.electron.ipcRenderer.invoke(
      'ai-agent:create-session',
      '新对话'
    )
    
    if (newSession) {
      chatSessions.value.unshift(newSession)
      await loadSession(newSession.id)
      showHistory.value = false
    }
  } catch (error) {
    console.error('创建新会话失败:', error)
    // 如果创建失败，回退到本地创建
    messages.value = []
    currentSessionId.value = ''
    showHistory.value = false
  }
}

const renameSession = (session: ChatSession) => {
  const newTitle = prompt('请输入新的会话名称:', session.title)
  if (newTitle && newTitle.trim()) {
    session.title = newTitle.trim()
  }
}

const deleteSession = (sessionId: string) => {
  if (confirm('确定要删除这个会话吗？')) {
    const index = chatSessions.value.findIndex(s => s.id === sessionId)
    if (index > -1) {
      chatSessions.value.splice(index, 1)
    }
  }
}

// 加载保存的配置
const loadSavedConfig = () => {
  try {
    const savedConfig = localStorage.getItem('ai-agent-config')
    if (savedConfig) {
      const config = JSON.parse(savedConfig)
      modelConfig.value = { ...modelConfig.value, ...config }
      console.log('已加载保存的配置:', config)
    }
  } catch (error) {
    console.error('加载配置失败:', error)
  }
}

// 设置IPC事件监听器
const setupIPCListeners = () => {
  // 监听AI回复消息
  window.electron.ipcRenderer.on('ai-agent:message-received', (event, data) => {
    if (data.response) {
      const assistantMessage: ChatMessage = {
        id: data.messageId || (Date.now() + 1).toString(),
        type: MessageType.ASSISTANT,
        content: data.response.content || data.response,
        timestamp: Date.now(),
        metadata: data.response.metadata
      }
      
      messages.value.push(assistantMessage)
      nextTick(() => {
        scrollToBottom()
      })
    }
  })
  
  // 监听状态变化
  window.electron.ipcRenderer.on('ai-agent:state-changed', (event, state) => {
    console.log('AI Agent状态变化:', state)
  })
  
  // 监听错误事件
  window.electron.ipcRenderer.on('ai-agent:error-occurred', (event, error) => {
    console.error('AI Agent错误:', error)
    const errorMessage: ChatMessage = {
      id: Date.now().toString(),
      type: MessageType.ASSISTANT,
      content: `系统错误：${error}`,
      timestamp: Date.now()
    }
    messages.value.push(errorMessage)
    nextTick(() => {
      scrollToBottom()
    })
  })
}

// 初始化AI Agent服务
const initializeAIAgent = async () => {
  try {
    // 创建一个纯净的配置对象副本，避免传递响应式代理
    const cleanModelConfig = createCleanModelConfig()
    
    const result = await window.electron.ipcRenderer.invoke('ai-agent:initialize', {
      currentModel: cleanModelConfig,
      availableModels: {},
      systemPrompt: '你是一个有用的AI助手。当用户询问你无法直接获取的信息（如实时天气、股价等）时，请礼貌地说明你无法获取这些实时信息，并建议用户通过其他方式获取。对于你能够回答的问题，请尽力提供有用的帮助。',
      contextWindowSize: 20,
      enablePersistence: true,
      enableMCPTools: false,
      enabledTools: []
    })
    
    if (!result.success) {
      console.error('AI Agent初始化失败:', result.error)
    } else {
      console.log('AI Agent初始化成功')
      // 加载现有会话
      loadSessions()
    }
  } catch (error) {
    console.error('初始化AI Agent时出错:', error)
  }
}

// 加载会话列表
const loadSessions = async () => {
  try {
    const sessions = await window.electron.ipcRenderer.invoke('ai-agent:get-all-sessions')
    chatSessions.value = sessions || []
  } catch (error) {
    console.error('加载会话失败:', error)
  }
}

// 生命周期
onMounted(() => {
  // 加载保存的配置
  loadSavedConfig()
  
  // 设置IPC事件监听器
  setupIPCListeners()
  
  // 初始化AI Agent服务
  initializeAIAgent()
  
  // 初始化连接状态检查
  connectionStatus.value = 'connecting'
  setTimeout(() => {
    connectionStatus.value = 'connected'
  }, 1000)
})

onUnmounted(() => {
  // 移除IPC事件监听器
  window.electron.ipcRenderer.removeAllListeners('ai-agent:message-received')
  window.electron.ipcRenderer.removeAllListeners('ai-agent:state-changed')
  window.electron.ipcRenderer.removeAllListeners('ai-agent:error-occurred')
})
</script>

<style scoped>
.ai-agent-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  background: #f8f9fa;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
}

/* 顶部导航栏 */
.ai-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: white;
  border-bottom: 1px solid #e9ecef;
  box-shadow: 0 2px 4px rgba(0,0,0,0.04);
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: none;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  color: #6c757d;
}

.back-btn:hover {
  background: #f8f9fa;
  border-color: #3498db;
  color: #3498db;
}

.page-title {
  font-size: 20px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: none;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 13px;
  color: #495057;
}

.header-btn:hover {
  background: #f8f9fa;
  border-color: #3498db;
  color: #3498db;
}

/* 主要内容区域 */
.ai-main {
  display: flex;
  flex: 1;
  min-height: 0;
}

.chat-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: white;
  transition: all 0.3s;
}

.chat-section.with-history {
  border-right: 1px solid #e9ecef;
}

/* 模型状态栏 */
.model-status {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: #f8f9fa;
  border-bottom: 1px solid #e9ecef;
}

.model-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-name {
  font-weight: 600;
  color: #2c3e50;
  font-size: 14px;
}

.model-provider {
  font-size: 12px;
  color: #6c757d;
  background: #e9ecef;
  padding: 2px 6px;
  border-radius: 4px;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #dc3545;
}

.connection-status.connected .status-dot {
  background: #28a745;
}

.connection-status.connecting .status-dot {
  background: #ffc107;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 消息区域 */
.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.empty-chat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: #6c757d;
}

.empty-icon {
  color: #adb5bd;
  margin-bottom: 20px;
}

.empty-chat h3 {
  font-size: 18px;
  font-weight: 500;
  margin: 0 0 8px 0;
  color: #495057;
}

.empty-chat p {
  font-size: 14px;
  margin: 0 0 24px 0;
}

.quick-prompts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  max-width: 500px;
}

.quick-prompt-btn {
  padding: 8px 16px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 20px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 13px;
  color: #495057;
}

.quick-prompt-btn:hover {
  background: #e9ecef;
  border-color: #3498db;
  color: #3498db;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.message-item {
  display: flex;
  gap: 12px;
  max-width: 85%;
}

.message-item.user {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.message-avatar {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-avatar {
  background: #3498db;
  color: white;
}

.ai-avatar {
  background: #e9ecef;
  color: #495057;
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-text {
  background: #f8f9fa;
  padding: 12px 16px;
  border-radius: 12px;
  line-height: 1.5;
  word-wrap: break-word;
}

.message-item.user .message-text {
  background: #3498db;
  color: white;
}

.message-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 4px;
  font-size: 11px;
  color: #6c757d;
}

.token-usage {
  font-size: 10px;
  color: #adb5bd;
}

.message-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.3s;
}

.message-item:hover .message-actions {
  opacity: 1;
}

.action-btn {
  width: 28px;
  height: 28px;
  background: none;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  color: #6c757d;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-btn:hover {
  background: #f8f9fa;
  border-color: #3498db;
  color: #3498db;
}

/* 正在输入指示器 */
.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
  background: #f8f9fa;
  border-radius: 12px;
}

.typing-indicator span {
  width: 8px;
  height: 8px;
  background: #adb5bd;
  border-radius: 50%;
  animation: typing 1.4s infinite;
}

.typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% {
    transform: translateY(0);
  }
  30% {
    transform: translateY(-10px);
  }
}

/* 输入区域 */
.input-section {
  padding: 16px 20px;
  border-top: 1px solid #e9ecef;
  background: white;
}

.input-container {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  background: #f8f9fa;
  border: 2px solid #e9ecef;
  border-radius: 12px;
  padding: 8px;
  transition: border-color 0.3s;
}

.input-container:focus-within {
  border-color: #3498db;
}

.message-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  resize: none;
  font-size: 14px;
  line-height: 1.5;
  padding: 8px 12px;
  min-height: 20px;
  max-height: 120px;
}

.input-actions {
  display: flex;
  gap: 4px;
}

.input-btn {
  width: 36px;
  height: 36px;
  background: none;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  color: #6c757d;
  display: flex;
  align-items: center;
  justify-content: center;
}

.input-btn:hover {
  background: #e9ecef;
  color: #495057;
}

.send-btn {
  width: 36px;
  height: 36px;
  background: #e9ecef;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  color: #6c757d;
  display: flex;
  align-items: center;
  justify-content: center;
}

.send-btn.active {
  background: #3498db;
  color: white;
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.input-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  font-size: 11px;
  color: #6c757d;
}

.token-info {
  display: flex;
  gap: 16px;
}

/* 历史记录区域 */
.history-section {
  width: 320px;
  background: white;
  display: flex;
  flex-direction: column;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e9ecef;
}

.history-header h3 {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0;
}

.close-history {
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  color: #6c757d;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-history:hover {
  background: #f8f9fa;
  color: #495057;
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  border: 1px solid transparent;
  margin-bottom: 4px;
}

.history-item:hover {
  background: #f8f9fa;
  border-color: #e9ecef;
}

.history-item.active {
  background: #e8f4fd;
  border-color: #3498db;
}

.session-info {
  flex: 1;
  min-width: 0;
}

.session-info h4 {
  font-size: 13px;
  font-weight: 500;
  color: #2c3e50;
  margin: 0 0 4px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-info p {
  font-size: 11px;
  color: #6c757d;
  margin: 0 0 4px 0;
}

.session-stats {
  font-size: 10px;
  color: #adb5bd;
}

.session-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.3s;
}

.history-item:hover .session-actions {
  opacity: 1;
}

.session-action {
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s;
  color: #6c757d;
  display: flex;
  align-items: center;
  justify-content: center;
}

.session-action:hover {
  background: #e9ecef;
  color: #495057;
}

.session-action.danger:hover {
  background: #dc3545;
  color: white;
}

.empty-history {
  padding: 40px 20px;
  text-align: center;
  color: #adb5bd;
  font-size: 13px;
}

.history-footer {
  padding: 16px;
  border-top: 1px solid #e9ecef;
}

.new-session-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 13px;
  color: #495057;
  font-weight: 500;
}

.new-session-btn:hover {
  background: #e9ecef;
  border-color: #3498db;
  color: #3498db;
}

/* 模型配置对话框 */
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 800px;
  max-height: 80vh;
  overflow-y: auto;
}

.model-config-dialog {
  max-width: 900px;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e9ecef;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
}

.dialog-close {
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s;
  color: #6c757d;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-close:hover {
  background: #f8f9fa;
  color: #495057;
}

.dialog-content {
  padding: 20px;
}

.config-section {
  margin-bottom: 32px;
}

.config-section h4 {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 16px 0;
}

.model-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.model-card {
  padding: 16px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
}

.model-card:hover {
  border-color: #3498db;
}

.model-card.active {
  border-color: #3498db;
  background: #e8f4fd;
}

.model-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.model-header h5 {
  font-size: 14px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0;
}

.model-description {
  font-size: 13px;
  color: #6c757d;
  margin: 0 0 12px 0;
  line-height: 1.4;
}

.model-specs {
  display: flex;
  gap: 12px;
  font-size: 11px;
  color: #adb5bd;
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.config-item label {
  font-size: 14px;
  font-weight: 500;
  color: #2c3e50;
}

.api-config {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.model-config {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.provider-select,
.model-name-input,
.model-display-name-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.3s;
  background: white;
}

.provider-select:focus,
.model-name-input:focus,
.model-display-name-input:focus {
  border-color: #3498db;
}

.provider-select {
  cursor: pointer;
}

.model-name-input::placeholder,
.model-display-name-input::placeholder {
  color: #adb5bd;
  font-style: italic;
}

.input-group {
  display: flex;
  align-items: center;
  position: relative;
}

.api-key-input,
.base-url-input {
  width: 100%;
  padding: 12px 16px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.3s;
  font-family: 'Consolas', 'Monaco', monospace;
}

.api-key-input {
  padding-right: 48px;
}

.api-key-input:focus,
.base-url-input:focus {
  border-color: #3498db;
}

.toggle-visibility {
  position: absolute;
  right: 12px;
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  cursor: pointer;
  color: #6c757d;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.3s;
}

.toggle-visibility:hover {
  background: #f8f9fa;
  color: #495057;
}

.slider-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider {
  flex: 1;
  height: 6px;
  background: #e9ecef;
  border-radius: 3px;
  outline: none;
  -webkit-appearance: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  background: #3498db;
  border-radius: 50%;
  cursor: pointer;
}

.slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: #3498db;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.slider-value {
  font-size: 13px;
  font-weight: 500;
  color: #495057;
  min-width: 40px;
  text-align: center;
}

.config-desc {
  font-size: 12px;
  color: #6c757d;
  margin: 0;
  line-height: 1.4;
}

.system-prompt-input {
  width: 100%;
  padding: 12px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
  outline: none;
  transition: border-color 0.3s;
  font-family: inherit;
}

.system-prompt-input:focus {
  border-color: #3498db;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  padding: 20px;
  border-top: 1px solid #e9ecef;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-secondary {
  background: #f8f9fa;
  color: #495057;
  border: 1px solid #e9ecef;
}

.btn-secondary:hover {
  background: #e9ecef;
}

.btn-primary {
  background: #3498db;
  color: white;
}

.btn-primary:hover {
  background: #2980b9;
}

/* 加载状态 */
.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255,255,255,0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e9ecef;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .ai-main {
    flex-direction: column;
  }
  
  .history-section {
    width: 100%;
    height: 300px;
  }
  
  .model-grid {
    grid-template-columns: 1fr;
  }
  
  .config-grid {
    grid-template-columns: 1fr;
  }
  
  .header-right {
    gap: 4px;
  }
  
  .header-btn {
    padding: 6px 8px;
    font-size: 12px;
  }
  
  .header-btn span {
    display: none;
  }
}
</style>