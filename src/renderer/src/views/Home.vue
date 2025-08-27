<template>
  <div class="home-container">
    <!-- 顶部标题栏 -->
    <header class="top-header">
      <div class="header-left">
        <h1 class="app-title">World Builder</h1>
        <div class="search-container">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索世界观..."
            class="search-input"
            @input="handleSearch"
          />
        </div>
      </div>
      <div class="header-right">
        <button class="btn btn-primary" @click="showCreateDialog = true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          创建新世界观
        </button>
      </div>
    </header>

    <!-- 主内容区域 -->
    <main class="main-content">
      <!-- 左侧：世界观区域 -->
      <section class="worlds-section">
        <div class="section-header">
          <h3>我的世界观</h3>
          <span class="section-subtitle">右键点击空白区域可创建新文件</span>
        </div>
        
        <div class="worlds-grid" @contextmenu="handleContextMenu">
          <!-- 现有世界观列表 -->
          <div
            v-for="world in filteredWorlds"
            :key="world.id"
            class="world-card"
            @click="openWorld(world.id)"
            @contextmenu.prevent="showWorldContextMenu($event, world)"
          >
            <div class="world-thumbnail">
              <img v-if="world.thumbnail" :src="world.thumbnail" :alt="world.name" />
              <div v-else class="world-placeholder">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                </svg>
              </div>
            </div>
            <div class="world-info">
              <h4>{{ world.name }}</h4>
              <p>{{ world.description }}</p>
              <div class="world-meta">
                <span class="world-date">{{ formatDate(world.updatedAt) }}</span>
                <div class="world-tags">
                  <span v-for="tag in world.tags.slice(0, 3)" :key="tag" class="tag">{{ tag }}</span>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 空状态 -->
          <div v-if="filteredWorlds.length === 0" class="empty-worlds">
            <div class="empty-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
              </svg>
            </div>
            <h3>还没有世界观</h3>
            <p>点击右上角的"创建新世界观"按钮开始构建你的第一个世界</p>
          </div>
        </div>
      </section>

      <!-- 右侧：最近使用和快捷操作 -->
      <aside class="sidebar">
        <!-- 最近使用文件 -->
        <section class="recent-section">
          <div class="section-header">
            <h3>最近使用</h3>
          </div>
          
          <div class="recent-list">
            <div
              v-for="file in recentFilesLimited"
              :key="file.id"
              class="recent-item"
              @click="openRecentFile(file)"
            >
              <div class="recent-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14,2 14,8 20,8"></polyline>
                </svg>
              </div>
              <div class="recent-info">
                <h4>{{ file.name }}</h4>
                <p>{{ formatDate(file.lastOpened) }}</p>
              </div>
              <button class="recent-remove" @click.stop="removeFromRecent(file.id)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            
            <div v-if="recentFilesLimited.length === 0" class="empty-recent">
              <p>暂无最近使用的文件</p>
            </div>
          </div>
        </section>

        <!-- 快捷操作 -->
        <section class="quick-actions">
          <div class="section-header">
            <h3>快捷操作</h3>
          </div>
          <div class="action-buttons">
            <button class="action-btn" @click="showCreateDialog = true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>新建世界观</span>
            </button>
            <button class="action-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14,2 14,8 20,8"></polyline>
              </svg>
              <span>导入文件</span>
            </button>
            <button class="action-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7,10 12,15 17,10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>导出备份</span>
            </button>
            <button class="action-btn" @click="openAIAgent">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
              </svg>
              <span>AI 智能助手</span>
            </button>
          </div>
        </section>
      </aside>
    </main>

    <!-- 创建世界观对话框 -->
    <div v-if="showCreateDialog" class="dialog-overlay" @click="closeCreateDialog">
      <div class="dialog" @click.stop>
        <div class="dialog-header">
          <h3>创建新世界观</h3>
          <button class="dialog-close" @click="closeCreateDialog">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        
        <form @submit.prevent="createWorld" class="dialog-form">
          <div class="form-group">
            <label for="worldName">世界观名称</label>
            <input
              id="worldName"
              v-model="newWorld.name"
              type="text"
              required
              placeholder="输入世界观名称"
            />
          </div>
          
          <div class="form-group">
            <label for="worldDescription">描述</label>
            <textarea
              id="worldDescription"
              v-model="newWorld.description"
              placeholder="简要描述这个世界观"
              rows="3"
            ></textarea>
          </div>
          
          <div class="form-group">
            <label for="worldTags">标签</label>
            <input
              id="worldTags"
              v-model="newWorld.tagsInput"
              type="text"
              placeholder="用逗号分隔标签，如：奇幻,魔法,中世纪"
            />
          </div>
          
          <div class="dialog-actions">
            <button type="button" class="btn btn-secondary" @click="closeCreateDialog">
              取消
            </button>
            <button type="submit" class="btn btn-primary" :disabled="!newWorld.name.trim()">
              创建
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 右键菜单 -->
    <div v-if="contextMenu.show" class="context-menu" :style="contextMenuStyle">
      <div class="context-menu-item" @click="showCreateDialog = true; contextMenu.show = false">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        创建新世界观
      </div>
    </div>

    <!-- 世界观右键菜单 -->
    <div v-if="worldContextMenu.show" class="context-menu" :style="worldContextMenuStyle">
      <div class="context-menu-item" @click="openWorld(worldContextMenu.world?.id)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
          <polyline points="14,2 14,8 20,8"></polyline>
        </svg>
        打开
      </div>
      <div class="context-menu-item" @click="renameWorld(worldContextMenu.world)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
        </svg>
        重命名
      </div>
      <div class="context-menu-item danger" @click="deleteWorld(worldContextMenu.world?.id)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3,6 5,6 21,6"></polyline>
          <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
        </svg>
        删除
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="uiState.loading" class="loading-overlay">
      <div class="loading-spinner"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useWorldStore } from '../stores/world'
import type { WorldData, RecentFile } from '../types/world'

const router = useRouter()
const worldStore = useWorldStore()

// 从store获取响应式数据
const { 
  searchQuery, 
  filteredWorlds, 
  recentFilesLimited, 
  uiState 
} = storeToRefs(worldStore)

// 本地状态
const showCreateDialog = ref(false)
const newWorld = ref({
  name: '',
  description: '',
  tagsInput: ''
})

// 右键菜单状态
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0
})

const worldContextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  world: null as WorldData | null
})

// 计算属性
const contextMenuStyle = computed(() => ({
  left: `${contextMenu.value.x}px`,
  top: `${contextMenu.value.y}px`
}))

const worldContextMenuStyle = computed(() => ({
  left: `${worldContextMenu.value.x}px`,
  top: `${worldContextMenu.value.y}px`
}))

// 方法
const handleSearch = () => {
  // 搜索逻辑已在store中处理
}

const handleContextMenu = (event: MouseEvent) => {
  event.preventDefault()
  contextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY
  }
}

const showWorldContextMenu = (event: MouseEvent, world: WorldData) => {
  event.preventDefault()
  worldContextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    world
  }
}

const closeCreateDialog = () => {
  showCreateDialog.value = false
  newWorld.value = {
    name: '',
    description: '',
    tagsInput: ''
  }
}

const createWorld = async () => {
  try {
    const tags = newWorld.value.tagsInput
      .split(',')
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)

    const worldData = {
      name: newWorld.value.name.trim(),
      description: newWorld.value.description.trim(),
      tags,
      thumbnail: '',
      author: 'User', // 默认作者
      lastModified: new Date()
    }

    const created = await worldStore.createWorld(worldData)
    closeCreateDialog()
    
    // 创建成功后跳转到编辑器
    router.push(`/editor/${created.id}`)
  } catch (error) {
    console.error('Failed to create world:', error)
  }
}

const openWorld = async (worldId?: string) => {
  if (!worldId) return
  
  try {
    await worldStore.openWorld(worldId)
    router.push(`/editor/${worldId}`)
  } catch (error) {
    console.error('Failed to open world:', error)
  }
}

const openRecentFile = async (file: RecentFile) => {
  if (file.type === 'world') {
    await openWorld(file.id)
  }
}

const removeFromRecent = (fileId: string) => {
  worldStore.removeFromRecentFiles(fileId)
}

const renameWorld = (world: WorldData | null) => {
  if (!world) return
  
  const newName = prompt('请输入新名称:', world.name)
  if (newName && newName.trim() !== world.name) {
    worldStore.updateWorld(world.id, { name: newName.trim() })
  }
  
  worldContextMenu.value.show = false
}

const deleteWorld = async (worldId?: string) => {
  if (!worldId) return
  
  if (confirm('确定要删除这个世界观吗？此操作不可撤销。')) {
    try {
      await worldStore.deleteWorld(worldId)
    } catch (error) {
      console.error('Failed to delete world:', error)
    }
  }
  
  worldContextMenu.value.show = false
}

const openAIAgent = () => {
  router.push('/ai-agent')
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

// 点击外部关闭菜单
const handleClickOutside = () => {
  contextMenu.value.show = false
  worldContextMenu.value.show = false
}

// 生命周期
onMounted(async () => {
  document.addEventListener('click', handleClickOutside)
  await worldStore.initialize()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.home-container {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  width: 100vw;
  background-color: #f8f9fa;
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

/* 顶部标题栏 */
.top-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e9ecef;
  box-shadow: 0 2px 4px rgba(0,0,0,0.04);
  z-index: 100;
  position: relative;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 24px;
}

.app-title {
  font-size: 24px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0;
}

.search-container {
  width: 400px;
}

.search-input {
  width: 100%;
  padding: 10px 16px;
  font-size: 14px;
  border: 2px solid #e9ecef;
  border-radius: 8px;
  outline: none;
  transition: all 0.3s;
  background: #f8f9fa;
}

.search-input:focus {
  border-color: #3498db;
  background: white;
  box-shadow: 0 0 0 3px rgba(52, 152, 219, 0.1);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 主内容区域 */
.main-content {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 世界观区域 */
.worlds-section {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.section-header {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 20px;
}

.section-header h3 {
  font-size: 20px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0;
}

.section-subtitle {
  font-size: 14px;
  color: #6c757d;
  font-weight: 400;
}

/* 右侧边栏 */
.sidebar {
  width: 320px;
  background: white;
  border-left: 1px solid #e9ecef;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.recent-section {
  flex: 1;
  padding: 24px 20px;
  overflow-y: auto;
}

.quick-actions {
  padding: 20px;
  border-top: 1px solid #e9ecef;
  background: #f8f9fa;
}

.worlds-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.world-card {
  background: white;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  cursor: pointer;
  transition: all 0.3s;
  border: 1px solid #e9ecef;
}

.world-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  border-color: #3498db;
}

/* 空状态 */
.empty-worlds {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-icon {
  color: #adb5bd;
  margin-bottom: 20px;
}

.empty-worlds h3 {
  font-size: 18px;
  font-weight: 500;
  color: #6c757d;
  margin: 0 0 8px 0;
}

.empty-worlds p {
  font-size: 14px;
  color: #adb5bd;
  margin: 0;
  max-width: 400px;
  line-height: 1.5;
}

.world-thumbnail {
  width: 100%;
  height: 120px;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 15px;
  background: #ecf0f1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.world-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.world-placeholder {
  color: #bdc3c7;
}

.world-info h4 {
  font-size: 16px;
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 8px 0;
}

.world-info p {
  font-size: 14px;
  color: #7f8c8d;
  margin: 0 0 12px 0;
  line-height: 1.4;
}

.world-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.world-date {
  font-size: 12px;
  color: #95a5a6;
}

.world-tags {
  display: flex;
  gap: 4px;
}

.tag {
  background: #e8f4fd;
  color: #2980b9;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.recent-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  border: 1px solid transparent;
}

.recent-item:hover {
  background-color: #f8f9fa;
  border-color: #e9ecef;
}

.recent-icon {
  color: #6c757d;
  margin-right: 10px;
  flex-shrink: 0;
}

.recent-info {
  flex: 1;
  min-width: 0;
}

.recent-info h4 {
  font-size: 13px;
  font-weight: 500;
  color: #2c3e50;
  margin: 0 0 2px 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recent-info p {
  font-size: 11px;
  color: #6c757d;
  margin: 0;
}

.recent-remove {
  background: none;
  border: none;
  color: #adb5bd;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.3s;
  flex-shrink: 0;
}

.recent-remove:hover {
  background: #dc3545;
  color: white;
}

.empty-recent {
  padding: 32px 12px;
  text-align: center;
  color: #adb5bd;
  font-size: 13px;
}

/* 快捷操作 */
.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: white;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 14px;
  color: #495057;
  text-align: left;
}

.action-btn:hover {
  background: #f8f9fa;
  border-color: #3498db;
  color: #3498db;
}

.action-btn svg {
  flex-shrink: 0;
}

.action-btn span {
  font-weight: 500;
}

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
  max-width: 500px;
  max-height: 80vh;
  overflow-y: auto;
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 20px 0 20px;
  border-bottom: 1px solid #ecf0f1;
  margin-bottom: 20px;
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #2c3e50;
}

.dialog-close {
  background: none;
  border: none;
  color: #95a5a6;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.3s;
}

.dialog-close:hover {
  background: #ecf0f1;
  color: #2c3e50;
}

.dialog-form {
  padding: 0 20px 20px 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: #2c3e50;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 10px 12px;
  border: 2px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.3s;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group textarea:focus {
  border-color: #3498db;
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

.dialog-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 30px;
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
  background: #ecf0f1;
  color: #2c3e50;
}

.btn-secondary:hover {
  background: #d5dbdb;
}

.btn-primary {
  background: #3498db;
  color: white;
}

.btn-primary:hover {
  background: #2980b9;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.context-menu {
  position: fixed;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  border: 1px solid #ecf0f1;
  z-index: 1000;
  min-width: 150px;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.3s;
  font-size: 14px;
  color: #2c3e50;
}

.context-menu-item:hover {
  background: #f8f9fa;
}

.context-menu-item.danger {
  color: #e74c3c;
}

.context-menu-item.danger:hover {
  background: #fdf2f2;
}

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
  border: 4px solid #ecf0f1;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>