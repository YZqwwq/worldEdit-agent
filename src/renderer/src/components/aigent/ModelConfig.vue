<template>
  <div class="model-config">
    <!-- 头部 -->
    <div class="config-header">
      <h2 class="config-title">
        <i class="icon-settings"></i>
        AI模型配置管理
      </h2>
      <div class="config-actions">
        <button 
          class="btn btn-secondary"
          @click="refreshConfigs"
          :disabled="loading"
        >
          <i class="icon-refresh"></i>
          刷新
        </button>
        <button 
          class="btn btn-primary"
          @click="showCreateDialog = true"
          :disabled="loading"
        >
          <i class="icon-plus"></i>
          新建配置
        </button>
      </div>
    </div>

    <!-- 配置列表 -->
    <div class="config-list" v-if="!showCreateDialog && !showEditDialog">
      <div class="list-header">
        <h3>已保存的配置</h3>
        <div class="list-stats">
          共 {{ modelConfigs.length }} 个配置
        </div>
      </div>
      
      <div class="config-grid" v-if="modelConfigs.length > 0">
        <div 
          v-for="config in modelConfigs" 
          :key="config.id"
          class="config-card"
          :class="{ 'is-default': config.isDefault, 'is-active': config.isActive }"
        >
          <div class="config-info">
            <div class="config-name">
              {{ config.name }}
              <span v-if="config.isDefault" class="default-badge">默认</span>
              <span v-if="config.isActive" class="active-badge">激活</span>
            </div>
            <div class="config-details">
              <span class="provider">{{ getProviderLabel(config.provider) }}</span>
              <span class="model">{{ config.modelName }}</span>
              <span class="temperature">温度: {{ config.temperature }}</span>
            </div>
            <div class="config-meta">
              <span class="created-at">创建于 {{ formatDate(config.createdAt) }}</span>
            </div>
          </div>
          
          <div class="config-actions">
            <button 
              class="btn-icon"
              @click="toggleActive(config)"
              :title="config.isActive ? '停用' : '激活'"
            >
              <i :class="config.isActive ? 'icon-pause' : 'icon-play'"></i>
            </button>
            <button 
              class="btn-icon"
              @click="editConfig(config)"
              title="编辑"
            >
              <i class="icon-edit"></i>
            </button>
            <button 
              class="btn-icon"
              @click="setAsDefault(config)"
              :disabled="config.isDefault"
              title="设为默认"
            >
              <i class="icon-star"></i>
            </button>
            <button 
              class="btn-icon btn-danger"
              @click="deleteConfig(config)"
              :disabled="config.isDefault"
              title="删除"
            >
              <i class="icon-delete"></i>
            </button>
          </div>
        </div>
      </div>
      
      <div class="empty-state" v-else>
        <i class="icon-empty"></i>
        <h3>暂无配置</h3>
        <p>点击"新建配置"创建您的第一个AI模型配置</p>
      </div>
    </div>

    <!-- 创建/编辑对话框 -->
    <div class="config-dialog" v-if="showCreateDialog || showEditDialog">
      <div class="dialog-header">
        <h3>{{ showCreateDialog ? '新建配置' : '编辑配置' }}</h3>
        <button class="btn-close" @click="closeDialog">
          <i class="icon-close"></i>
        </button>
      </div>
      
      <div class="dialog-content">
        <!-- 基本信息 -->
        <div class="form-section">
          <h4>基本信息</h4>
          <div class="form-grid">
            <div class="form-field">
              <label>配置名称</label>
              <input 
                v-model="currentConfig.name"
                type="text"
                placeholder="请输入配置名称"
                class="form-input"
              />
            </div>
            <div class="form-field">
              <label>描述</label>
              <input 
                v-model="currentConfig.description"
                type="text"
                placeholder="配置描述（可选）"
                class="form-input"
              />
            </div>
          </div>
        </div>

        <!-- 模型提供商 -->
        <div class="form-section">
          <h4>模型提供商</h4>
          <div class="provider-grid">
            <div 
              v-for="provider in availableProviders" 
              :key="provider.value"
              class="provider-card"
              :class="{ active: currentConfig.provider === provider.value }"
              @click="selectProvider(provider.value)"
            >
              <div class="provider-icon">
                <i :class="provider.icon"></i>
              </div>
              <div class="provider-info">
                <h5>{{ provider.label }}</h5>
                <p>{{ provider.description }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 模型选择 -->
        <div class="form-section" v-if="currentConfig.provider">
          <h4>模型选择</h4>
          <div class="form-grid">
            <div class="form-field">
              <label>模型</label>
              <select v-model="currentConfig.modelName" class="form-select">
                <option value="">请选择模型</option>
                <option 
                  v-for="model in availableModels" 
                  :key="model.value"
                  :value="model.value"
                >
                  {{ model.label }} - {{ model.description }}
                </option>
              </select>
            </div>
            <div class="form-field">
              <label>显示名称</label>
              <input 
                v-model="currentConfig.modelName"
                type="text"
                placeholder="自定义显示名称（可选）"
                class="form-input"
              />
            </div>
          </div>
        </div>

        <!-- API配置 -->
        <div class="form-section">
          <h4>API配置</h4>
          <div class="form-grid">
            <div class="form-field">
              <label>API密钥</label>
              <div class="input-group">
                <input 
                  v-model="currentConfig.apiKey"
                  :type="showApiKey ? 'text' : 'password'"
                  placeholder="请输入API密钥"
                  class="form-input"
                />
                <button 
                  type="button"
                  class="btn-toggle"
                  @click="showApiKey = !showApiKey"
                >
                  <i :class="showApiKey ? 'icon-eye-off' : 'icon-eye'"></i>
                </button>
              </div>
            </div>
            <div class="form-field">
              <label>基础URL</label>
              <input 
                v-model="currentConfig.baseURL"
                type="text"
                placeholder="自定义API基础URL（可选）"
                class="form-input"
              />
            </div>
          </div>
        </div>

        <!-- 模型参数 -->
        <div class="form-section">
          <h4>模型参数</h4>
          <div class="form-grid">
            <div class="form-field">
              <label>温度 ({{ currentConfig.temperature }})</label>
              <input 
                v-model.number="currentConfig.temperature"
                type="range"
                min="0"
                max="2"
                step="0.1"
                class="form-range"
              />
              <div class="range-labels">
                <span>保守</span>
                <span>创意</span>
              </div>
            </div>
            <div class="form-field">
              <label>最大Token数</label>
              <input 
                v-model.number="currentConfig.maxTokens"
                type="number"
                min="1"
                max="32000"
                placeholder="2000"
                class="form-input"
              />
            </div>
            <div class="form-field">
              <label>Top P ({{ currentConfig.topP }})</label>
              <input 
                v-model.number="currentConfig.topP"
                type="range"
                min="0"
                max="1"
                step="0.1"
                class="form-range"
              />
            </div>
            <div class="form-field">
              <label>超时时间(秒)</label>
              <input 
                v-model.number="currentConfig.timeout"
                type="number"
                min="10"
                max="300"
                placeholder="60"
                class="form-input"
              />
            </div>
          </div>
        </div>

        <!-- 高级选项 -->
        <div class="form-section">
          <h4>高级选项</h4>
          <div class="form-grid">
            <div class="form-field">
              <label>频率惩罚 ({{ currentConfig.frequencyPenalty }})</label>
              <input 
                v-model.number="currentConfig.frequencyPenalty"
                type="range"
                min="-2"
                max="2"
                step="0.1"
                class="form-range"
              />
            </div>
            <div class="form-field">
              <label>存在惩罚 ({{ currentConfig.presencePenalty }})</label>
              <input 
                v-model.number="currentConfig.presencePenalty"
                type="range"
                min="-2"
                max="2"
                step="0.1"
                class="form-range"
              />
            </div>
            <div class="form-field">
              <label>最大重试次数</label>
              <input 
                v-model.number="currentConfig.maxRetries"
                type="number"
                min="0"
                max="10"
                placeholder="3"
                class="form-input"
              />
            </div>
            <div class="form-field checkbox-field">
              <label>
                <input 
                  v-model="currentConfig.stream"
                  type="checkbox"
                  class="form-checkbox"
                />
                启用流式传输
              </label>
            </div>
          </div>
        </div>
      </div>
      
      <div class="dialog-footer">
        <button 
          class="btn btn-secondary"
          @click="testConnection"
          :disabled="!isConfigValid || testing"
        >
          <i v-if="testing" class="icon-loading"></i>
          <i v-else class="icon-test"></i>
          测试连接
        </button>
        <div class="dialog-actions">
          <button class="btn btn-secondary" @click="closeDialog">
            取消
          </button>
          <button 
            class="btn btn-primary"
            @click="saveCurrentConfig"
            :disabled="!isConfigValid || saving"
          >
            <i v-if="saving" class="icon-loading"></i>
            {{ showCreateDialog ? '创建' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 测试结果 -->
    <div v-if="testResult" class="test-result" :class="testResult.type">
      <i :class="testResult.type === 'success' ? 'icon-check' : 'icon-error'"></i>
      {{ testResult.message }}
    </div>

    <!-- 加载遮罩 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner">
        <i class="icon-loading"></i>
        <span>加载中...</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ModelConfig } from '../../../../shared/entities'
import { aiAgentAPI } from '../../services/serviceImpl/ai-agent'


// 响应式数据
const modelConfigs = ref<ModelConfig[]>([])
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const showApiKey = ref(false)
const testResult = ref<{ type: 'success' | 'error', message: string } | null>(null)

// 当前编辑的配置
const currentConfig = ref<Partial<ModelConfig>>({
  name: '',
  description: '',
  provider: undefined,
  modelName: '',
  apiKey: '',
  baseURL: '',
  temperature: 0.7,
  maxTokens: 2000,
  topP: 0.9,
  frequencyPenalty: 0,
  presencePenalty: 0,
  maxRetries: 3,
  timeout: 60000,
  stream: true,
  isDefault: false,
  isActive: true
})

// 可用的提供商
const availableProviders = ref([
  {
    value: 'openai',
    label: 'OpenAI',
    description: '最先进的GPT模型',
    icon: 'icon-openai'
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    description: 'Claude系列模型',
    icon: 'icon-anthropic'
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    description: '国产优秀AI模型',
    icon: 'icon-deepseek'
  }
])

// 可用的模型
const availableModels = computed(() => {
  const modelMap: Record<string, Array<{ value: string, label: string, description: string }>> = {
    openai: [
      { value: 'gpt-4', label: 'GPT-4', description: '最强大的模型' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: '更快的GPT-4' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', description: '性价比最高' }
    ],
    anthropic: [
      { value: 'claude-3-opus', label: 'Claude 3 Opus', description: '最强大的Claude' },
      { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet', description: '平衡性能' },
      { value: 'claude-3-haiku', label: 'Claude 3 Haiku', description: '最快速度' }
    ],
    deepseek: [
      { value: 'deepseek-chat', label: 'DeepSeek Chat', description: '对话模型' },
      { value: 'deepseek-coder', label: 'DeepSeek Coder', description: '代码专用' }
    ]
  }
  return modelMap[currentConfig.value.provider || ''] || []
})

// 计算属性
const isConfigValid = computed(() => {
  return currentConfig.value.name?.trim() && 
         currentConfig.value.provider && 
         currentConfig.value.modelName && 
         currentConfig.value.apiKey?.trim()
})

// 方法
const loadConfigs = async () => {
  try {
    loading.value = true
    modelConfigs.value = await aiAgentAPI.getAllModelConfigs()
  } catch (error) {
    console.error('加载配置失败:', error)
  } finally {
    loading.value = false
  }
}

const refreshConfigs = async () => {
  await loadConfigs()
}

const selectProvider = (provider: ModelProvider) => {
  currentConfig.value.provider = provider
  currentConfig.value.modelName = ''
  testResult.value = null
}

const editConfig = (config: ModelConfig) => {
  currentConfig.value = { ...config }
  showEditDialog.value = true
}

const closeDialog = () => {
  showCreateDialog.value = false
  showEditDialog.value = false
  testResult.value = null
  resetCurrentConfig()
}

const resetCurrentConfig = () => {
  currentConfig.value = {
    name: '',
    description: '',
    provider: undefined,
    modelName: '',
    apiKey: '',
    baseURL: '',
    temperature: 0.7,
    maxTokens: 2000,
    topP: 0.9,
    frequencyPenalty: 0,
    presencePenalty: 0,
    maxRetries: 3,
    timeout: 60000,
    stream: true,
    isDefault: false,
    isActive: true
  }
}

const saveCurrentConfig = async () => {
  try {
    saving.value = true
    
    if (showCreateDialog.value) {
      await aiAgentAPI.createModelConfig(currentConfig.value)
    } else {
      await aiAgentAPI.updateModelConfig(currentConfig.value.id!, currentConfig.value)
    }
    
    await loadConfigs()
    closeDialog()
  } catch (error) {
    console.error('保存配置失败:', error)
    testResult.value = {
      type: 'error',
      message: '保存配置失败: ' + (error as Error).message
    }
  } finally {
    saving.value = false
  }
}

const deleteConfig = async (config: ModelConfig) => {
  if (!confirm(`确定要删除配置"${config.name}"吗？`)) {
    return
  }
  
  try {
    await aiAgentAPI.deleteModelConfig(config.id)
    await loadConfigs()
  } catch (error) {
    console.error('删除配置失败:', error)
  }
}

const setAsDefault = async (config: ModelConfig) => {
  try {
    await aiAgentAPI.setDefaultModelConfig(config.id)
    await loadConfigs()
  } catch (error) {
    console.error('设置默认配置失败:', error)
  }
}

const toggleActive = async (config: ModelConfig) => {
  try {
    await aiAgentAPI.updateModelConfig(config.id, { isActive: !config.isActive })
    await loadConfigs()
  } catch (error) {
    console.error('切换激活状态失败:', error)
  }
}

const testConnection = async () => {
  try {
    testing.value = true
    testResult.value = null
    
    // 使用validateModelConfig方法测试连接
    const isValid = await aiAgentAPI.validateModelConfig(currentConfig.value as any)
    testResult.value = {
      type: isValid ? 'success' : 'error',
      message: isValid ? '连接测试成功' : '连接测试失败，请检查配置'
    }
  } catch (error) {
    console.error('测试连接失败:', error)
    testResult.value = {
      type: 'error',
      message: '连接测试失败: ' + (error as Error).message
    }
  } finally {
    testing.value = false
  }
}

const getProviderLabel = (provider: string) => {
  const providerMap: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    deepseek: 'DeepSeek'
  }
  return providerMap[provider] || provider
}

const formatDate = (date: Date | string) => {
  const d = new Date(date)
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 生命周期
onMounted(() => {
  loadConfigs()
})
</script>

<style scoped>
.model-config {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
  position: relative;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-color);
}

.config-title {
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 12px;
}

.config-actions {
  display: flex;
  gap: 12px;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.list-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.list-stats {
  color: var(--text-secondary);
  font-size: 14px;
}

.config-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 20px;
}

.config-card {
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--bg-primary);
  transition: all 0.2s ease;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.config-card:hover {
  border-color: var(--primary-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.config-card.is-default {
  border-color: var(--warning-color);
  background: var(--warning-bg);
}

.config-card.is-active {
  border-color: var(--success-color);
}

.config-info {
  flex: 1;
}

.config-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.default-badge,
.active-badge {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.default-badge {
  background: var(--warning-color);
  color: white;
}

.active-badge {
  background: var(--success-color);
  color: white;
}

.config-details {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 14px;
  color: var(--text-secondary);
}

.config-details span {
  padding: 2px 6px;
  background: var(--bg-secondary);
  border-radius: 4px;
}

.config-meta {
  font-size: 12px;
  color: var(--text-tertiary);
}

.config-actions {
  display: flex;
  gap: 8px;
}

.btn-icon {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-icon:hover {
  background: var(--bg-tertiary);
  color: var(--text-primary);
}

.btn-icon:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-icon.btn-danger:hover {
  background: var(--error-color);
  color: white;
}

.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-secondary);
}

.empty-state i {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  color: var(--text-primary);
}

.config-dialog {
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
  padding: 20px;
}

.config-dialog > div {
  background: var(--bg-primary);
  border-radius: 12px;
  width: 100%;
  max-width: 800px;
  max-height: 90vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dialog-header {
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.btn-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.form-section {
  margin-bottom: 32px;
}

.form-section h4 {
  margin: 0 0 16px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-input,
.form-select {
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: var(--primary-color);
}

.input-group {
  display: flex;
  align-items: center;
}

.input-group .form-input {
  flex: 1;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.btn-toggle {
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-left: none;
  border-top-right-radius: 6px;
  border-bottom-right-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  cursor: pointer;
}

.form-range {
  width: 100%;
  margin: 8px 0;
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
}

.checkbox-field {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.form-checkbox {
  width: auto;
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.provider-card {
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 12px;
}

.provider-card:hover {
  border-color: var(--primary-color);
}

.provider-card.active {
  border-color: var(--primary-color);
  background: var(--primary-bg);
}

.provider-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--bg-secondary);
}

.provider-info h5 {
  margin: 0 0 4px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.provider-info p {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.dialog-footer {
  padding: 20px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dialog-actions {
  display: flex;
  gap: 12px;
}

.test-result {
  position: fixed;
  top: 20px;
  right: 20px;
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 1001;
  animation: slideIn 0.3s ease;
}

.test-result.success {
  background: var(--success-bg);
  color: var(--success-color);
  border: 1px solid var(--success-color);
}

.test-result.error {
  background: var(--error-bg);
  color: var(--error-color);
  border: 1px solid var(--error-color);
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.loading-spinner {
  background: var(--bg-primary);
  padding: 24px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--text-primary);
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 8px;
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
  background: var(--bg-secondary);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--bg-tertiary);
}

.icon-loading {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .model-config {
    padding: 16px;
  }
  
  .config-header {
    flex-direction: column;
    gap: 16px;
    align-items: stretch;
  }
  
  .config-actions {
    justify-content: center;
  }
  
  .config-grid {
    grid-template-columns: 1fr;
  }
  
  .config-dialog {
    padding: 10px;
  }
  
  .form-grid,
  .provider-grid {
    grid-template-columns: 1fr;
  }
}
</style>