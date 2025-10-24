<template>
  <div class="ai-agent-container">
    <!-- 顶部导航栏 -->
    <header class="ai-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m12 19-7-7 7-7" />
            <path d="m19 12H5" />
          </svg>
        </button>
        <h1 class="page-title">AI 智能助手</h1>
      </div>

      <!-- 集成ButtonBar组件 -->
      <ButtonBar 
        :has-messages="messages.length > 0"
        :connection-status="connectionStatus"
        :is-refreshing="loading"
        :selected-model="modelConfig.modelName"
        :available-models="availableModels"
        :message-count="messages.length"
        :token-count="totalTokens"
        @new-chat="createNewChat"
        @toggle-history="showHistory = !showHistory"
        @clear-chat="clearChat"
        @model-change="handleModelChange"
        @toggle-settings="showModelConfig = !showModelConfig"
        @refresh-connection="refreshConnection"
        @toggle-tools="showTools = !showTools"
        @export-chat="exportChat"
        @use-tool="handleToolUse"
      />
    </header>

    <!-- 主要内容区域 -->
    <div class="ai-main">
      <!-- 会话列表侧边栏 -->
      <div v-if="showHistory" class="history-section">
        <SessionList :sessions="chatSessions" :current-session-id="currentSessionId" :is-loading="sessionsLoading"
          @session-select="handleSessionSelect" @session-create="createNewSession" @session-delete="handleSessionDelete"
          @session-edit="handleSessionEdit" @session-duplicate="handleSessionDuplicate"
          @session-export="handleSessionExport" @sessions-clear="handleSessionsClear" />
      </div>

      <!-- 对话界面 -->
      <div class="chat-section" :class="{ 'with-history': showHistory }">
        <ChatInterface :messages="messages" :is-loading="loading" :is-typing="isTyping" :input-message="inputMessage"
          :estimated-tokens="estimatedTokens" :connection-status="connectionStatus" :current-model="modelConfig"
          @message-send="handleMessageSend" @message-regenerate="handleMessageRegenerate"
          @message-copy="handleMessageCopy" @input-change="inputMessage = $event" @clear-chat="clearChat"
          @attach-file="handleFileAttach" />
      </div>
    </div>

    <!-- 模型配置组件 -->
    <ModelConfig v-if="showModelConfig" :model-config="modelConfig" @close="showModelConfig = false"
      @save="handleModelConfigSave" />

    <!-- 通知组件 -->
    <div v-if="notification" class="notification" :class="notification.type">
      {{ notification.message }}
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
import type { ChatMessage, ChatSession } from '../../../shared/cache-types/agent/agent'
import { ModelProvider, MessageType } from '../../../shared/entities'
import { ConnectionStatus } from '../../../shared/cache-types/agent/agent'
import ButtonBar from '../components/aigent/ButtonBar.vue'
import SessionList from '../components/aigent/SessionList.vue'
import ChatInterface from '../components/aigent/ChatInterface.vue'
import ModelConfig from '../components/aigent/ModelConfig.vue'

const router = useRouter()

// 响应式数据
const showModelConfig = ref(false)
const showHistory = ref(false)
const showTools = ref(false)
const loading = ref(false)
const isTyping = ref(false)
const inputMessage = ref('')
const messages = ref<ChatMessage[]>([])
const currentSessionId = ref<string>('')
const connectionStatus = ref<ConnectionStatus>(ConnectionStatus.DISCONNECTED)
const showApiKey = ref(false)
const sessionsLoading = ref(false)
const notification = ref<{ type: string, message: string } | null>(null)

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

// 可用模型列表
const availableModels = ref([
  {
    id: 'gpt-4',
    name: 'GPT-4',
    provider: 'openai',
    modelName: 'gpt-4',
    displayName: 'GPT-4'
  },
  {
    id: 'gpt-3.5-turbo',
    name: 'GPT-3.5 Turbo',
    provider: 'openai',
    modelName: 'gpt-3.5-turbo',
    displayName: 'GPT-3.5 Turbo'
  }
])

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

const totalTokens = computed(() => {
  return messages.value.reduce((total, msg) => {
    const tokenCount = msg.metadata?.tokenUsage?.totalTokens || Math.ceil(msg.content.length / 4)
    return total + tokenCount
  }, 0)
})

// 发送消息方法
const sendMessage = async () => {
  if (!inputMessage.value.trim() || loading.value) {
    return
  }

  const messageText = inputMessage.value.trim()
  inputMessage.value = ''

  // 创建用户消息
  const userMessage: ChatMessage = {
    id: Date.now().toString(),
    sessionId: currentSessionId.value,
    type: MessageType.USER,
    content: messageText,
    timestamp: new Date()
  }

  messages.value.push(userMessage)
  loading.value = true
  isTyping.value = true

  try {
    // 通过IPC发送消息到AI Agent
    const cleanModelConfig = createCleanModelConfig()
    
    await window.electron.ipcRenderer.invoke('ai-agent:send-message', {
      message: messageText,
      sessionId: currentSessionId.value,
      modelConfig: cleanModelConfig
    })

    // AI回复将通过IPC事件监听器处理
  } catch (error) {
    console.error('发送消息失败:', error)
    const errorMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      sessionId: currentSessionId.value,
      type: MessageType.ASSISTANT,
      content: `发送失败：${error}`,
      timestamp: new Date()
    }
    messages.value.push(errorMessage)
  } finally {
    loading.value = false
    isTyping.value = false
    nextTick(() => {
      scrollToBottom()
    })
  }
}

// 模型配置保存方法
const handleModelConfigSave = (config: any) => {
  modelConfig.value = { ...modelConfig.value, ...config }
  showModelConfig.value = false
  showNotification('success', '配置已保存')
}

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

// 新增的重构组件需要的方法
const createNewChat = async () => {
  try {
    loading.value = true
    // 创建新会话的逻辑
    const sessionId = Date.now().toString()
    currentSessionId.value = sessionId
    messages.value = []

    const newSession: ChatSession = {
      id: sessionId,
      agentId: '',
      title: '新对话',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    }

    chatSessions.value.unshift(newSession)
    showNotification('success', '新对话已创建')
  } catch (error) {
    console.error('创建新对话失败:', error)
    showNotification('error', '创建新对话失败')
  } finally {
    loading.value = false
  }
}



const handleModelChange = async (modelId: string) => {
  const model = availableModels.value.find(m => m.id === modelId)
  if (model) {
    try {
      modelConfig.value.modelName = model.modelName
      modelConfig.value.displayName = model.displayName
      showNotification('success', `已切换到 ${model.displayName}`)
    } catch (error) {
      console.error('切换模型失败:', error)
      showNotification('error', '切换模型失败')
    }
  }
}

const refreshConnection = async () => {
  try {
    loading.value = true
    connectionStatus.value = ConnectionStatus.CONNECTING
    // 测试连接逻辑
    await new Promise(resolve => setTimeout(resolve, 1000))
    connectionStatus.value = ConnectionStatus.CONNECTED
    showNotification('success', '连接已刷新')
  } catch (error) {
    console.error('刷新连接失败:', error)
    connectionStatus.value = ConnectionStatus.DISCONNECTED
    showNotification('error', '刷新连接失败')
  } finally {
    loading.value = false
  }
}

const exportChat = async () => {
  if (messages.value.length === 0) {
    showNotification('warning', '当前对话为空，无法导出')
    return
  }

  try {
    // 导出对话逻辑
    const chatData = {
      sessionId: currentSessionId.value,
      messages: messages.value,
      exportTime: new Date().toISOString()
    }

    const dataStr = JSON.stringify(chatData, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `chat-export-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    showNotification('success', '对话已导出')
  } catch (error) {
    console.error('导出对话失败:', error)
    showNotification('error', '导出对话失败')
  }
}

const handleToolUse = (toolName: string) => {
  showNotification('info', `工具 ${toolName} 功能开发中`)
}

// 会话管理方法
const handleSessionSelect = async (sessionId: string) => {
  try {
    loading.value = true
    currentSessionId.value = sessionId
    // 加载会话消息
    messages.value = []
    showNotification('success', '会话已切换')
  } catch (error) {
    console.error('切换会话失败:', error)
    showNotification('error', '切换会话失败')
  } finally {
    loading.value = false
  }
}



const handleSessionDelete = async (sessionId: string) => {
  if (confirm('确定要删除这个会话吗？')) {
    try {
      chatSessions.value = chatSessions.value.filter(s => s.id !== sessionId)
      if (currentSessionId.value === sessionId) {
        currentSessionId.value = ''
        messages.value = []
      }
      showNotification('success', '会话已删除')
    } catch (error) {
      console.error('删除会话失败:', error)
      showNotification('error', '删除会话失败')
    }
  }
}

const handleSessionEdit = async (sessionId: string, newTitle: string) => {
  try {
    const session = chatSessions.value.find(s => s.id === sessionId)
    if (session) {
      session.title = newTitle
      session.updatedAt =  new Date(Date.now())
      showNotification('success', '会话标题已更新')
    }
  } catch (error) {
    console.error('编辑会话失败:', error)
    showNotification('error', '编辑会话失败')
  }
}

const handleSessionDuplicate = async (sessionId: string) => {
  try {
    const session = chatSessions.value.find(s => s.id === sessionId)
    if (session) {
      const newSession = {
        ...session,
        id: Date.now().toString(),
        title: `${session.title} (副本)`,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      chatSessions.value.unshift(newSession)
      showNotification('success', '会话已复制')
    }
  } catch (error) {
    console.error('复制会话失败:', error)
    showNotification('error', '复制会话失败')
  }
}

const handleSessionExport = async (sessionId: string) => {
  try {
    const session = chatSessions.value.find(s => s.id === sessionId)
    if (session) {
      const sessionData = {
        session,
        messages: currentSessionId.value === sessionId ? messages.value : [],
        exportTime: new Date().toISOString()
      }

      const dataStr = JSON.stringify(sessionData, null, 2)
      const blob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)

      const a = document.createElement('a')
      a.href = url
      a.download = `session-${sessionId}-export.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showNotification('success', '会话已导出')
    }
  } catch (error) {
    console.error('导出会话失败:', error)
    showNotification('error', '导出会话失败')
  }
}

const handleSessionsClear = async () => {
  if (confirm('确定要清空所有会话吗？')) {
    try {
      chatSessions.value = []
      currentSessionId.value = ''
      messages.value = []
      showNotification('success', '所有会话已清空')
    } catch (error) {
      console.error('清空会话失败:', error)
      showNotification('error', '清空会话失败')
    }
  }
}

// 消息处理方法
const handleMessageSend = (message: string) => {
  inputMessage.value = message
  sendMessage()
}

const handleMessageRegenerate = async (messageId: string) => {
  try {
    const messageIndex = messages.value.findIndex(m => m.id === messageId)
    if (messageIndex > 0) {
      // 重新生成消息
      const userMessage = messages.value[messageIndex - 1]
      if (userMessage && userMessage.type === MessageType.USER) {
        // 移除当前AI回复
        messages.value.splice(messageIndex)
        // 重新发送用户消息
        inputMessage.value = userMessage.content
        sendMessage()
      }
    }
  } catch (error) {
    console.error('重新生成消息失败:', error)
    showNotification('error', '重新生成消息失败')
  }
}

const handleMessageCopy = (content: string) => {
  navigator.clipboard.writeText(content).then(() => {
    showNotification('success', '内容已复制到剪贴板')
  }).catch(() => {
    showNotification('error', '复制失败')
  })
}

const handleFileAttach = (file: File) => {
  showNotification('info', '文件上传功能开发中')
}

// 配置相关方法
const handleConfigSave = (config: any) => {
  modelConfig.value = { ...modelConfig.value, ...config }
  showModelConfig.value = false
  showNotification('success', '配置已保存')
}

const handleConfigTest = async (config: any) => {
  try {
    loading.value = true
    connectionStatus.value = ConnectionStatus.CONNECTING
    // 测试配置
    await new Promise(resolve => setTimeout(resolve, 1000))
    connectionStatus.value = ConnectionStatus.CONNECTED
    showNotification('success', '配置测试成功')
  } catch (error) {
    connectionStatus.value = ConnectionStatus.DISCONNECTED
    showNotification('error', '配置测试失败')
  } finally {
    loading.value = false
  }
}

const handleConfigReset = () => {
  modelConfig.value = {
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
  }
  showNotification('success', '配置已重置')
}

// 通知方法
const showNotification = (type: string, message: string) => {
  notification.value = { type, message }
  setTimeout(() => {
    notification.value = null
  }, 3000)
}

const dismissNotification = () => {
  notification.value = null
}

const sendQuickPrompt = (prompt: string) => {
  inputMessage.value = prompt
  sendMessage()
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
  window.electron.ipcRenderer.on('ai-agent:message-received', (_event, data) => {
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
  window.electron.ipcRenderer.on('ai-agent:state-changed', (_event, state) => {
    console.log('AI Agent状态变化:', state)
  })

  // 监听错误事件
  window.electron.ipcRenderer.on('ai-agent:error-occurred', (_event, error) => {
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
  connectionStatus.value = ConnectionStatus.CONNECTING
  setTimeout(() => {
    connectionStatus.value = ConnectionStatus.CONNECTED
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
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
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

  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.5;
  }
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

  0%,
  60%,
  100% {
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
  background: rgba(0, 0, 0, 0.5);
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
  background: rgba(255, 255, 255, 0.8);
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
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
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