<template>
  <div class="button-bar">
    <!-- 主要功能按钮 -->
    <div class="button-group primary-actions">
      <button 
        class="btn btn-primary"
        @click="$emit('new-chat')"
        title="新建对话"
      >
        <i class="icon-plus"></i>
        <span>新建对话</span>
      </button>
      
      <button 
        class="btn btn-secondary"
        @click="$emit('toggle-history')"
        :class="{ active: showHistory }"
        title="对话历史"
      >
        <i class="icon-history"></i>
        <span>历史记录</span>
      </button>
      
      <button 
        class="btn btn-secondary"
        @click="$emit('clear-chat')"
        :disabled="!hasMessages"
        title="清空当前对话"
      >
        <i class="icon-trash"></i>
        <span>清空对话</span>
      </button>
    </div>

    <!-- 模型和设置 -->
    <div class="button-group model-settings">
      <div class="model-selector">
        <label class="model-label">当前模型:</label>
        <select 
          :value="selectedModel"
          @change="$emit('model-change', ($event.target as HTMLSelectElement).value)"
          class="model-select"
        >
          <option value="" disabled>选择模型</option>
          <option 
            v-for="model in availableModels" 
            :key="model.id" 
            :value="model.id"
          >
            {{ model.name }} - {{ model.provider }}
          </option>
        </select>
      </div>
      
      <button 
        class="btn btn-icon"
        @click="$emit('toggle-settings')"
        :class="{ active: showSettings }"
        title="设置"
      >
        <i class="icon-settings"></i>
      </button>
    </div>

    <!-- 连接状态和工具 -->
    <div class="button-group status-tools">
      <div class="connection-status">
        <div class="status-indicator">
          <span 
            class="status-dot" 
            :class="{ 
              connected: connectionStatus === ConnectionStatus.CONNECTED,
              disconnected: connectionStatus === ConnectionStatus.DISCONNECTED,
              connecting: connectionStatus === ConnectionStatus.CONNECTING,
              error: connectionStatus === ConnectionStatus.ERROR 
            }"
          ></span>
          <span class="status-text">
            {{ getStatusText(connectionStatus) }}
          </span>
        </div>
      </div>
      
      <button 
        class="btn btn-icon"
        @click="$emit('refresh-connection')"
        :disabled="isRefreshing"
        title="刷新连接"
      >
        <i class="icon-refresh" :class="{ spinning: isRefreshing }"></i>
      </button>
      
      <div class="divider"></div>
      
      <button 
        class="btn btn-icon"
        @click="$emit('toggle-tools')"
        :class="{ active: showTools }"
        title="工具箱"
      >
        <i class="icon-tools"></i>
      </button>
      
      <button 
        class="btn btn-icon"
        @click="$emit('export-chat')"
        :disabled="!hasMessages"
        title="导出对话"
      >
        <i class="icon-download"></i>
      </button>
    </div>

    <!-- 快速工具面板 -->
    <div v-if="showTools" class="quick-tools-panel">
      <div class="tools-header">
        <h3>快速工具</h3>
        <button class="btn btn-small" @click="$emit('toggle-tools')">
          <i class="icon-close"></i>
        </button>
      </div>
      <div class="tools-grid">
        <button 
          v-for="tool in quickTools" 
          :key="tool.id"
          class="tool-btn"
          @click="$emit('use-tool', tool)"
          :title="tool.description"
        >
          <i :class="tool.icon"></i>
          <span>{{ tool.name }}</span>
        </button>
      </div>
    </div>

    <!-- 使用统计 -->
    <div class="button-group usage-stats">
      <div class="stats-display">
        <div class="stat-item">
          <span class="stat-label">消息:</span>
          <span class="stat-value">{{ messageCount }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">令牌:</span>
          <span class="stat-value">{{ tokenCount }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ConnectionStatus } from '../../../../shared/cache-types/agent/agent'
import type { AgentConfig } from '../../../../shared/entities/agent/AgentConfig.entity'

// Props
interface Props {
  showHistory?: boolean
  showSettings?: boolean
  showTools?: boolean
  hasMessages?: boolean
  connectionStatus?: ConnectionStatus
  isRefreshing?: boolean
  selectedModel?: string
  availableModels?: AgentConfig[]
  messageCount?: number
  tokenCount?: number
}

const props = withDefaults(defineProps<Props>(), {
  showHistory: false,
  showSettings: false,
  showTools: false,
  hasMessages: false,
  isRefreshing: false,
  selectedModel: '',
  availableModels: () => [],
  messageCount: 0,
  tokenCount: 0,
  connectionStatus: ConnectionStatus.DISCONNECTED
})

// Emits
const emit = defineEmits<{
  'new-chat': []
  'toggle-history': []
  'clear-chat': []
  'model-change': [modelId: string]
  'toggle-settings': []
  'refresh-connection': []
  'toggle-tools': []
  'export-chat': []
  'use-tool': [tool: any]
}>()

// 快速工具配置
const quickTools = ref([
  {
    id: 'translate',
    name: '翻译',
    icon: 'icon-translate',
    description: '快速翻译文本'
  },
  {
    id: 'summarize',
    name: '摘要',
    icon: 'icon-compress',
    description: '生成内容摘要'
  },
  {
    id: 'grammar',
    name: '语法',
    icon: 'icon-check',
    description: '检查语法错误'
  },
  {
    id: 'creative',
    name: '创意',
    icon: 'icon-lightbulb',
    description: '生成创意内容'
  },
  {
    id: 'code',
    name: '代码',
    icon: 'icon-code',
    description: '代码生成和优化'
  },
  {
    id: 'analysis',
    name: '分析',
    icon: 'icon-chart',
    description: '数据分析和洞察'
  }
])

// 获取连接状态文本
const getStatusText = (status: ConnectionStatus) => {
  switch (status) {
    case ConnectionStatus.CONNECTED:
      return '已连接'
    case ConnectionStatus.CONNECTING:
      return '连接中'
    case ConnectionStatus.DISCONNECTED:
      return '未连接'
    case ConnectionStatus.ERROR:
      return '连接错误'
    default:
      return '未知状态'
  }
}
</script>

<style scoped>
.button-bar {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: var(--bg-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.button-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.primary-actions {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
}

.btn:hover {
  background: var(--bg-hover);
  border-color: var(--border-hover);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.btn-primary {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.btn-primary:hover {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
}

.btn-secondary {
  background: var(--bg-secondary);
}

.btn-icon {
  padding: 8px;
  min-width: 36px;
  justify-content: center;
}

.btn-small {
  padding: 4px 8px;
  font-size: 12px;
}

.model-settings {
  align-items: center;
  gap: 12px;
}

.model-selector {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-label {
  font-size: 14px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.model-select {
  padding: 6px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 14px;
  min-width: 200px;
}

.status-tools {
  align-items: center;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--error-color);
}

.status-dot.connected {
  background: var(--success-color);
}

.status-dot.disconnected {
  background: var(--warning-color);
}

.status-dot.error {
  background: var(--error-color);
}

.status-dot.connecting {
  background: var(--primary-color);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.status-text {
  font-size: 12px;
  color: var(--text-secondary);
}

.divider {
  width: 1px;
  height: 20px;
  background: var(--border-color);
  margin: 0 8px;
}

.icon-refresh.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.quick-tools-panel {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 1000;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  min-width: 300px;
  max-width: 400px;
}

.tools-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.tools-header h3 {
  margin: 0;
  font-size: 16px;
  color: var(--text-primary);
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 12px;
}

.tool-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 12px 8px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-btn:hover {
  background: var(--bg-hover);
  border-color: var(--primary-color);
}

.tool-btn i {
  font-size: 18px;
  color: var(--primary-color);
}

.usage-stats {
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
  justify-content: center;
}

.stats-display {
  display: flex;
  gap: 16px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
}

.stat-label {
  color: var(--text-secondary);
}

.stat-value {
  color: var(--text-primary);
  font-weight: 500;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .button-bar {
    padding: 12px;
    gap: 12px;
  }
  
  .button-group {
    flex-direction: column;
    align-items: stretch;
  }
  
  .model-selector {
    flex-direction: column;
    align-items: stretch;
  }
  
  .model-select {
    min-width: auto;
  }
  
  .tools-grid {
    grid-template-columns: 1fr;
  }
}
</style>