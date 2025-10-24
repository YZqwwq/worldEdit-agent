<template>
  <div class="session-list-container">
    <!-- 头部 -->
    <div class="session-header">
      <div class="header-left">
        <h3 class="session-title">
          <i class="icon-chat"></i>
          会话列表
        </h3>
        <span class="session-count">{{ sessions.length }} 个会话</span>
      </div>
      <div class="header-right">
        <button 
          class="btn btn-primary btn-sm"
          @click="createNewSession"
          title="新建会话"
        >
          <i class="icon-plus"></i>
          新建
        </button>
      </div>
    </div>

    <!-- 搜索框 -->
    <div class="search-section">
      <div class="search-box">
        <input 
          type="text" 
          v-model="searchQuery"
          @input="handleSearch"
          placeholder="搜索会话..."
          class="search-input"
        >
        <i class="icon-search"></i>
      </div>
    </div>

    <!-- 会话列表 -->
    <div class="sessions-content">
      <div v-if="isLoading" class="loading-state">
        <div class="spinner"></div>
        <span>加载会话...</span>
      </div>
      
      <div v-else-if="filteredSessions.length === 0" class="empty-state">
        <div class="empty-content">
          <i class="icon-empty"></i>
          <h4>{{ searchQuery ? '未找到匹配的会话' : '暂无会话' }}</h4>
          <p>{{ searchQuery ? '尝试使用其他关键词搜索' : '开始一个新会话吧！' }}</p>
          <button v-if="!searchQuery" class="btn btn-primary" @click="createNewSession">
            <i class="icon-plus"></i>
            创建新会话
          </button>
        </div>
      </div>

      <div v-else class="sessions-list">
        <div 
          v-for="session in filteredSessions" 
          :key="session.id"
          class="session-item"
          :class="{ active: currentSessionId === session.id }"
          @click="selectSession(session)"
        >
          <!-- 会话内容 -->
          <div class="session-content">
            <div class="session-main">
              <h4 class="session-title" :title="session.title">
                {{ session.title }}
              </h4>
              <div class="session-preview">
                {{ getSessionPreview(session) }}
              </div>
            </div>

            <div class="session-meta">
              <div class="meta-info">
                <span class="message-count">
                  <i class="icon-message"></i>
                  {{ getMessageCount(session) }}
                </span>
                <span class="update-time">
                  {{ formatRelativeTime(session.updatedAt) }}
                </span>
              </div>
              
              <div class="session-actions">
                <button 
                  class="action-btn"
                  @click.stop="editSessionTitle(session)"
                  title="重命名"
                >
                  <i class="icon-edit"></i>
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
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAIAgent } from '../../composables/useAIAgent'
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
  'session-created': [session: ChatSession]
  'session-deleted': [sessionId: string]
  'session-renamed': [session: ChatSession]
}>()

// 使用AI Agent组合式API
const {
  sessions,
  isLoading,
  currentSession,
  loadSessions,
  createSession,
  deleteSession: removeSession,
  renameSession
} = useAIAgent()

// 本地状态
const searchQuery = ref('')

// 搜索防抖
let searchTimeout: NodeJS.Timeout | null = null

// 计算属性
const filteredSessions = computed(() => {
  if (!searchQuery.value.trim()) {
    return sessions.value
  }

  const query = searchQuery.value.toLowerCase()
  return sessions.value.filter(session => 
    session.title.toLowerCase().includes(query) ||
    getSessionPreview(session).toLowerCase().includes(query)
  )
})

// 方法
const handleSearch = () => {
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }
  searchTimeout = setTimeout(() => {
    // 搜索逻辑已在计算属性中处理
  }, 300)
}

const selectSession = (session: ChatSession) => {
  emit('session-selected', session)
}

const createNewSession = async () => {
  try {
    const newSession = await createSession()
    emit('session-created', newSession)
  } catch (error) {
    console.error('创建会话失败:', error)
  }
}

const deleteSession = async (session: ChatSession) => {
  if (confirm(`确定要删除会话"${session.title}"吗？`)) {
    try {
      await removeSession(session.id)
      emit('session-deleted', session.id)
    } catch (error) {
      console.error('删除会话失败:', error)
    }
  }
}

const editSessionTitle = async (session: ChatSession) => {
  const newTitle = prompt('请输入新的会话标题:', session.title)
  if (newTitle && newTitle.trim() && newTitle !== session.title) {
    try {
      const updatedSession = await renameSession(session.id, newTitle.trim())
      emit('session-renamed', updatedSession)
    } catch (error) {
      console.error('重命名会话失败:', error)
    }
  }
}

const getSessionPreview = (session: ChatSession): string => {
  if (!session.messages || session.messages.length === 0) {
    return '暂无消息'
  }
  
  const lastMessage = session.messages[session.messages.length - 1]
  const content = lastMessage.content
  
  if (typeof content === 'string') {
    return content.length > 50 ? content.substring(0, 50) + '...' : content
  }
  
  return '暂无消息'
}

const getMessageCount = (session: ChatSession): string => {
  const count = session.metadata?.messageCount || session.messages?.length || 0
  return `${count} 条消息`
}

const formatRelativeTime = (timestamp: string | Date): string => {
  const now = new Date()
  const time = new Date(timestamp)
  const diff = now.getTime() - time.getTime()
  
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  
  return time.toLocaleDateString('zh-CN')
}

// 生命周期
onMounted(async () => {
  await loadSessions()
})

// 监听当前会话变化
watch(() => props.currentSessionId, (newId) => {
  // 可以在这里处理当前会话变化的逻辑
})
</script>

<style scoped>
.session-list-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color, #ffffff);
  border-right: 1px solid var(--border-color, #e5e7eb);
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  background: var(--header-bg, #f9fafb);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.session-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary, #111827);
}

.session-count {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  background: var(--badge-bg, #f3f4f6);
  padding: 2px 8px;
  border-radius: 12px;
}

.search-section {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.search-box {
  position: relative;
}

.search-input {
  width: 100%;
  padding: 8px 12px 8px 36px;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 8px;
  font-size: 14px;
  background: var(--input-bg, #ffffff);
  transition: border-color 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: var(--primary-color, #3b82f6);
  box-shadow: 0 0 0 3px var(--primary-color-alpha, rgba(59, 130, 246, 0.1));
}

.search-box .icon-search {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-secondary, #6b7280);
  font-size: 14px;
}

.sessions-content {
  flex: 1;
  overflow-y: auto;
}

.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border-color, #e5e7eb);
  border-top: 2px solid var(--primary-color, #3b82f6);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.empty-content h4 {
  margin: 12px 0 8px;
  color: var(--text-primary, #111827);
}

.empty-content p {
  margin: 0 0 16px;
  color: var(--text-secondary, #6b7280);
  font-size: 14px;
}

.sessions-list {
  padding: 8px 0;
}

.session-item {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light, #f3f4f6);
  cursor: pointer;
  transition: background-color 0.2s;
}

.session-item:hover {
  background: var(--hover-bg, #f9fafb);
}

.session-item.active {
  background: var(--active-bg, #eff6ff);
  border-left: 3px solid var(--primary-color, #3b82f6);
}

.session-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.session-main .session-title {
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 4px;
  color: var(--text-primary, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-preview {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.meta-info {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: var(--text-tertiary, #9ca3af);
}

.message-count,
.update-time {
  display: flex;
  align-items: center;
  gap: 4px;
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

.action-btn {
  padding: 4px;
  border: none;
  background: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-secondary, #6b7280);
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--hover-bg, #f3f4f6);
  color: var(--text-primary, #111827);
}

.action-btn.danger:hover {
  background: var(--danger-bg, #fef2f2);
  color: var(--danger-color, #dc2626);
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  text-decoration: none;
}

.btn-primary {
  background: var(--primary-color, #3b82f6);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-hover, #2563eb);
}

.btn-sm {
  padding: 6px 10px;
  font-size: 12px;
}

/* 图标样式 */
.icon-chat::before { content: '💬'; }
.icon-plus::before { content: '+'; }
.icon-search::before { content: '🔍'; }
.icon-empty::before { content: '📝'; }
.icon-message::before { content: '💬'; }
.icon-edit::before { content: '✏️'; }
.icon-delete::before { content: '🗑️'; }
</style>