<template>
  <div class="ai-agent-hub">
    <!-- 头部导航 -->
    <div class="hub-header">
      <div class="header-left">
        <h1 class="hub-title">
          <i class="icon-robot"></i>
          AI智能助手
        </h1>
        <div class="hub-status">
          <div class="status-item">
            <span class="status-dot" :class="{ active: connectionStatus.connected }"></span>
            <span class="status-text">
              {{ connectionStatus.connected ? '已连接' : '未连接' }}
            </span>
          </div>
          <div class="status-item">
            <i class="icon-model"></i>
            <span class="status-text">{{ currentModel || '未配置' }}</span>
          </div>
        </div>
      </div>
      <div class="header-actions">
        <button 
          class="btn btn-icon"
          @click="refreshConnection"
          :disabled="isRefreshing"
          title="刷新连接"
        >
          <i class="icon-refresh" :class="{ spinning: isRefreshing }"></i>
        </button>
        <button 
          class="btn btn-icon"
          @click="showSettings = !showSettings"
          :class="{ active: showSettings }"
          title="设置"
        >
          <i class="icon-settings"></i>
        </button>
      </div>
    </div>

    <!-- 快速设置面板 -->
    <div v-if="showSettings" class="quick-settings">
      <div class="settings-content">
        <div class="setting-item">
          <label>当前模型</label>
          <select v-model="selectedModel" @change="switchModel" class="form-select">
            <option value="" disabled>选择模型</option>
            <option v-for="model in availableModels" :key="model.id" :value="model.id">
              {{ model.name }} - {{ model.provider }}
            </option>
          </select>
        </div>
        <div class="setting-item">
          <label>温度设置</label>
          <input 
            v-model.number="quickSettings.temperature"
            type="range"
            min="0"
            max="2"
            step="0.1"
            class="form-range"
            @change="updateQuickSettings"
          />
          <span class="range-value">{{ quickSettings.temperature }}</span>
        </div>
        <div class="setting-item">
          <button class="btn btn-primary btn-small" @click="openFullSettings">
            完整设置
          </button>
        </div>
      </div>
    </div>

    <!-- 主要内容区域 -->
    <div class="hub-content">
      <!-- 侧边导航 -->
      <div class="hub-sidebar">
        <nav class="hub-nav">
          <div class="nav-section">
            <h3 class="nav-title">AI功能</h3>
            <ul class="nav-list">
              <li 
                v-for="feature in aiFeatures" 
                :key="feature.id"
                class="nav-item"
                :class="{ active: activeFeature === feature.id }"
                @click="switchFeature(feature.id)"
              >
                <i :class="feature.icon"></i>
                <span>{{ feature.name }}</span>
                <div v-if="feature.badge" class="nav-badge">{{ feature.badge }}</div>
              </li>
            </ul>
          </div>
          
          <div class="nav-section">
            <h3 class="nav-title">工具箱</h3>
            <ul class="nav-list">
              <li 
                v-for="tool in quickTools" 
                :key="tool.id"
                class="nav-item tool-item"
                @click="useTool(tool)"
              >
                <i :class="tool.icon"></i>
                <span>{{ tool.name }}</span>
              </li>
            </ul>
          </div>

          <div class="nav-section">
            <h3 class="nav-title">最近使用</h3>
            <ul class="nav-list">
              <li 
                v-for="recent in recentItems" 
                :key="recent.id"
                class="nav-item recent-item"
                @click="openRecent(recent)"
              >
                <i :class="recent.icon"></i>
                <span>{{ recent.name }}</span>
                <span class="recent-time">{{ formatTime(recent.timestamp) }}</span>
              </li>
            </ul>
          </div>
        </nav>

        <!-- 使用统计 -->
        <div class="usage-stats">
          <h3 class="stats-title">今日使用</h3>
          <div class="stats-grid">
            <div class="stat-item">
              <div class="stat-value">{{ todayStats.messages }}</div>
              <div class="stat-label">消息数</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ todayStats.tokens }}</div>
              <div class="stat-label">令牌数</div>
            </div>
            <div class="stat-item">
              <div class="stat-value">{{ todayStats.sessions }}</div>
              <div class="stat-label">会话数</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 主要内容区 -->
      <div class="hub-main">
        <!-- 欢迎页面 -->
        <div v-if="activeFeature === 'welcome'" class="welcome-section">
          <div class="welcome-hero">
            <div class="hero-icon">
              <i class="icon-robot-large"></i>
            </div>
            <h2 class="hero-title">欢迎使用AI智能助手</h2>
            <p class="hero-description">
              集成多种AI模型，提供智能对话、创作辅助、文档分析等强大功能
            </p>
          </div>

          <div class="feature-showcase">
            <div class="showcase-grid">
              <div 
                v-for="feature in aiFeatures.filter(f => f.id !== 'welcome')" 
                :key="feature.id"
                class="showcase-card"
                @click="switchFeature(feature.id)"
              >
                <div class="card-icon">
                  <i :class="feature.icon"></i>
                </div>
                <div class="card-content">
                  <h3>{{ feature.name }}</h3>
                  <p>{{ feature.description }}</p>
                </div>
                <div class="card-action">
                  <i class="icon-arrow-right"></i>
                </div>
              </div>
            </div>
          </div>

          <div class="quick-start">
            <h3 class="section-title">快速开始</h3>
            <div class="quick-actions">
              <button 
                class="quick-action-btn"
                @click="quickStart('chat')"
              >
                <i class="icon-chat"></i>
                <span>开始对话</span>
              </button>
              <button 
                class="quick-action-btn"
                @click="quickStart('writing')"
              >
                <i class="icon-edit"></i>
                <span>智能创作</span>
              </button>
              <button 
                class="quick-action-btn"
                @click="quickStart('settings')"
              >
                <i class="icon-settings"></i>
                <span>配置模型</span>
              </button>
            </div>
          </div>
        </div>

        <!-- AI对话 -->
        <div v-else-if="activeFeature === 'chat'" class="feature-content">
          <AIChat ref="aiChatRef" />
        </div>

        <!-- 智能创作 -->
        <div v-else-if="activeFeature === 'writing'" class="feature-content">
          <SmartWritingAssistant ref="writingAssistantRef" />
        </div>

        <!-- 对话历史 -->
        <div v-else-if="activeFeature === 'history'" class="feature-content">
          <ChatHistory ref="chatHistoryRef" />
        </div>

        <!-- 模型配置 -->
        <div v-else-if="activeFeature === 'settings'" class="feature-content">
          <ModelConfig ref="modelConfigRef" />
        </div>

        <!-- 工具使用页面 -->
        <div v-else-if="activeFeature === 'tool'" class="feature-content">
          <div class="tool-usage">
            <div class="tool-header">
              <h2>{{ selectedTool?.name }}</h2>
              <p>{{ selectedTool?.description }}</p>
            </div>
            <div class="tool-content">
              <!-- 这里可以根据不同工具显示不同的界面 -->
              <component 
                v-if="selectedTool?.component"
                :is="selectedTool.component"
                v-bind="selectedTool.props"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 浮动操作按钮 -->
    <div class="floating-actions">
      <button 
        class="fab"
        @click="quickChat"
        title="快速对话"
      >
        <i class="icon-chat"></i>
      </button>
    </div>

    <!-- 通知中心 -->
    <div v-if="notifications.length > 0" class="notification-center">
      <div 
        v-for="notification in notifications" 
        :key="notification.id"
        class="notification-item"
        :class="notification.type"
      >
        <div class="notification-icon">
          <i :class="getNotificationIcon(notification.type)"></i>
        </div>
        <div class="notification-content">
          <h4>{{ notification.title }}</h4>
          <p>{{ notification.message }}</p>
        </div>
        <button 
          class="notification-close"
          @click="dismissNotification(notification.id)"
        >
          <i class="icon-close"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AIChat from './AIChat.vue'
import SmartWritingAssistant from './SmartWritingAssistant.vue'
import ChatHistory from './ChatHistory.vue'
import ModelConfig from './ModelConfig.vue'
import { aiAgentAPI } from '../services/serviceImpl/ai-agent'
import type { ModelConfig as ModelConfigType, ConnectionStatus } from '../../../shared/types/agent/agent'

// 响应式数据
const activeFeature = ref('welcome')
const showSettings = ref(false)
const isRefreshing = ref(false)
const selectedModel = ref('')
const selectedTool = ref<any>(null)

// 连接状态
const connectionStatus = ref<ConnectionStatus>({
  connected: false,
  error: undefined
})

// 快速设置
const quickSettings = ref({
  temperature: 0.7,
  maxTokens: 2000
})

// 可用模型
const availableModels = ref([
  { id: 'gpt-4', name: 'GPT-4', provider: 'OpenAI' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'OpenAI' },
  { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet', provider: 'Anthropic' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek' }
])

// AI功能列表
const aiFeatures = ref([
  {
    id: 'welcome',
    name: '欢迎页面',
    icon: 'icon-home',
    description: '功能概览和快速开始'
  },
  {
    id: 'chat',
    name: 'AI对话',
    icon: 'icon-chat',
    description: '与AI进行智能对话交流',
    badge: ''
  },
  {
    id: 'writing',
    name: '智能创作',
    icon: 'icon-edit',
    description: 'AI辅助写作和内容优化'
  },
  {
    id: 'history',
    name: '对话历史',
    icon: 'icon-history',
    description: '查看和管理对话记录'
  },
  {
    id: 'settings',
    name: '模型配置',
    icon: 'icon-settings',
    description: '配置AI模型和参数'
  }
])

// 快速工具
const quickTools = ref([
  {
    id: 'translate',
    name: '快速翻译',
    icon: 'icon-translate',
    description: '文本翻译工具'
  },
  {
    id: 'summarize',
    name: '内容摘要',
    icon: 'icon-compress',
    description: '生成文本摘要'
  },
  {
    id: 'grammar',
    name: '语法检查',
    icon: 'icon-check',
    description: '检查语法错误'
  },
  {
    id: 'creative',
    name: '创意生成',
    icon: 'icon-lightbulb',
    description: '生成创意内容'
  }
])

// 最近使用
const recentItems = ref([
  {
    id: 1,
    name: '技术文档写作',
    icon: 'icon-document',
    timestamp: Date.now() - 3600000,
    type: 'writing'
  },
  {
    id: 2,
    name: '产品需求讨论',
    icon: 'icon-chat',
    timestamp: Date.now() - 7200000,
    type: 'chat'
  }
])

// 使用统计
const todayStats = ref({
  messages: 0,
  tokens: 0,
  sessions: 0
})

// 通知列表
const notifications = ref<any[]>([])

// 计算属性
const currentModel = computed(() => {
  const model = availableModels.value.find(m => m.id === selectedModel.value)
  return model ? `${model.name} (${model.provider})` : ''
})

// 组件引用
const aiChatRef = ref()
const writingAssistantRef = ref()
const chatHistoryRef = ref()
const modelConfigRef = ref()

// 方法
const switchFeature = (featureId: string) => {
  activeFeature.value = featureId
  showSettings.value = false
  
  // 添加到最近使用
  addToRecent(featureId)
}

const refreshConnection = async () => {
  try {
    isRefreshing.value = true
    const status = await aiAgentAPI.getConnectionStatus()
    connectionStatus.value = {
      connected: status.connected,
      error: status.error
    }
    
    if (status.connected) {
      showNotification('success', '连接成功', 'AI服务连接正常')
    } else {
      showNotification('error', '连接失败', '请检查网络和配置')
    }
  } catch (error) {
    console.error('刷新连接失败:', error)
    showNotification('error', '连接错误', '无法连接到AI服务')
  } finally {
    isRefreshing.value = false
  }
}

const switchModel = async () => {
  try {
    const modelConfig: Partial<ModelConfigType> = {
      modelName: selectedModel.value
    }
    await aiAgentAPI.updateModelConfig('default', modelConfig)
    showNotification('success', '模型切换', `已切换到 ${currentModel.value}`)
    await refreshConnection()
  } catch (error) {
    console.error('切换模型失败:', error)
    showNotification('error', '切换失败', '模型切换失败，请检查配置')
  }
}

const updateQuickSettings = async () => {
  try {
    const modelConfig: Partial<ModelConfigType> = {
      temperature: quickSettings.value.temperature,
      maxTokens: quickSettings.value.maxTokens
    }
    await aiAgentAPI.updateModelConfig('default', modelConfig)
  } catch (error) {
    console.error('更新设置失败:', error)
  }
}

const openFullSettings = () => {
  switchFeature('settings')
}

const useTool = (tool: any) => {
  selectedTool.value = tool
  activeFeature.value = 'tool'
  
  // 根据工具类型执行不同操作
  switch (tool.id) {
    case 'translate':
    case 'summarize':
    case 'grammar':
    case 'creative':
      // 切换到智能创作页面并选择对应工具
      switchFeature('writing')
      // 这里可以通过事件或props传递工具信息给SmartWritingAssistant组件
      break
    default:
      break
  }
}

const openRecent = (recent: any) => {
  switch (recent.type) {
    case 'chat':
      switchFeature('chat')
      break
    case 'writing':
      switchFeature('writing')
      break
    default:
      break
  }
}

const quickStart = (action: string) => {
  switch (action) {
    case 'chat':
      switchFeature('chat')
      break
    case 'writing':
      switchFeature('writing')
      break
    case 'settings':
      switchFeature('settings')
      break
    default:
      break
  }
}

const quickChat = () => {
  switchFeature('chat')
}

const addToRecent = (featureId: string) => {
  const feature = aiFeatures.value.find(f => f.id === featureId)
  if (!feature || featureId === 'welcome') return
  
  const existingIndex = recentItems.value.findIndex(item => item.type === featureId)
  if (existingIndex >= 0) {
    // 更新时间戳并移到前面
    const item = recentItems.value.splice(existingIndex, 1)[0]
    item.timestamp = Date.now()
    recentItems.value.unshift(item)
  } else {
    // 添加新项目
    recentItems.value.unshift({
      id: Date.now(),
      name: feature.name,
      icon: feature.icon,
      timestamp: Date.now(),
      type: featureId
    })
  }
  
  // 限制最近使用数量
  if (recentItems.value.length > 5) {
    recentItems.value = recentItems.value.slice(0, 5)
  }
}

const showNotification = (type: string, title: string, message: string) => {
  const notification = {
    id: Date.now(),
    type,
    title,
    message,
    timestamp: Date.now()
  }
  
  notifications.value.push(notification)
  
  // 自动消失
  setTimeout(() => {
    dismissNotification(notification.id)
  }, 5000)
}

const dismissNotification = (id: number) => {
  const index = notifications.value.findIndex(n => n.id === id)
  if (index >= 0) {
    notifications.value.splice(index, 1)
  }
}

const getNotificationIcon = (type: string) => {
  const iconMap = {
    success: 'icon-check-circle',
    error: 'icon-error-circle',
    warning: 'icon-warning-circle',
    info: 'icon-info-circle'
  }
  return iconMap[type] || 'icon-info-circle'
}

const formatTime = (timestamp: number) => {
  const now = Date.now()
  const diff = now - timestamp
  
  if (diff < 60000) {
    return '刚刚'
  } else if (diff < 3600000) {
    return `${Math.floor(diff / 60000)}分钟前`
  } else if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`
  } else {
    return new Date(timestamp).toLocaleDateString()
  }
}

const loadTodayStats = async () => {
  try {
    const stats = await aiAgentAPI.getTodayUsageStats()
    todayStats.value = stats
  } catch (error) {
    console.error('加载统计数据失败:', error)
  }
}

const loadCurrentConfig = async () => {
  try {
    const config = await aiAgentAPI.getModelConfig('current')
    if (config) {
      selectedModel.value = config.modelName || ''
      quickSettings.value.temperature = config.temperature || 0.7
      quickSettings.value.maxTokens = config.maxTokens || 2000
    }
  } catch (error) {
    console.error('加载配置失败:', error)
  }
}

// 生命周期
onMounted(async () => {
  await Promise.all([
    refreshConnection(),
    loadTodayStats(),
    loadCurrentConfig()
  ])
  
  // 定期刷新连接状态
  const statusInterval = setInterval(refreshConnection, 30000)
  
  // 定期刷新统计数据
  const statsInterval = setInterval(loadTodayStats, 60000)
  
  // 清理定时器
  onUnmounted(() => {
    clearInterval(statusInterval)
    clearInterval(statsInterval)
  })
})
</script>

<style scoped>
.ai-agent-hub {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-primary);
  overflow: hidden;
}

.hub-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 24px;
}

.hub-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.hub-status {
  display: flex;
  align-items: center;
  gap: 20px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-secondary);
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--error-color);
  transition: background-color 0.3s ease;
}

.status-dot.active {
  background: var(--success-color);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.quick-settings {
  padding: 16px 24px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.settings-content {
  display: flex;
  align-items: center;
  gap: 24px;
}

.setting-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.setting-item label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
}

.form-select {
  padding: 6px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  min-width: 200px;
}

.form-range {
  width: 120px;
  height: 4px;
  border-radius: 2px;
  background: var(--border-color);
  outline: none;
  cursor: pointer;
}

.range-value {
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 30px;
  text-align: center;
}

.hub-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.hub-sidebar {
  width: 280px;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.hub-nav {
  flex: 1;
  padding: 20px 0;
}

.nav-section {
  margin-bottom: 32px;
}

.nav-title {
  margin: 0 0 12px 20px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--text-secondary);
  position: relative;
}

.nav-item:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.nav-item.active {
  background: var(--primary-bg);
  color: var(--primary-color);
  border-right: 3px solid var(--primary-color);
}

.nav-item i {
  font-size: 18px;
  width: 20px;
  text-align: center;
}

.nav-badge {
  margin-left: auto;
  padding: 2px 6px;
  background: var(--primary-color);
  color: white;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
}

.tool-item,
.recent-item {
  font-size: 14px;
}

.recent-time {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
}

.usage-stats {
  padding: 20px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-tertiary);
}

.stats-title {
  margin: 0 0 16px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: var(--primary-color);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.hub-main {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.feature-content {
  flex: 1;
  overflow: hidden;
}

.welcome-section {
  padding: 40px;
  overflow-y: auto;
}

.welcome-hero {
  text-align: center;
  margin-bottom: 48px;
}

.hero-icon {
  font-size: 64px;
  color: var(--primary-color);
  margin-bottom: 24px;
}

.hero-title {
  margin: 0 0 16px 0;
  font-size: 32px;
  font-weight: 600;
  color: var(--text-primary);
}

.hero-description {
  margin: 0;
  font-size: 16px;
  color: var(--text-secondary);
  max-width: 600px;
  margin: 0 auto;
  line-height: 1.6;
}

.feature-showcase {
  margin-bottom: 48px;
}

.showcase-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 24px;
}

.showcase-card {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 24px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.showcase-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
}

.card-icon {
  font-size: 32px;
  color: var(--primary-color);
}

.card-content {
  flex: 1;
}

.card-content h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.card-content p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.card-action {
  font-size: 20px;
  color: var(--text-tertiary);
  transition: color 0.2s ease;
}

.showcase-card:hover .card-action {
  color: var(--primary-color);
}

.quick-start {
  text-align: center;
}

.section-title {
  margin: 0 0 24px 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
}

.quick-actions {
  display: flex;
  justify-content: center;
  gap: 24px;
}

.quick-action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 24px 32px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 14px;
  font-weight: 500;
}

.quick-action-btn:hover {
  background: var(--primary-hover);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
}

.quick-action-btn i {
  font-size: 24px;
}

.tool-usage {
  padding: 24px;
}

.tool-header {
  margin-bottom: 24px;
  text-align: center;
}

.tool-header h2 {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
}

.tool-header p {
  margin: 0;
  font-size: 16px;
  color: var(--text-secondary);
}

.floating-actions {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
}

.fab {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--primary-color);
  color: white;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
}

.fab:hover {
  background: var(--primary-hover);
  transform: scale(1.1);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
}

.notification-center {
  position: fixed;
  top: 80px;
  right: 24px;
  z-index: 1001;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 400px;
}

.notification-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  animation: slideIn 0.3s ease;
}

.notification-item.success {
  border-left: 4px solid var(--success-color);
}

.notification-item.error {
  border-left: 4px solid var(--error-color);
}

.notification-item.warning {
  border-left: 4px solid var(--warning-color);
}

.notification-item.info {
  border-left: 4px solid var(--info-color);
}

.notification-icon {
  font-size: 20px;
  margin-top: 2px;
}

.notification-item.success .notification-icon {
  color: var(--success-color);
}

.notification-item.error .notification-icon {
  color: var(--error-color);
}

.notification-item.warning .notification-icon {
  color: var(--warning-color);
}

.notification-item.info .notification-icon {
  color: var(--info-color);
}

.notification-content {
  flex: 1;
}

.notification-content h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.notification-content p {
  margin: 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.notification-close {
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s ease;
}

.notification-close:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--primary-color);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
}

.btn-icon {
  padding: 8px;
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid transparent;
}

.btn-icon:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-tertiary);
  border-color: var(--border-color);
}

.btn-icon.active {
  color: var(--primary-color);
  background: var(--primary-bg);
  border-color: var(--primary-color);
}

.btn-small {
  padding: 6px 12px;
  font-size: 12px;
}

.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .hub-sidebar {
    width: 240px;
  }
  
  .showcase-grid {
    grid-template-columns: 1fr;
  }
  
  .quick-actions {
    flex-direction: column;
    align-items: center;
  }
}

@media (max-width: 768px) {
  .hub-content {
    flex-direction: column;
  }
  
  .hub-sidebar {
    width: 100%;
    height: auto;
    max-height: 200px;
    border-right: none;
    border-bottom: 1px solid var(--border-color);
  }
  
  .hub-nav {
    padding: 16px 0;
  }
  
  .nav-section {
    margin-bottom: 20px;
  }
  
  .usage-stats {
    display: none;
  }
  
  .welcome-section {
    padding: 24px;
  }
  
  .hero-title {
    font-size: 24px;
  }
  
  .settings-content {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }
  
  .setting-item {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  
  .form-select {
    min-width: auto;
  }
  
  .notification-center {
    left: 16px;
    right: 16px;
    max-width: none;
  }
  
  .floating-actions {
    bottom: 16px;
    right: 16px;
  }
}
</style>