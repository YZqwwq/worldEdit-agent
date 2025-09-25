<template>
  <div class="editor-container">
    <!-- 顶部导航栏 -->
    <header class="editor-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m12 19-7-7 7-7"/>
            <path d="m19 12H5"/>
          </svg>
        </button>
        <h1 class="world-title">{{ currentWorld?.name || '世界观编辑器' }}</h1>
      </div>
      
      <div class="header-right">
        <button class="save-btn" @click="saveWorld" :disabled="uiState.loading">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
            <polyline points="17,21 17,13 7,13 7,21"/>
            <polyline points="7,3 7,8 15,8"/>
          </svg>
          保存
        </button>
      </div>
    </header>

    <!-- 主编辑区域 -->
    <main class="editor-main">
      <!-- 左侧模块导航 -->
      <aside class="module-sidebar">
        <nav class="module-nav">
          <div class="nav-section">
            <h3>编辑模块</h3>
            <ul class="nav-list">
              <li>
                <router-link 
                  :to="`/text-editor/${worldId}`" 
                  class="nav-item"
                  active-class="active"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10,9 9,9 8,9"/>
                  </svg>
                  文本编辑器
                </router-link>
              </li>
              <li>
                <router-link 
                  :to="`/character-editor/${worldId}`" 
                  class="nav-item"
                  active-class="active"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                  角色编辑器
                </router-link>
              </li>
              <li>
                <router-link 
                  :to="`/map-editor/${worldId}`" 
                  class="nav-item"
                  active-class="active"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/>
                    <path d="M9 3v15"/>
                    <path d="M15 6v15"/>
                  </svg>
                  地图编辑器
                </router-link>
              </li>
            </ul>
          </div>
          
          <div class="nav-section">
            <h3>世界观要素</h3>
            <ul class="nav-list">
              <li>
                <a href="#" class="nav-item" @click="setActiveSection('geography')">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                    <circle cx="12" cy="10" r="3"/>
                  </svg>
                  地理环境
                </a>
              </li>
              <li>
                <a href="#" class="nav-item" @click="setActiveSection('nations')">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                    <line x1="4" y1="22" x2="4" y2="15"/>
                  </svg>
                  国家势力
                </a>
              </li>
              <li>
                <a href="#" class="nav-item" @click="setActiveSection('factions')">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  组织派系
                </a>
              </li>
              <li>
                <a href="#" class="nav-item" @click="setActiveSection('power-systems')">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                  </svg>
                  力量体系
                </a>
              </li>
            </ul>
          </div>
        </nav>
      </aside>

      <!-- 右侧内容区域 -->
      <section class="content-area">
        <div class="welcome-content">
          <div class="welcome-header">
            <h2>欢迎来到世界观编辑器</h2>
            <p>选择左侧的编辑模块开始创建你的世界观</p>
          </div>
          
          <div class="quick-actions">
            <div class="action-grid">
              <div class="action-card" @click="$router.push(`/text-editor/${worldId}`)">
                <div class="action-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                </div>
                <h3>文本编辑</h3>
                <p>使用富文本编辑器创建世界观描述、故事背景等文本内容</p>
              </div>
              
              <div class="action-card" @click="$router.push(`/character-editor/${worldId}`)">
                <div class="action-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                    <circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
                <h3>角色设计</h3>
                <p>创建和编辑角色信息，包括外观、性格、背景等详细设定</p>
              </div>
              
              <div class="action-card" @click="$router.push(`/map-editor/${worldId}`)">
                <div class="action-icon">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/>
                    <path d="M9 3v15"/>
                    <path d="M15 6v15"/>
                  </svg>
                </div>
                <h3>地图绘制</h3>
                <p>使用画布工具绘制世界地图，标记重要地点和区域</p>
              </div>
            </div>
          </div>
          
          <div class="world-info" v-if="currentWorld">
            <h3>当前世界观信息</h3>
            <div class="info-grid">
              <div class="info-item">
                <label>名称:</label>
                <span>{{ currentWorld.name }}</span>
              </div>
              <div class="info-item">
                <label>描述:</label>
                <span>{{ currentWorld.description || '暂无描述' }}</span>
              </div>
              <div class="info-item">
                <label>创建时间:</label>
                <span>{{ formatDate(currentWorld.createdAt) }}</span>
              </div>
              <div class="info-item">
                <label>最后修改:</label>
                <span>{{ formatDate(currentWorld.updatedAt) }}</span>
              </div>
              <div class="info-item" v-if="currentWorld.tags && currentWorld.tags.length > 0">
                <label>标签:</label>
                <div class="tags">
                  <span v-for="tag in currentWorld.tags" :key="tag" class="tag">{{ tag }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- 加载状态 -->
    <div v-if="uiState.loading" class="loading-overlay">
      <div class="loading-spinner"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useWorldStore } from '../stores/worldStore'

// Props
const props = defineProps<{
  worldId: string
}>()

const router = useRouter()
const worldStore = useWorldStore()

// 从store获取响应式数据
const { currentWorld, uiState } = storeToRefs(worldStore)

// 本地状态
const activeSection = ref('')

// 方法
const goBack = () => {
  router.push('/')
}

const saveWorld = async () => {
  try {
    await worldStore.saveWorld()
    // 可以添加保存成功的提示
  } catch (error) {
    console.error('Failed to save world:', error)
    // 可以添加保存失败的提示
  }
}

const setActiveSection = (section: string) => {
  activeSection.value = section
  // 这里可以添加显示对应内容的逻辑
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
onMounted(async () => {
  // 如果当前没有加载世界观数据，则加载
  if (!currentWorld.value || currentWorld.value.id !== props.worldId) {
    try {
      await worldStore.openWorld(props.worldId)
    } catch (error) {
      console.error('Failed to load world:', error)
      router.push('/')
    }
  }
})
</script>

<style scoped>
.editor-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #f8f9fa;
  z-index: 1;
}

.editor-header {
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e9ecef;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  z-index: 100;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back-btn {
  background: none;
  border: none;
  color: #6c757d;
  cursor: pointer;
  padding: 8px;
  border-radius: 6px;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.back-btn:hover {
  background: #f8f9fa;
  color: #495057;
}

.world-title {
  font-size: 20px;
  font-weight: 600;
  color: #212529;
  margin: 0;
}

.header-right {
  display: flex;
  gap: 12px;
}

.save-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.save-btn:hover {
  background: #0056b3;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.editor-main {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.module-sidebar {
  width: 280px;
  background: white;
  border-right: 1px solid #e9ecef;
  overflow-y: auto;
}

.module-nav {
  padding: 24px 0;
}

.nav-section {
  margin-bottom: 32px;
}

.nav-section h3 {
  font-size: 14px;
  font-weight: 600;
  color: #6c757d;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0 0 16px 24px;
}

.nav-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  color: #495057;
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s;
  border-left: 3px solid transparent;
}

.nav-item:hover {
  background: #f8f9fa;
  color: #007bff;
}

.nav-item.active {
  background: #e3f2fd;
  color: #007bff;
  border-left-color: #007bff;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
}

.welcome-content {
  max-width: 800px;
  margin: 0 auto;
}

.welcome-header {
  text-align: center;
  margin-bottom: 48px;
}

.welcome-header h2 {
  font-size: 32px;
  font-weight: 700;
  color: #212529;
  margin: 0 0 12px 0;
}

.welcome-header p {
  font-size: 16px;
  color: #6c757d;
  margin: 0;
}

.quick-actions {
  margin-bottom: 48px;
}

.action-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 24px;
}

.action-card {
  background: white;
  border-radius: 12px;
  padding: 32px 24px;
  text-align: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  cursor: pointer;
  transition: all 0.3s;
  border: 2px solid transparent;
}

.action-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  border-color: #007bff;
}

.action-icon {
  color: #007bff;
  margin-bottom: 16px;
}

.action-card h3 {
  font-size: 18px;
  font-weight: 600;
  color: #212529;
  margin: 0 0 12px 0;
}

.action-card p {
  font-size: 14px;
  color: #6c757d;
  line-height: 1.5;
  margin: 0;
}

.world-info {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.world-info h3 {
  font-size: 18px;
  font-weight: 600;
  color: #212529;
  margin: 0 0 20px 0;
}

.info-grid {
  display: grid;
  gap: 16px;
}

.info-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.info-item label {
  font-weight: 600;
  color: #495057;
  min-width: 80px;
  flex-shrink: 0;
}

.info-item span {
  color: #212529;
  flex: 1;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag {
  background: #e3f2fd;
  color: #1976d2;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
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
  z-index: 1000;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e9ecef;
  border-top: 4px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>