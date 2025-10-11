<template>
  <div class="smart-writing-assistant">
    <!-- 头部工具栏 -->
    <div class="assistant-header">
      <div class="header-left">
        <h2 class="assistant-title">
          <i class="icon-magic"></i>
          智能创作助手
        </h2>
        <div class="assistant-status">
          <span 
            class="status-indicator"
            :class="{ active: isConnected, loading: isConnecting }"
          ></span>
          <span class="status-text">
            {{ isConnected ? '已连接' : isConnecting ? '连接中...' : '未连接' }}
          </span>
        </div>
      </div>
      <div class="header-actions">
        <button 
          class="btn btn-icon"
          @click="toggleSettings"
          :title="showSettings ? '隐藏设置' : '显示设置'"
        >
          <i class="icon-settings"></i>
        </button>
        <button 
          class="btn btn-icon"
          @click="clearAll"
          title="清空所有内容"
        >
          <i class="icon-trash"></i>
        </button>
      </div>
    </div>

    <!-- 设置面板 -->
    <div v-if="showSettings" class="settings-panel">
      <div class="settings-grid">
        <div class="setting-group">
          <label>创作模式</label>
          <select v-model="settings.mode" class="form-select">
            <option value="creative">创意写作</option>
            <option value="professional">专业写作</option>
            <option value="casual">日常写作</option>
            <option value="technical">技术写作</option>
          </select>
        </div>
        <div class="setting-group">
          <label>语言风格</label>
          <select v-model="settings.style" class="form-select">
            <option value="formal">正式</option>
            <option value="casual">随意</option>
            <option value="humorous">幽默</option>
            <option value="academic">学术</option>
          </select>
        </div>
        <div class="setting-group">
          <label>输出长度</label>
          <select v-model="settings.length" class="form-select">
            <option value="short">简短</option>
            <option value="medium">中等</option>
            <option value="long">详细</option>
          </select>
        </div>
        <div class="setting-group">
          <label>创意度</label>
          <input 
            v-model.number="settings.creativity"
            type="range"
            min="0"
            max="1"
            step="0.1"
            class="form-range"
          />
          <span class="range-value">{{ settings.creativity }}</span>
        </div>
      </div>
    </div>

    <!-- 主要内容区域 -->
    <div class="assistant-content">
      <!-- 左侧：输入和工具 -->
      <div class="input-section">
        <!-- 快速工具 -->
        <div class="quick-tools">
          <h3 class="section-title">快速工具</h3>
          <div class="tool-grid">
            <button 
              v-for="tool in quickTools" 
              :key="tool.id"
              class="tool-btn"
              @click="selectTool(tool)"
              :class="{ active: selectedTool?.id === tool.id }"
            >
              <i :class="tool.icon"></i>
              <span>{{ tool.name }}</span>
            </button>
          </div>
        </div>

        <!-- 输入区域 -->
        <div class="input-area">
          <h3 class="section-title">
            {{ selectedTool ? selectedTool.name : '输入内容' }}
          </h3>
          <div class="input-container">
            <textarea
              v-model="inputText"
              class="input-textarea"
              :placeholder="selectedTool ? selectedTool.placeholder : '请输入您想要处理的文本内容...'"
              :disabled="isProcessing"
            ></textarea>
            <div class="input-actions">
              <div class="input-info">
                <span class="char-count">{{ inputText.length }} 字符</span>
                <span class="word-count">{{ wordCount }} 词</span>
              </div>
              <div class="action-buttons">
                <button 
                  class="btn btn-secondary"
                  @click="clearInput"
                  :disabled="!inputText || isProcessing"
                >
                  清空
                </button>
                <button 
                  class="btn btn-primary"
                  @click="processText"
                  :disabled="!inputText || !selectedTool || isProcessing"
                >
                  <i v-if="isProcessing" class="icon-loading"></i>
                  <i v-else :class="selectedTool?.icon"></i>
                  {{ isProcessing ? '处理中...' : '开始处理' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 模板库 -->
        <div class="template-section">
          <h3 class="section-title">模板库</h3>
          <div class="template-grid">
            <div 
              v-for="template in templates" 
              :key="template.id"
              class="template-card"
              @click="applyTemplate(template)"
            >
              <div class="template-icon">
                <i :class="template.icon"></i>
              </div>
              <div class="template-info">
                <h4>{{ template.name }}</h4>
                <p>{{ template.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：输出和结果 -->
      <div class="output-section">
        <!-- 处理结果 -->
        <div class="result-area">
          <div class="result-header">
            <h3 class="section-title">处理结果</h3>
            <div class="result-actions" v-if="outputText">
              <button 
                class="btn btn-icon"
                @click="copyResult"
                title="复制结果"
              >
                <i class="icon-copy"></i>
              </button>
              <button 
                class="btn btn-icon"
                @click="saveResult"
                title="保存结果"
              >
                <i class="icon-save"></i>
              </button>
              <button 
                class="btn btn-icon"
                @click="exportResult"
                title="导出结果"
              >
                <i class="icon-export"></i>
              </button>
            </div>
          </div>
          <div class="result-container">
            <div v-if="isProcessing" class="processing-indicator">
              <div class="loading-spinner"></div>
              <p>AI正在处理您的内容，请稍候...</p>
              <div class="processing-steps">
                <div 
                  v-for="(step, index) in processingSteps" 
                  :key="index"
                  class="step-item"
                  :class="{ active: currentStep >= index, completed: currentStep > index }"
                >
                  <i :class="currentStep > index ? 'icon-check' : 'icon-clock'"></i>
                  <span>{{ step }}</span>
                </div>
              </div>
            </div>
            <div v-else-if="outputText" class="result-content">
              <div class="result-text" v-html="formattedOutput"></div>
              <div class="result-meta">
                <div class="meta-stats">
                  <span>{{ outputText.length }} 字符</span>
                  <span>{{ outputWordCount }} 词</span>
                  <span>处理时间: {{ processingTime }}ms</span>
                </div>
                <div class="meta-actions">
                  <button 
                    class="btn btn-small"
                    @click="regenerateResult"
                    :disabled="isProcessing"
                  >
                    <i class="icon-refresh"></i>
                    重新生成
                  </button>
                  <button 
                    class="btn btn-small"
                    @click="improveResult"
                    :disabled="isProcessing"
                  >
                    <i class="icon-enhance"></i>
                    优化结果
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="empty-result">
              <div class="empty-icon">
                <i class="icon-document"></i>
              </div>
              <p>选择工具并输入内容开始创作</p>
            </div>
          </div>
        </div>

        <!-- 建议和优化 -->
        <div class="suggestions-area" v-if="suggestions.length > 0">
          <h3 class="section-title">优化建议</h3>
          <div class="suggestions-list">
            <div 
              v-for="suggestion in suggestions" 
              :key="suggestion.id"
              class="suggestion-item"
            >
              <div class="suggestion-icon">
                <i :class="suggestion.type === 'improvement' ? 'icon-lightbulb' : 'icon-warning'"></i>
              </div>
              <div class="suggestion-content">
                <h4>{{ suggestion.title }}</h4>
                <p>{{ suggestion.description }}</p>
                <button 
                  v-if="suggestion.action"
                  class="btn btn-small btn-outline"
                  @click="applySuggestion(suggestion)"
                >
                  应用建议
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 历史记录 -->
        <div class="history-area">
          <h3 class="section-title">处理历史</h3>
          <div class="history-list">
            <div 
              v-for="item in history" 
              :key="item.id"
              class="history-item"
              @click="loadHistoryItem(item)"
            >
              <div class="history-icon">
                <i :class="item.tool.icon"></i>
              </div>
              <div class="history-content">
                <h4>{{ item.tool.name }}</h4>
                <p>{{ item.preview }}</p>
                <span class="history-time">{{ formatTime(item.timestamp) }}</span>
              </div>
              <div class="history-actions">
                <button 
                  class="btn btn-icon btn-small"
                  @click.stop="deleteHistoryItem(item.id)"
                >
                  <i class="icon-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { aiAgentAPI } from '../services/serviceImpl/ai-agent'
import type { ChatMessage } from '../../../shared/cache-types/agent/agent'

// 响应式数据
const showSettings = ref(false)
const isConnected = ref(false)
const isConnecting = ref(false)
const isProcessing = ref(false)
const inputText = ref('')
const outputText = ref('')
const processingTime = ref(0)
const currentStep = ref(0)

// 设置
const settings = ref({
  mode: 'creative',
  style: 'formal',
  length: 'medium',
  creativity: 0.7
})

// 选中的工具
const selectedTool = ref<any>(null)

// 快速工具
const quickTools = ref([
  {
    id: 'rewrite',
    name: '重写优化',
    icon: 'icon-edit',
    placeholder: '输入需要重写的文本内容...',
    description: '改善文本的表达和结构'
  },
  {
    id: 'summarize',
    name: '内容摘要',
    icon: 'icon-compress',
    placeholder: '输入需要总结的长文本...',
    description: '提取文本的核心要点'
  },
  {
    id: 'expand',
    name: '内容扩展',
    icon: 'icon-expand',
    placeholder: '输入需要扩展的简短内容...',
    description: '丰富和详化文本内容'
  },
  {
    id: 'translate',
    name: '语言翻译',
    icon: 'icon-translate',
    placeholder: '输入需要翻译的文本...',
    description: '翻译成其他语言'
  },
  {
    id: 'grammar',
    name: '语法检查',
    icon: 'icon-check',
    placeholder: '输入需要检查的文本...',
    description: '检查并修正语法错误'
  },
  {
    id: 'tone',
    name: '语调调整',
    icon: 'icon-tone',
    placeholder: '输入需要调整语调的文本...',
    description: '调整文本的语调和风格'
  },
  {
    id: 'format',
    name: '格式转换',
    icon: 'icon-format',
    placeholder: '输入需要格式化的内容...',
    description: '转换文本格式和结构'
  },
  {
    id: 'creative',
    name: '创意生成',
    icon: 'icon-lightbulb',
    placeholder: '输入创意主题或关键词...',
    description: '生成创意内容和想法'
  }
])

// 模板库
const templates = ref([
  {
    id: 'email',
    name: '商务邮件',
    icon: 'icon-mail',
    description: '专业的商务邮件模板',
    content: '主题：\n\n尊敬的[收件人]：\n\n[正文内容]\n\n此致\n敬礼！\n\n[发件人]\n[日期]'
  },
  {
    id: 'report',
    name: '工作报告',
    icon: 'icon-document',
    description: '标准的工作报告格式',
    content: '# 工作报告\n\n## 概述\n[报告概述]\n\n## 主要工作\n1. [工作项目1]\n2. [工作项目2]\n\n## 问题与挑战\n[遇到的问题]\n\n## 下一步计划\n[未来计划]'
  },
  {
    id: 'proposal',
    name: '项目提案',
    icon: 'icon-presentation',
    description: '项目提案的标准结构',
    content: '# 项目提案\n\n## 项目背景\n[背景描述]\n\n## 目标与价值\n[项目目标]\n\n## 实施方案\n[具体方案]\n\n## 资源需求\n[所需资源]\n\n## 时间计划\n[时间安排]'
  },
  {
    id: 'article',
    name: '文章大纲',
    icon: 'icon-article',
    description: '文章写作的基本框架',
    content: '# [文章标题]\n\n## 引言\n[引入话题]\n\n## 主要观点\n### 观点一\n[详细阐述]\n\n### 观点二\n[详细阐述]\n\n## 结论\n[总结观点]'
  }
])

// 建议列表
const suggestions = ref<any[]>([])

// 历史记录
const history = ref<any[]>([])

// 处理步骤
const processingSteps = ref([
  '分析输入内容',
  '应用AI模型',
  '优化输出结果',
  '生成建议'
])

// 计算属性
const wordCount = computed(() => {
  return inputText.value.trim().split(/\s+/).filter(word => word.length > 0).length
})

const outputWordCount = computed(() => {
  return outputText.value.trim().split(/\s+/).filter(word => word.length > 0).length
})

const formattedOutput = computed(() => {
  return outputText.value.replace(/\n/g, '<br>')
})

// 方法
const toggleSettings = () => {
  showSettings.value = !showSettings.value
}

const clearAll = () => {
  inputText.value = ''
  outputText.value = ''
  suggestions.value = []
  selectedTool.value = null
}

const clearInput = () => {
  inputText.value = ''
}

const selectTool = (tool: any) => {
  selectedTool.value = tool
  outputText.value = ''
  suggestions.value = []
}

const processText = async () => {
  if (!inputText.value || !selectedTool.value) return

  try {
    isProcessing.value = true
    currentStep.value = 0
    const startTime = Date.now()

    // 模拟处理步骤
    for (let i = 0; i < processingSteps.value.length; i++) {
      currentStep.value = i
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // 构建提示词
    const prompt = buildPrompt(selectedTool.value, inputText.value, settings.value)
    
    // 调用AI API
    // 创建或获取当前会话
    const sessions = await aiAgentAPI.getChatSessions()
    let sessionId = sessions.data?.[0]?.id
    
    if (!sessionId) {
      const newSession = await aiAgentAPI.createChatSession({
        title: '智能创作助手',
        agentConfig: {} // 使用默认配置
      })
      sessionId = newSession.id
    }

    const response = await aiAgentAPI.sendMessage(sessionId, {
      type: 'user',
      content: prompt
    })
    outputText.value = response.content
    
    processingTime.value = Date.now() - startTime
    
    // 生成建议
    generateSuggestions()
    
    // 添加到历史记录
    addToHistory()
    
  } catch (error) {
    console.error('处理文本失败:', error)
    outputText.value = '处理失败，请检查网络连接和AI配置。'
  } finally {
    isProcessing.value = false
    currentStep.value = 0
  }
}

const buildPrompt = (tool: any, text: string, settings: any) => {
  const modePrompts = {
    creative: '以创意和想象力为重点',
    professional: '以专业和正式的方式',
    casual: '以轻松和日常的语调',
    technical: '以技术和准确的表达'
  }

  const stylePrompts = {
    formal: '使用正式的语言风格',
    casual: '使用随意的语言风格',
    humorous: '使用幽默的语言风格',
    academic: '使用学术的语言风格'
  }

  const lengthPrompts = {
    short: '保持简洁',
    medium: '适中长度',
    long: '详细展开'
  }

  const toolPrompts = {
    rewrite: `请重写以下文本，${modePrompts[settings.mode]}，${stylePrompts[settings.style]}，${lengthPrompts[settings.length]}：`,
    summarize: `请总结以下文本的核心要点，${lengthPrompts[settings.length]}：`,
    expand: `请扩展以下内容，${modePrompts[settings.mode]}，${lengthPrompts[settings.length]}：`,
    translate: `请将以下文本翻译成英文，${stylePrompts[settings.style]}：`,
    grammar: `请检查并修正以下文本的语法错误，保持原意：`,
    tone: `请调整以下文本的语调，${stylePrompts[settings.style]}：`,
    format: `请重新格式化以下内容，使其结构清晰：`,
    creative: `基于以下主题生成创意内容，${modePrompts[settings.mode]}：`
  }

  return `${toolPrompts[tool.id]}\n\n${text}`
}

const generateSuggestions = () => {
  // 模拟生成建议
  suggestions.value = [
    {
      id: 1,
      type: 'improvement',
      title: '语言优化',
      description: '可以使用更生动的词汇来增强表达效果',
      action: 'optimize_language'
    },
    {
      id: 2,
      type: 'structure',
      title: '结构调整',
      description: '建议重新组织段落结构以提高可读性',
      action: 'restructure'
    }
  ]
}

const addToHistory = () => {
  const historyItem = {
    id: Date.now(),
    tool: selectedTool.value,
    input: inputText.value,
    output: outputText.value,
    preview: inputText.value.substring(0, 50) + '...',
    timestamp: Date.now(),
    settings: { ...settings.value }
  }
  
  history.value.unshift(historyItem)
  
  // 限制历史记录数量
  if (history.value.length > 20) {
    history.value = history.value.slice(0, 20)
  }
}

const copyResult = async () => {
  try {
    await navigator.clipboard.writeText(outputText.value)
    // 显示复制成功提示
  } catch (error) {
    console.error('复制失败:', error)
  }
}

const saveResult = () => {
  // 实现保存功能
  console.log('保存结果')
}

const exportResult = () => {
  // 实现导出功能
  const blob = new Blob([outputText.value], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `writing-result-${Date.now()}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

const regenerateResult = () => {
  processText()
}

const improveResult = async () => {
  if (!outputText.value) return
  
  const originalInput = inputText.value
  inputText.value = outputText.value
  selectedTool.value = quickTools.value.find(tool => tool.id === 'rewrite')
  
  await processText()
  
  // 恢复原始输入
  inputText.value = originalInput
}

const applySuggestion = async (suggestion: any) => {
  // 实现建议应用逻辑
  console.log('应用建议:', suggestion)
}

const applyTemplate = (template: any) => {
  inputText.value = template.content
  selectedTool.value = quickTools.value.find(tool => tool.id === 'format')
}

const loadHistoryItem = (item: any) => {
  inputText.value = item.input
  outputText.value = item.output
  selectedTool.value = item.tool
  settings.value = { ...item.settings }
}

const deleteHistoryItem = (id: number) => {
  history.value = history.value.filter(item => item.id !== id)
}

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp)
  return date.toLocaleString()
}

// 监听器
watch(() => settings.value, () => {
  // 设置变化时清空输出
  outputText.value = ''
  suggestions.value = []
}, { deep: true })

// 生命周期
onMounted(async () => {
  try {
    isConnecting.value = true
    // 检查AI连接状态
    const status = await aiAgentAPI.getConnectionStatus()
    isConnected.value = status.connected
  } catch (error) {
    console.error('检查连接状态失败:', error)
    isConnected.value = false
  } finally {
    isConnecting.value = false
  }
  
  // 默认选择第一个工具
  if (quickTools.value.length > 0) {
    selectedTool.value = quickTools.value[0]
  }
})
</script>

<style scoped>
.smart-writing-assistant {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary);
}

.assistant-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-secondary);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 20px;
}

.assistant-title {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
}

.assistant-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--error-color);
  transition: all 0.3s ease;
}

.status-indicator.active {
  background: var(--success-color);
}

.status-indicator.loading {
  background: var(--warning-color);
  animation: pulse 1.5s infinite;
}

.status-text {
  font-size: 14px;
  color: var(--text-secondary);
}

.header-actions {
  display: flex;
  gap: 8px;
}

.settings-panel {
  padding: 20px 24px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-color);
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px;
}

.setting-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-group label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-select {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
}

.form-range {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--border-color);
  outline: none;
  cursor: pointer;
}

.range-value {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
}

.assistant-content {
  display: flex;
  flex: 1;
  gap: 24px;
  padding: 24px;
  overflow: hidden;
}

.input-section,
.output-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
  overflow-y: auto;
}

.section-title {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.quick-tools {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--border-color);
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
}

.tool-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 12px;
  text-align: center;
}

.tool-btn:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.tool-btn.active {
  border-color: var(--primary-color);
  background: var(--primary-bg);
  color: var(--primary-color);
}

.tool-btn i {
  font-size: 20px;
}

.input-area {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--border-color);
}

.input-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-textarea {
  width: 100%;
  min-height: 200px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
  font-family: inherit;
}

.input-textarea:focus {
  outline: none;
  border-color: var(--primary-color);
}

.input-textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.input-info {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

.action-buttons {
  display: flex;
  gap: 12px;
}

.template-section {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--border-color);
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 12px;
}

.template-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.template-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.template-icon {
  font-size: 24px;
  color: var(--primary-color);
}

.template-info h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.template-info p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.result-area {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--border-color);
  flex: 1;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.result-actions {
  display: flex;
  gap: 8px;
}

.result-container {
  min-height: 300px;
  display: flex;
  flex-direction: column;
}

.processing-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 20px;
  text-align: center;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color);
  border-top: 3px solid var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.processing-steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-start;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  transition: all 0.3s ease;
}

.step-item.active {
  color: var(--primary-color);
  background: var(--primary-bg);
}

.step-item.completed {
  color: var(--success-color);
  background: var(--success-bg);
}

.result-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.result-text {
  flex: 1;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.result-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
}

.meta-stats {
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--text-secondary);
}

.meta-actions {
  display: flex;
  gap: 8px;
}

.empty-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 16px;
  color: var(--text-secondary);
  text-align: center;
}

.empty-icon {
  font-size: 48px;
  opacity: 0.5;
}

.suggestions-area,
.history-area {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 20px;
  border: 1px solid var(--border-color);
}

.suggestions-list,
.history-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 300px;
  overflow-y: auto;
}

.suggestion-item,
.history-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-primary);
}

.history-item {
  cursor: pointer;
  transition: all 0.2s ease;
}

.history-item:hover {
  border-color: var(--primary-color);
  transform: translateY(-1px);
}

.suggestion-icon,
.history-icon {
  font-size: 20px;
  color: var(--primary-color);
  margin-top: 2px;
}

.suggestion-content,
.history-content {
  flex: 1;
}

.suggestion-content h4,
.history-content h4 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.suggestion-content p,
.history-content p {
  margin: 0 0 8px 0;
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.history-time {
  font-size: 11px;
  color: var(--text-tertiary);
}

.history-actions {
  display: flex;
  gap: 4px;
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

.btn-secondary {
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-quaternary);
}

.btn-outline {
  background: transparent;
  color: var(--primary-color);
  border: 1px solid var(--primary-color);
}

.btn-outline:hover:not(:disabled) {
  background: var(--primary-bg);
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

.btn-small {
  padding: 6px 12px;
  font-size: 12px;
}

.icon-loading {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .assistant-content {
    flex-direction: column;
  }
  
  .input-section,
  .output-section {
    flex: none;
  }
}

@media (max-width: 768px) {
  .assistant-header {
    flex-direction: column;
    gap: 16px;
    align-items: stretch;
  }
  
  .header-left {
    justify-content: center;
  }
  
  .header-actions {
    justify-content: center;
  }
  
  .settings-grid {
    grid-template-columns: 1fr;
  }
  
  .tool-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .template-grid {
    grid-template-columns: 1fr;
  }
  
  .input-actions {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
  
  .action-buttons {
    justify-content: center;
  }
  
  .result-meta {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
  
  .meta-actions {
    justify-content: center;
  }
}
</style>