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
        <h1 class="world-title">{{ world?.name || '世界观编辑器' }}</h1>
      </div>
    </header>

    <!-- 主编辑区域 -->
    <main class="editor-main">
      <!-- 左侧工具导航 -->
      <aside class="tool-sidebar">
        <nav class="tool-nav">
          <div class="nav-section">
            <h3>世界观工具</h3>
            <ul class="nav-list">
              <li>
                <button class="nav-item" @click="setActiveSection('overview')" :class="{ active: activeSection === 'overview' }">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 3h18v18H3zM9 9h6v6H9z"/>
                  </svg>
                  概览
                </button>
              </li>
              <li>
                <button class="nav-item" @click="setActiveSection('text-editor')" :class="{ active: activeSection === 'text-editor' }">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10,9 9,9 8,9"/>
                  </svg>
                  富文本编辑器
                </button>
              </li>
              <li>
                <button class="nav-item" @click="setActiveSection('settings')" :class="{ active: activeSection === 'settings' }">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1m17-4a4 4 0 0 1-8 0 4 4 0 0 1 8 0zM7 21a4 4 0 0 1-8 0 4 4 0 0 1 8 0z"/>
                  </svg>
                  设置
                </button>
              </li>
            </ul>
          </div>
        </nav>
      </aside>

      <!-- 右侧内容区域 -->
      <section class="content-area">
        <!-- 概览内容 -->
        <div v-if="activeSection === 'overview'" class="section-content">
          <div class="section-header">
            <h2>世界观概览</h2>
            <p>查看和管理你的世界观基本信息</p>
          </div>
          
          <div class="world-info" v-if="world">
            <div class="info-grid">
              <div class="info-item">
                <label>名称:</label>
                <span>{{ world.name }}</span>
              </div>
              <div class="info-item">
                <label>描述:</label>
                <span>{{ world.description || '暂无描述' }}</span>
              </div>
              <div class="info-item">
                <label>创建时间:</label>
                <span>{{ formatDate(world.createdAt) }}</span>
              </div>
              <div class="info-item">
                <label>最后修改:</label>
                <span>{{ formatDate(world.updatedAt) }}</span>
              </div>
              <div class="info-item" v-if="world.tags && world.tags.length > 0">
                <label>标签:</label>
                <div class="tags">
                  <span v-for="tag in world.tags" :key="tag" class="tag">{{ tag }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 设置内容 -->
        <div v-else-if="activeSection === 'settings'" class="section-content">
          <div class="section-header">
            <h2>世界观设置</h2>
            <p>配置世界观的基本参数和选项</p>
          </div>
          
          <div class="settings-panel">
            <div class="setting-group">
              <h3>基本设置</h3>
              <div class="setting-item">
                <label>世界观名称</label>
                <input v-model="editForm.name" type="text" class="form-input" />
              </div>
              <div class="setting-item">
                <label>描述</label>
                <textarea v-model="editForm.description" class="form-textarea" rows="3"></textarea>
              </div>
              <div class="setting-item">
                <label>标签</label>
                <input v-model="editForm.tagsInput" type="text" class="form-input" placeholder="用逗号分隔多个标签" />
              </div>
              <div class="setting-actions">
                <button @click="saveSettings" class="btn-primary" :disabled="loading">保存设置</button>
                <button @click="resetForm" class="btn-secondary">重置</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 默认欢迎内容 -->
        <div v-else class="section-content">
          <div class="welcome-header">
            <h2>欢迎来到世界观编辑器</h2>
            <p>选择左侧的工具开始管理你的世界观</p>
          </div>
        </div>
      </section>
    </main>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorldStore } from '../stores/worldStore'
import { useWorldTextStore } from '../stores/worldTextStore'


// Props
const props = defineProps<{
  worldId: string
}>()

const router = useRouter()
const worldStore = useWorldStore()
const worldTextStore = useWorldTextStore()

// 本地状态
const activeSection = ref('overview')
const loading = ref(false)
const world = ref<any>(null)

// 编辑表单
const editForm = reactive({
  name: '',
  description: '',
  tagsInput: ''
})

// 方法
const goBack = () => {
  router.push('/')
}

const setActiveSection = async (section: string) => {
  if (section === 'text-editor') {
    try {
      loading.value = true
      // 确保 WorldContent 存在，如果不存在则创建
      await worldTextStore.getWorldText(props.worldId)
      router.push(`/prosemirror-editor/${props.worldId}`)
    } catch (error) {
      console.error('Failed to initialize world content:', error)
    } finally {
      loading.value = false
    }
  } else {
    activeSection.value = section
  }
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

const saveSettings = async () => {
  if (!world.value) return
  
  try {
    loading.value = true
    const updatedData = {
      ...world.value,
      name: editForm.name,
      description: editForm.description,
      tags: editForm.tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag)
    }
    
    await worldStore.updateWorld(world.value.id, {
      name: editForm.name,
      description: editForm.description,
      tags: editForm.tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag)
    })
    world.value = updatedData
    console.log('World settings saved successfully')
  } catch (error) {
    console.error('Failed to save world settings:', error)
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  if (world.value) {
    editForm.name = world.value.name || ''
    editForm.description = world.value.description || ''
    editForm.tagsInput = world.value.tags ? world.value.tags.join(', ') : ''
  }
}

// 生命周期
onMounted(async () => {
  console.log('Loading world:', props.worldId)
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



.editor-main {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.tool-sidebar {
  width: 280px;
  background: white;
  border-right: 1px solid #e9ecef;
  overflow-y: auto;
}

.tool-nav {
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
  background: none;
  border: none;
  border-left: 3px solid transparent;
  width: 100%;
  text-align: left;
  cursor: pointer;
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

.section-content {
  max-width: 800px;
  margin: 0 auto;
}

.section-header {
  text-align: center;
  margin-bottom: 48px;
}

.section-header h2 {
  font-size: 32px;
  font-weight: 700;
  color: #212529;
  margin: 0 0 12px 0;
}

.section-header p {
  font-size: 16px;
  color: #6c757d;
  margin: 0;
}

.settings-panel {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.setting-group h3 {
  font-size: 18px;
  font-weight: 600;
  color: #212529;
  margin: 0 0 20px 0;
}

.setting-item {
  margin-bottom: 20px;
}

.setting-item label {
  display: block;
  font-weight: 600;
  color: #495057;
  margin-bottom: 8px;
}

.form-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  font-size: 14px;
  transition: border-color 0.3s;
}

.form-input:focus {
  outline: none;
  border-color: #007bff;
}

.form-textarea {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  font-size: 14px;
  resize: vertical;
  transition: border-color 0.3s;
}

.form-textarea:focus {
  outline: none;
  border-color: #007bff;
}

.setting-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.btn-primary {
  padding: 12px 24px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary:hover {
  background: #0056b3;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  padding: 12px 24px;
  background: #6c757d;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-secondary:hover {
  background: #545b62;
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