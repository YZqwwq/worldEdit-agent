<template>
  <div class="chat-history-container">
    <!-- 头部 -->
    <div class="history-header">
      <div class="header-left">
        <h3 class="history-title">
          <i class="icon-history"></i>
          对话历史
        </h3>
        <span class="session-count">{{ sessions.length }} 个对话</span>
      </div>
      <div class="header-right">
        <div class="search-box">
          <input 
            type="text" 
            v-model="searchQuery"
            @input="handleSearch"
            placeholder="搜索对话..."
            class="search-input"
          >
          <i class="icon-search"></i>
        </div>
        <div class="view-controls">
          <button 
            class="view-btn"
            :class="{ active: viewMode === 'list' }"
            @click="viewMode = 'list'"
            title="列表视图"
          >
            <i class="icon-list"></i>
          </button>
          <button 
            class="view-btn"
            :class="{ active: viewMode === 'grid' }"
            @click="viewMode = 'grid'"
            title="网格视图"
          >
            <i class="icon-grid"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- 过滤器和排序 -->
    <div class="filters-bar">
      <div class="filter-group">
        <label>时间范围:</label>
        <select v-model="timeFilter" @change="applyFilters">
          <option value="all">全部时间</option>
          <option value="today">今天</option>
          <option value="week">本周</option>
          <option value="month">本月</option>
          <option value="custom">自定义</option>
        </select>
        <div v-if="timeFilter === 'custom'" class="date-range">
          <input 
            type="date" 
            v-model="customDateRange.start"
            @change="applyFilters"
          >
          <span>至</span>
          <input 
            type="date" 
            v-model="customDateRange.end"
            @change="applyFilters"
          >
        </div>
      </div>
      <div class="filter-group">
        <label>排序方式:</label>
        <select v-model="sortBy" @change="applySorting">
          <option value="updatedAt-desc">最近更新</option>
          <option value="createdAt-desc">创建时间(新到旧)</option>
          <option value="createdAt-asc">创建时间(旧到新)</option>
          <option value="messageCount-desc">消息数量(多到少)</option>
          <option value="title-asc">标题(A-Z)</option>
        </select>
      </div>
      <div class="filter-actions">
        <button class="btn btn-secondary btn-sm" @click="clearFilters">
          清除筛选
        </button>
        <button class="btn btn-primary btn-sm" @click="exportHistory">
          <i class="icon-export"></i>
          导出
        </button>
      </div>
    </div>

    <!-- 批量操作栏 -->
    <div class="bulk-actions" v-if="selectedSessions.length > 0">
      <div class="selection-info">
        已选择 {{ selectedSessions.length }} 个对话
      </div>
      <div class="bulk-buttons">
        <button class="btn btn-secondary btn-sm" @click="selectAll">
          全选
        </button>
        <button class="btn btn-secondary btn-sm" @click="clearSelection">
          取消选择
        </button>
        <button class="btn btn-warning btn-sm" @click="bulkExport">
          <i class="icon-export"></i>
          批量导出
        </button>
        <button class="btn btn-danger btn-sm" @click="bulkDelete">
          <i class="icon-delete"></i>
          批量删除
        </button>
      </div>
    </div>

    <!-- 会话列表 -->
    <div class="sessions-content" :class="`view-${viewMode}`">
      <div v-if="isLoading" class="loading-state">
        <div class="spinner"></div>
        <span>加载对话历史...</span>
      </div>
      
      <div v-else-if="filteredSessions.length === 0" class="empty-state">
        <div class="empty-content">
          <i class="icon-empty"></i>
          <h4>{{ searchQuery ? '未找到匹配的对话' : '暂无对话历史' }}</h4>
          <p>{{ searchQuery ? '尝试使用其他关键词搜索' : '开始一个新对话吧！' }}</p>
          <button v-if="!searchQuery" class="btn btn-primary" @click="$emit('create-session')">
            <i class="icon-plus"></i>
            创建新对话
          </button>
        </div>
      </div>

      <div v-else class="sessions-list">
        <div 
          v-for="session in paginatedSessions" 
          :key="session.id"
          class="session-card"
          :class="{ 
            selected: selectedSessions.includes(session.id),
            active: currentSessionId === session.id 
          }"
          @click="selectSession(session)"
        >
          <!-- 选择框 -->
          <div class="session-checkbox">
            <input 
              type="checkbox" 
              :checked="selectedSessions.includes(session.id)"
              @click.stop="toggleSelection(session.id)"
            >
          </div>

          <!-- 会话内容 -->
          <div class="session-content">
            <div class="session-header">
              <h4 class="session-title" :title="session.title">
                {{ session.title }}
              </h4>
              <div class="session-actions">
                <button 
                  class="action-btn"
                  @click.stop="editTitle(session)"
                  title="重命名"
                >
                  <i class="icon-edit"></i>
                </button>
                <button 
                  class="action-btn"
                  @click.stop="duplicateSession(session)"
                  title="复制"
                >
                  <i class="icon-copy"></i>
                </button>
                <button 
                  class="action-btn"
                  @click.stop="exportSession(session)"
                  title="导出"
                >
                  <i class="icon-export"></i>
                </button>
                <button 
                  class="action-btn danger"
                  @click.stop="deleteSession(session)"
                  title="删除"
                >
                  <i class="icon-delete"></i>
                </button>
              </div>
            </div>

            <div class="session-preview">
              <p class="preview-text">{{ getSessionPreview(session) }}</p>
            </div>

            <div class="session-meta">
              <div class="meta-left">
                <span class="meta-item">
                  <i class="icon-message"></i>
                  {{ session.metadata?.messageCount || session.messages.length || 0 }} 条消息
                </span>
                <span class="meta-item">
                  <i class="icon-time"></i>
                  {{ formatRelativeTime(session.updatedAt) }}
                </span>
              </div>
              <div class="meta-right">
                <span class="meta-item" v-if="session.tokenUsage">
                  <i class="icon-token"></i>
                  {{ session.tokenUsage.totalTokens }} tokens
                </span>
                <span class="session-date">
                  {{ formatDate(session.createdAt) }}
                </span>
              </div>
            </div>

            <!-- 标签 -->
            <div class="session-tags" v-if="session.metadata?.tags && session.metadata.tags.length > 0">
              <span 
                v-for="tag in session.metadata.tags" 
                :key="tag"
                class="session-tag"
              >
                {{ tag }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 分页 -->
      <div class="pagination" v-if="totalPages > 1">
        <button 
          class="page-btn"
          :disabled="currentPage === 1"
          @click="currentPage = 1"
        >
          首页
        </button>
        <button 
          class="page-btn"
          :disabled="currentPage === 1"
          @click="currentPage--"
        >
          上一页
        </button>
        <span class="page-info">
          第 {{ currentPage }} 页，共 {{ totalPages }} 页
        </span>
        <button 
          class="page-btn"
          :disabled="currentPage === totalPages"
          @click="currentPage++"
        >
          下一页
        </button>
        <button 
          class="page-btn"
          :disabled="currentPage === totalPages"
          @click="currentPage = totalPages"
        >
          末页
        </button>
      </div>
    </div>

    <!-- 统计信息 -->
    <div class="history-stats">
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-value">{{ sessions.length }}</div>
          <div class="stat-label">总对话数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ totalMessages }}</div>
          <div class="stat-label">总消息数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ totalTokens }}</div>
          <div class="stat-label">总Token数</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">{{ averageSessionLength }}</div>
          <div class="stat-label">平均长度</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { aiAgentAPI } from '../../services/serviceImpl/ai-agent'
import type { ChatSession } from '../../../../shared/cache-types/agent/agent'

// Props
interface Props {
  currentSessionId?: string
}

const props = withDefaults(defineProps<Props>(), {
  currentSessionId: ''
})

// Emits
const emit = defineEmits<{
  'session-selected': [session: ChatSession]
  'create-session': []
}>()

// 响应式数据
const sessions = ref<ChatSession[]>([])
const isLoading = ref(false)
const searchQuery = ref('')
const viewMode = ref<'list' | 'grid'>('list')
const selectedSessions = ref<string[]>([])
const currentPage = ref(1)
const pageSize = ref(20)

// 过滤和排序
const timeFilter = ref('all')
const sortBy = ref('updatedAt-desc')
const customDateRange = reactive({
  start: '',
  end: ''
})

// 搜索防抖
let searchTimeout: NodeJS.Timeout | null = null

// 计算属性
const filteredSessions = computed(() => {
  let result = [...sessions.value]

  // 搜索过滤
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(session => 
      session.title.toLowerCase().includes(query) ||
      (getSessionPreview(session) && getSessionPreview(session).toLowerCase().includes(query))
    )
  }

  // 时间过滤
  if (timeFilter.value !== 'all') {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    
    result = result.filter(session => {
      const sessionDate = new Date(session.updatedAt)
      
      switch (timeFilter.value) {
        case 'today':
          return sessionDate >= today
        case 'week':
          const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
          return sessionDate >= weekAgo
        case 'month':
          const monthAgo = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate())
          return sessionDate >= monthAgo
        case 'custom':
          if (customDateRange.start && customDateRange.end) {
            const startDate = new Date(customDateRange.start)
            const endDate = new Date(customDateRange.end)
            endDate.setHours(23, 59, 59, 999)
            return sessionDate >= startDate && sessionDate <= endDate
          }
          return true
        default:
          return true
      }
    })
  }

  // 排序
  const [field, order] = sortBy.value.split('-')
  result.sort((a, b) => {
    let aValue: any
    let bValue: any
    
    switch (field) {
      case 'updatedAt':
      case 'createdAt':
        aValue = new Date(a[field]).getTime()
        bValue = new Date(b[field]).getTime()
        break
      case 'messageCount':
        aValue = a.metadata?.messageCount || a.messages.length || 0
        bValue = b.metadata?.messageCount || b.messages.length || 0
        break
      case 'title':
        aValue = a.title.toLowerCase()
        bValue = b.title.toLowerCase()
        break
      default:
        return 0
    }
    
    if (order === 'desc') {
      return bValue > aValue ? 1 : bValue < aValue ? -1 : 0
    } else {
      return aValue > bValue ? 1 : aValue < bValue ? -1 : 0
    }
  })

  return result
})

const totalPages = computed(() => {
  return Math.ceil(filteredSessions.value.length / pageSize.value)
})

const paginatedSessions = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  const end = start + pageSize.value
  return filteredSessions.value.slice(start, end)
})

const totalMessages = computed(() => {
  return sessions.value.reduce((sum, session) => sum + (session.metadata?.messageCount || session.messages.length || 0), 0)
})

const totalTokens = computed(() => {
  return sessions.value.reduce((sum, session) => {
    return sum + (session.tokenUsage?.totalTokens || 0)
  }, 0)
})

const averageSessionLength = computed(() => {
  if (sessions.value.length === 0) return 0
  return Math.round(totalMessages.value / sessions.value.length)
})

// 生命周期
onMounted(() => {
  loadSessions()
})

// 监听器
watch(() => props.currentSessionId, () => {
  // 当前会话变化时，可以做一些处理
})

watch(currentPage, () => {
  // 页面变化时滚动到顶部
  const container = document.querySelector('.sessions-content')
  if (container) {
    container.scrollTop = 0
  }
})

// 方法
async function loadSessions() {
  isLoading.value = true
  try {
    sessions.value = await aiAgentAPI.getAllSessions()
    // 加载每个会话的预览信息
    await loadSessionPreviews()
  } catch (error) {
    console.error('加载会话列表失败:', error)
  } finally {
    isLoading.value = false
  }
}

async function loadSessionPreviews() {
  // 预览信息已经通过 getSessionPreview 方法动态生成，无需额外加载
  // 如果需要更新消息数量，可以在这里处理
  for (const session of sessions.value) {
    if (!session.metadata?.messageCount) {
      // 如果没有缓存的消息数量，使用当前消息数组长度
      if (!session.metadata) {
        session.metadata = {}
      }
      session.metadata.messageCount = session.messages.length
    }
  }
}

function handleSearch() {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  searchTimeout = setTimeout(() => {
    currentPage.value = 1 // 搜索时重置到第一页
  }, 300)
}

function applyFilters() {
  currentPage.value = 1
}

function applySorting() {
  currentPage.value = 1
}

function clearFilters() {
  searchQuery.value = ''
  timeFilter.value = 'all'
  sortBy.value = 'updatedAt-desc'
  customDateRange.start = ''
  customDateRange.end = ''
  currentPage.value = 1
}

function selectSession(session: ChatSession) {
  emit('session-selected', session)
}

function toggleSelection(sessionId: string) {
  const index = selectedSessions.value.indexOf(sessionId)
  if (index > -1) {
    selectedSessions.value.splice(index, 1)
  } else {
    selectedSessions.value.push(sessionId)
  }
}

function selectAll() {
  selectedSessions.value = filteredSessions.value.map(s => s.id)
}

function clearSelection() {
  selectedSessions.value = []
}

async function editTitle(session: ChatSession) {
  const newTitle = prompt('请输入新的对话标题:', session.title)
  if (newTitle && newTitle.trim() !== session.title) {
    try {
      const success = await aiAgentAPI.updateSessionTitle(session.id, newTitle.trim())
      if (success) {
        session.title = newTitle.trim()
      }
    } catch (error) {
      console.error('更新会话标题失败:', error)
      alert('更新标题失败，请稍后重试')
    }
  }
}

async function duplicateSession(session: ChatSession) {
  try {
    // 导出会话数据
    const sessionData = await aiAgentAPI.exportSession(session.id)
    if (sessionData) {
      // 修改标题并导入
      sessionData.title = `${session.title} (副本)`
      sessionData.id = Date.now().toString() // 生成新ID
      sessionData.createdAt = Date.now()
      sessionData.updatedAt = Date.now()
      
      const success = await aiAgentAPI.importSession(sessionData)
      if (success) {
        await loadSessions()
      }
    }
  } catch (error) {
    console.error('复制会话失败:', error)
    alert('复制会话失败，请稍后重试')
  }
}

async function deleteSession(session: ChatSession) {
  if (!confirm(`确定要删除对话 "${session.title}" 吗？此操作不可恢复。`)) {
    return
  }

  try {
    const success = await aiAgentAPI.deleteSession(session.id)
    if (success) {
      sessions.value = sessions.value.filter(s => s.id !== session.id)
      selectedSessions.value = selectedSessions.value.filter(id => id !== session.id)
    }
  } catch (error) {
    console.error('删除会话失败:', error)
    alert('删除会话失败，请稍后重试')
  }
}

async function exportSession(session: ChatSession) {
  try {
    const sessionData = await aiAgentAPI.exportSession(session.id)
    if (sessionData) {
      const blob = new Blob([JSON.stringify(sessionData, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${session.title}_${formatDate(session.createdAt)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  } catch (error) {
    console.error('导出会话失败:', error)
    alert('导出会话失败，请稍后重试')
  }
}

async function bulkDelete() {
  if (selectedSessions.value.length === 0) return
  
  if (!confirm(`确定要删除选中的 ${selectedSessions.value.length} 个对话吗？此操作不可恢复。`)) {
    return
  }

  try {
    for (const sessionId of selectedSessions.value) {
      await aiAgentAPI.deleteSession(sessionId)
    }
    sessions.value = sessions.value.filter(s => !selectedSessions.value.includes(s.id))
    selectedSessions.value = []
  } catch (error) {
    console.error('批量删除失败:', error)
    alert('批量删除失败，请稍后重试')
  }
}

async function bulkExport() {
  if (selectedSessions.value.length === 0) return

  try {
    const exportData: ChatSession[] = []
    for (const sessionId of selectedSessions.value) {
      const sessionData = await aiAgentAPI.exportSession(sessionId)
      if (sessionData) {
        exportData.push(sessionData)
      }
    }
    
    if (exportData.length > 0) {
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `chat_history_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  } catch (error) {
    console.error('批量导出失败:', error)
    alert('批量导出失败，请稍后重试')
  }
}

async function exportHistory() {
  try {
    const exportData: ChatSession[] = []
    for (const session of sessions.value) {
      const sessionData = await aiAgentAPI.exportSession(session.id)
      if (sessionData) {
        exportData.push(sessionData)
      }
    }
    
    if (exportData.length > 0) {
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `complete_chat_history_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  } catch (error) {
    console.error('导出历史失败:', error)
    alert('导出历史失败，请稍后重试')
  }
}

function getSessionPreview(session: ChatSession): string {
  if (session.messages && session.messages.length > 0) {
    // 找到第一条用户消息作为预览
    const firstUserMessage = session.messages.find(m => m.type === 'user')
    if (firstUserMessage) {
      return firstUserMessage.content.substring(0, 100) + (firstUserMessage.content.length > 100 ? '...' : '')
    }
    // 如果没有用户消息，使用第一条消息
    const firstMessage = session.messages[0]
    if (firstMessage) {
      return firstMessage.content.substring(0, 100) + (firstMessage.content.length > 100 ? '...' : '')
    }
  }
  return '暂无预览'
}

function formatDate(date: number | Date): string {
  const targetDate = typeof date === 'number' ? new Date(date) : date
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(targetDate)
}

function formatRelativeTime(date: number | Date): string {
  const now = new Date()
  const targetDate = typeof date === 'number' ? new Date(date) : date
  const diff = now.getTime() - targetDate.getTime()
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return formatDate(targetDate)
}
</script>

<style scoped>
.chat-history-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f8f9fa;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* 头部 */
.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: white;
  border-bottom: 1px solid #e9ecef;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.history-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #333;
  display: flex;
  align-items: center;
  gap: 8px;
}

.session-count {
  font-size: 14px;
  color: #666;
  background: #e9ecef;
  padding: 2px 8px;
  border-radius: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.search-input {
  width: 250px;
  padding: 8px 32px 8px 12px;
  border: 1px solid #ddd;
  border-radius: 20px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #007bff;
}

.search-box .icon-search {
  position: absolute;
  right: 12px;
  color: #666;
  pointer-events: none;
}

.view-controls {
  display: flex;
  border: 1px solid #ddd;
  border-radius: 6px;
  overflow: hidden;
}

.view-btn {
  padding: 6px 10px;
  border: none;
  background: white;
  cursor: pointer;
  color: #666;
  transition: all 0.2s;
}

.view-btn:hover {
  background: #f8f9fa;
}

.view-btn.active {
  background: #007bff;
  color: white;
}

/* 过滤器栏 */
.filters-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background: white;
  border-bottom: 1px solid #e9ecef;
  flex-wrap: wrap;
  gap: 16px;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.filter-group label {
  color: #666;
  font-weight: 500;
}

.filter-group select,
.filter-group input {
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
}

.date-range {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
}

.filter-actions {
  display: flex;
  gap: 8px;
}

/* 批量操作栏 */
.bulk-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 20px;
  background: #fff3cd;
  border-bottom: 1px solid #ffeaa7;
}

.selection-info {
  font-size: 14px;
  color: #856404;
  font-weight: 500;
}

.bulk-buttons {
  display: flex;
  gap: 8px;
}

/* 按钮样式 */
.btn {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
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

.btn-warning {
  background: #ffc107;
  color: #212529;
  border-color: #ffc107;
}

.btn-danger {
  background: #dc3545;
  color: white;
  border-color: #dc3545;
}

.btn-sm {
  padding: 4px 8px;
  font-size: 12px;
}

/* 会话内容区域 */
.sessions-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: #666;
}

.loading-state {
  gap: 16px;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #e9ecef;
  border-top: 3px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.empty-content {
  text-align: center;
}

.empty-content i {
  font-size: 48px;
  color: #dee2e6;
  margin-bottom: 16px;
}

.empty-content h4 {
  margin: 0 0 8px 0;
  color: #495057;
}

.empty-content p {
  margin: 0 0 20px 0;
  color: #6c757d;
}

/* 会话列表 */
.sessions-list {
  display: grid;
  gap: 16px;
}

.view-list .sessions-list {
  grid-template-columns: 1fr;
}

.view-grid .sessions-list {
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
}

.session-card {
  display: flex;
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.session-card:hover {
  border-color: #007bff;
  box-shadow: 0 2px 8px rgba(0,123,255,0.1);
}

.session-card.selected {
  border-color: #007bff;
  background: #f8f9ff;
}

.session-card.active {
  border-color: #28a745;
  background: #f8fff9;
}

.session-checkbox {
  margin-right: 12px;
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
}

.session-content {
  flex: 1;
  min-width: 0;
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.session-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 12px;
}

.session-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.session-card:hover .session-actions {
  opacity: 1;
}

.action-btn {
  background: none;
  border: none;
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  color: #666;
  font-size: 14px;
  transition: all 0.2s;
}

.action-btn:hover {
  background: #f8f9fa;
  color: #333;
}

.action-btn.danger:hover {
  background: #f8d7da;
  color: #dc3545;
}

.session-preview {
  margin-bottom: 12px;
}

.preview-text {
  margin: 0;
  font-size: 14px;
  color: #666;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.session-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #999;
  margin-bottom: 8px;
}

.meta-left,
.meta-right {
  display: flex;
  gap: 12px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.session-date {
  font-weight: 500;
}

.session-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.session-tag {
  padding: 2px 6px;
  background: #e9ecef;
  color: #495057;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 500;
}

/* 分页 */
.pagination {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
  padding: 16px;
}

.page-btn {
  padding: 6px 12px;
  border: 1px solid #ddd;
  background: white;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
  transition: all 0.2s;
}

.page-btn:hover:not(:disabled) {
  background: #f8f9fa;
  border-color: #007bff;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  font-size: 14px;
  color: #666;
  margin: 0 16px;
}

/* 统计信息 */
.history-stats {
  background: white;
  border-top: 1px solid #e9ecef;
  padding: 16px 20px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 20px;
  max-width: 600px;
  margin: 0 auto;
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: #007bff;
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: #666;
  font-weight: 500;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .history-header {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
  
  .header-right {
    justify-content: space-between;
  }
  
  .search-input {
    width: 200px;
  }
  
  .filters-bar {
    flex-direction: column;
    align-items: stretch;
  }
  
  .filter-group {
    flex-wrap: wrap;
  }
  
  .view-grid .sessions-list {
    grid-template-columns: 1fr;
  }
  
  .session-header {
    flex-direction: column;
    gap: 8px;
  }
  
  .session-actions {
    opacity: 1;
  }
  
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>