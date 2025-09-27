<template>
  <div class="prosemirror-editor-page">
    <!-- 顶部导航栏 -->
    <div class="top-bar">
      <div class="nav-left">
        <button @click="goBack" class="back-btn">
          <i class="icon-arrow-left"></i>
          返回编辑器
        </button>
        <div class="page-title">
          <h1>富文本编辑器</h1>
          <span class="world-name" v-if="world">{{ world.name }}</span>
        </div>
      </div>
      <div class="nav-right">
        <button @click="saveContent" class="save-btn" :disabled="saving">
          <i class="icon-save"></i>
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>

    <!-- 编辑器内容区 -->
    <div class="editor-container">
      <div class="editor-wrapper">
        <TextEditor 
          ref="textEditorRef"
          @content-change="onContentChange"
        />
      </div>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorldStore } from '../stores/worldStore'
import TextEditor from '../components/prosemirror/textEditor.vue'

// Props
const props = defineProps<{
  worldId: string
}>()

const router = useRouter()
const worldStore = useWorldStore()

// 状态
const loading = ref(false)
const saving = ref(false)
const world = ref<any>(null)
const textEditorRef = ref()
const hasUnsavedChanges = ref(false)

// 方法
const goBack = () => {
  if (hasUnsavedChanges.value) {
    if (confirm('有未保存的更改，确定要离开吗？')) {
      router.push(`/editor/${props.worldId}`)
    }
  } else {
    router.push(`/editor/${props.worldId}`)
  }
}

const onContentChange = () => {
  hasUnsavedChanges.value = true
}

const saveContent = async () => {
  if (!textEditorRef.value) return
  
  saving.value = true
  try {
    const content = textEditorRef.value.getContent()
    // 这里可以添加保存到数据库的逻辑
    console.log('保存内容:', content)
    
    // 模拟保存延迟
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    hasUnsavedChanges.value = false
    // 可以添加成功提示
  } catch (error) {
    console.error('保存失败:', error)
    // 可以添加错误提示
  } finally {
    saving.value = false
  }
}

const loadWorld = async () => {
  loading.value = true
  try {
    world.value = await worldStore.getWorldById(props.worldId)
    if (!world.value) {
      router.push('/')
      return
    }
  } catch (error) {
    console.error('加载世界观失败:', error)
    router.push('/')
  } finally {
    loading.value = false
  }
}

// 生命周期
onMounted(() => {
  loadWorld()
})

// 页面离开前确认
window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedChanges.value) {
    e.preventDefault()
    e.returnValue = ''
  }
})
</script>

<style scoped>
.prosemirror-editor-page {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f8f9fa;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e9ecef;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 6px;
  color: #495057;
  cursor: pointer;
  transition: all 0.2s;
}

.back-btn:hover {
  background: #e9ecef;
  border-color: #adb5bd;
}

.page-title h1 {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #212529;
}

.world-name {
  font-size: 14px;
  color: #6c757d;
  margin-top: 2px;
}

.nav-right {
  display: flex;
  gap: 12px;
}

.save-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #007bff;
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  transition: all 0.2s;
}

.save-btn:hover:not(:disabled) {
  background: #0056b3;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.editor-container {
  flex: 1;
  padding: 24px;
  overflow: auto;
}

.editor-wrapper {
  max-width: 1200px;
  margin: 0 auto;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  min-height: calc(100vh - 200px);
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007bff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* 图标样式 */
.icon-arrow-left::before {
  content: '←';
}

.icon-save::before {
  content: '💾';
}
</style>