<template>
  <div class="model-config">
    <!-- 头部 -->
    <div class="config-header">
      <h2 class="config-title">
        <i class="icon-settings"></i>
        AI模型配置
      </h2>
      <div class="config-actions">
        <button 
          class="btn btn-secondary"
          @click="resetToDefaults"
          :disabled="loading"
        >
          重置默认
        </button>
        <button 
          class="btn btn-primary"
          @click="saveConfig"
          :disabled="loading || !isConfigValid"
        >
          <i v-if="loading" class="icon-loading"></i>
          保存配置
        </button>
      </div>
    </div>

    <!-- 配置表单 -->
    <div class="config-form">
      <!-- 模型提供商选择 -->
      <div class="form-section">
        <h3 class="section-title">模型提供商</h3>
        <div class="provider-grid">
          <div 
            v-for="provider in availableProviders" 
            :key="provider.value"
            class="provider-card"
            :class="{ active: config.provider === provider.value }"
            @click="selectProvider(provider.value)"
          >
            <div class="provider-icon">
              <i :class="provider.icon"></i>
            </div>
            <div class="provider-info">
              <h4>{{ provider.label }}</h4>
              <p>{{ provider.description }}</p>
            </div>
            <div class="provider-status">
              <span 
                class="status-dot"
                :class="getProviderStatus(provider.value)"
              ></span>
            </div>
          </div>
        </div>
      </div>

      <!-- API配置 -->
      <div class="form-section">
        <h3 class="section-title">API配置</h3>
        <div class="form-grid">
          <div class="form-group">
            <label for="apiKey">API密钥</label>
            <div class="input-with-action">
              <input
                id="apiKey"
                v-model="config.apiKey"
                :type="showApiKey ? 'text' : 'password'"
                class="form-input"
                placeholder="请输入API密钥"
                :disabled="loading"
              />
              <button 
                type="button"
                class="btn-icon"
                @click="toggleApiKeyVisibility"
              >
                <i :class="showApiKey ? 'icon-eye-off' : 'icon-eye'"></i>
              </button>
            </div>
            <div v-if="apiKeyError" class="form-error">
              {{ apiKeyError }}
            </div>
          </div>

          <div class="form-group">
            <label for="baseUrl">API基础URL</label>
            <input
              id="baseUrl"
              v-model="config.baseUrl"
              type="url"
              class="form-input"
              placeholder="https://api.openai.com/v1"
              :disabled="loading"
            />
            <div class="form-help">
              留空使用默认URL
            </div>
          </div>
        </div>
      </div>

      <!-- 模型选择 -->
      <div class="form-section">
        <h3 class="section-title">模型选择</h3>
        <div class="form-group">
          <label for="model">模型</label>
          <select
            id="model"
            v-model="config.model"
            class="form-select"
            :disabled="loading || !availableModels.length"
          >
            <option value="" disabled>请选择模型</option>
            <option 
              v-for="model in availableModels" 
              :key="model.value"
              :value="model.value"
            >
              {{ model.label }} - {{ model.description }}
            </option>
          </select>
          <div class="form-help">
            不同模型有不同的能力和定价
          </div>
        </div>
      </div>

      <!-- 模型参数 -->
      <div class="form-section">
        <h3 class="section-title">模型参数</h3>
        <div class="form-grid">
          <div class="form-group">
            <label for="temperature">
              温度 (Temperature): {{ config.temperature }}
            </label>
            <input
              id="temperature"
              v-model.number="config.temperature"
              type="range"
              min="0"
              max="2"
              step="0.1"
              class="form-range"
              :disabled="loading"
            />
            <div class="range-labels">
              <span>保守 (0)</span>
              <span>创造 (2)</span>
            </div>
            <div class="form-help">
              控制回答的随机性和创造性
            </div>
          </div>

          <div class="form-group">
            <label for="maxTokens">最大令牌数</label>
            <input
              id="maxTokens"
              v-model.number="config.maxTokens"
              type="number"
              min="1"
              max="32000"
              class="form-input"
              :disabled="loading"
            />
            <div class="form-help">
              限制单次回答的最大长度
            </div>
          </div>

          <div class="form-group">
            <label for="topP">
              Top P: {{ config.topP }}
            </label>
            <input
              id="topP"
              v-model.number="config.topP"
              type="range"
              min="0"
              max="1"
              step="0.05"
              class="form-range"
              :disabled="loading"
            />
            <div class="range-labels">
              <span>精确 (0)</span>
              <span>多样 (1)</span>
            </div>
          </div>

          <div class="form-group">
            <label for="frequencyPenalty">
              频率惩罚: {{ config.frequencyPenalty }}
            </label>
            <input
              id="frequencyPenalty"
              v-model.number="config.frequencyPenalty"
              type="range"
              min="-2"
              max="2"
              step="0.1"
              class="form-range"
              :disabled="loading"
            />
            <div class="range-labels">
              <span>重复 (-2)</span>
              <span>避免 (2)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 高级设置 -->
      <div class="form-section">
        <h3 class="section-title">高级设置</h3>
        <div class="form-grid">
          <div class="form-group">
            <label class="checkbox-label">
              <input
                v-model="config.stream"
                type="checkbox"
                class="form-checkbox"
                :disabled="loading"
              />
              启用流式响应
            </label>
            <div class="form-help">
              实时显示AI回答过程
            </div>
          </div>

          <div class="form-group">
            <label for="timeout">请求超时 (秒)</label>
            <input
              id="timeout"
              v-model.number="config.timeout"
              type="number"
              min="10"
              max="300"
              class="form-input"
              :disabled="loading"
            />
          </div>

          <div class="form-group">
            <label for="retries">重试次数</label>
            <input
              id="retries"
              v-model.number="config.retries"
              type="number"
              min="0"
              max="5"
              class="form-input"
              :disabled="loading"
            />
          </div>
        </div>
      </div>

      <!-- 测试连接 -->
      <div class="form-section">
        <h3 class="section-title">连接测试</h3>
        <div class="test-section">
          <button 
            class="btn btn-outline"
            @click="testConnection"
            :disabled="loading || !isConfigValid"
          >
            <i v-if="testing" class="icon-loading"></i>
            <i v-else class="icon-test"></i>
            测试连接
          </button>
          <div v-if="testResult" class="test-result" :class="testResult.type">
            <i :class="testResult.type === 'success' ? 'icon-check' : 'icon-error'"></i>
            {{ testResult.message }}
          </div>
        </div>
      </div>
    </div>

    <!-- 配置预设 -->
    <div class="config-presets">
      <h3 class="section-title">配置预设</h3>
      <div class="preset-grid">
        <div 
          v-for="preset in configPresets" 
          :key="preset.name"
          class="preset-card"
          @click="applyPreset(preset)"
        >
          <div class="preset-info">
            <h4>{{ preset.name }}</h4>
            <p>{{ preset.description }}</p>
          </div>
          <div class="preset-details">
            <span class="preset-tag">{{ preset.provider }}</span>
            <span class="preset-tag">{{ preset.model }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { ModelConfig, ModelProvider } from '../types/agent'
import { aiAgentAPI } from '../services/ai-agent'

// 响应式数据
const config = ref<ModelConfig>({
  provider: 'openai' as ModelProvider,
  model: 'gpt-3.5-turbo',
  apiKey: '',
  baseUrl: '',
  temperature: 0.7,
  maxTokens: 2000,
  topP: 1,
  frequencyPenalty: 0,
  stream: true,
  timeout: 60,
  retries: 3
})

const loading = ref(false)
const testing = ref(false)
const showApiKey = ref(false)
const apiKeyError = ref('')
const testResult = ref<{ type: 'success' | 'error', message: string } | null>(null)

// 可用的提供商
const availableProviders = ref([
  {
    value: 'openai' as ModelProvider,
    label: 'OpenAI',
    description: '最先进的GPT模型',
    icon: 'icon-openai'
  },
  {
    value: 'anthropic' as ModelProvider,
    label: 'Anthropic',
    description: 'Claude系列模型',
    icon: 'icon-anthropic'
  },
  {
    value: 'deepseek' as ModelProvider,
    label: 'DeepSeek',
    description: '国产优秀AI模型',
    icon: 'icon-deepseek'
  }
])

// 可用的模型
const availableModels = computed(() => {
  const modelMap = {
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
  return modelMap[config.value.provider] || []
})

// 配置预设
const configPresets = ref([
  {
    name: '创意写作',
    description: '适合创意写作和头脑风暴',
    provider: 'openai',
    model: 'gpt-4',
    temperature: 1.2,
    topP: 0.9
  },
  {
    name: '技术问答',
    description: '适合技术问题和代码生成',
    provider: 'deepseek',
    model: 'deepseek-coder',
    temperature: 0.3,
    topP: 0.8
  },
  {
    name: '日常对话',
    description: '适合日常聊天和一般问答',
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    temperature: 0.7,
    topP: 1
  },
  {
    name: '分析推理',
    description: '适合逻辑分析和推理任务',
    provider: 'anthropic',
    model: 'claude-3-sonnet',
    temperature: 0.2,
    topP: 0.7
  }
])

// 计算属性
const isConfigValid = computed(() => {
  return config.value.provider && 
         config.value.model && 
         config.value.apiKey.trim() !== ''
})

// 方法
const selectProvider = (provider: ModelProvider) => {
  config.value.provider = provider
  // 重置模型选择
  config.value.model = ''
  // 清除测试结果
  testResult.value = null
}

const toggleApiKeyVisibility = () => {
  showApiKey.value = !showApiKey.value
}

const getProviderStatus = (provider: ModelProvider) => {
  // 这里可以添加实际的状态检查逻辑
  return 'status-unknown'
}

const resetToDefaults = async () => {
  try {
    loading.value = true
    const defaults = await aiAgentAPI.getDefaultModelConfig()
    config.value = { ...defaults }
    testResult.value = null
    apiKeyError.value = ''
  } catch (error) {
    console.error('重置配置失败:', error)
  } finally {
    loading.value = false
  }
}

const saveConfig = async () => {
  try {
    loading.value = true
    await aiAgentAPI.updateModelConfig(config.value)
    testResult.value = {
      type: 'success',
      message: '配置保存成功'
    }
  } catch (error) {
    console.error('保存配置失败:', error)
    testResult.value = {
      type: 'error',
      message: '保存配置失败: ' + (error as Error).message
    }
  } finally {
    loading.value = false
  }
}

const testConnection = async () => {
  try {
    testing.value = true
    testResult.value = null
    
    const result = await aiAgentAPI.testModelConnection(config.value)
    testResult.value = {
      type: result.success ? 'success' : 'error',
      message: result.message
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

const applyPreset = (preset: any) => {
  config.value = {
    ...config.value,
    provider: preset.provider,
    model: preset.model,
    temperature: preset.temperature,
    topP: preset.topP
  }
  testResult.value = null
}

// 监听器
watch(() => config.value.apiKey, (newKey) => {
  apiKeyError.value = ''
  testResult.value = null
  
  if (newKey && newKey.length < 10) {
    apiKeyError.value = 'API密钥长度不足'
  }
})

watch(() => config.value.provider, () => {
  testResult.value = null
})

// 生命周期
onMounted(async () => {
  try {
    loading.value = true
    const currentConfig = await aiAgentAPI.getModelConfig()
    if (currentConfig) {
      config.value = { ...currentConfig }
    }
  } catch (error) {
    console.error('加载配置失败:', error)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.model-config {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
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
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  font-size: 24px;
  font-weight: 600;
  color: var(--text-primary);
}

.config-actions {
  display: flex;
  gap: 12px;
}

.config-form {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.form-section {
  background: var(--bg-secondary);
  border-radius: 12px;
  padding: 24px;
  border: 1px solid var(--border-color);
}

.section-title {
  margin: 0 0 20px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px;
}

.provider-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border: 2px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--bg-primary);
}

.provider-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.provider-card.active {
  border-color: var(--primary-color);
  background: var(--primary-bg);
}

.provider-icon {
  font-size: 32px;
  color: var(--primary-color);
}

.provider-info {
  flex: 1;
}

.provider-info h4 {
  margin: 0 0 4px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.provider-info p {
  margin: 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.provider-status {
  display: flex;
  align-items: center;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-tertiary);
}

.status-dot.status-online {
  background: var(--success-color);
}

.status-dot.status-offline {
  background: var(--error-color);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.form-input,
.form-select {
  padding: 12px 16px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  background: var(--bg-primary);
  color: var(--text-primary);
  transition: border-color 0.2s ease;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: var(--primary-color);
}

.form-input:disabled,
.form-select:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.input-with-action {
  position: relative;
  display: flex;
  align-items: center;
}

.input-with-action .form-input {
  flex: 1;
  padding-right: 48px;
}

.btn-icon {
  position: absolute;
  right: 12px;
  background: none;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: color 0.2s ease;
}

.btn-icon:hover {
  color: var(--text-primary);
}

.form-range {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--border-color);
  outline: none;
  cursor: pointer;
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.form-help {
  font-size: 12px;
  color: var(--text-secondary);
}

.form-error {
  font-size: 12px;
  color: var(--error-color);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-primary);
}

.form-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.test-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.test-result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
}

.test-result.success {
  background: var(--success-bg);
  color: var(--success-color);
}

.test-result.error {
  background: var(--error-bg);
  color: var(--error-color);
}

.config-presets {
  margin-top: 32px;
  padding-top: 32px;
  border-top: 1px solid var(--border-color);
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin-top: 16px;
}

.preset-card {
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--bg-primary);
}

.preset-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.preset-info h4 {
  margin: 0 0 8px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.preset-info p {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--text-secondary);
}

.preset-details {
  display: flex;
  gap: 8px;
}

.preset-tag {
  padding: 4px 8px;
  background: var(--bg-secondary);
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-secondary);
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

.btn-outline {
  background: transparent;
  color: var(--primary-color);
  border: 1px solid var(--primary-color);
}

.btn-outline:hover:not(:disabled) {
  background: var(--primary-bg);
}

.icon-loading {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
  
  .provider-grid,
  .form-grid,
  .preset-grid {
    grid-template-columns: 1fr;
  }
  
  .provider-card {
    flex-direction: column;
    text-align: center;
  }
}
</style>