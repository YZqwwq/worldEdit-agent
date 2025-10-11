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
          :worldId="props.worldId"
          @change="onContentChange"
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
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useWorldTextStore } from '../stores/worldTextStore'
import TextEditor from '../components/prosemirror/textEditor.vue'

// Props
const props = defineProps<{
  worldId: string
}>()

const router = useRouter()
const worldTextStore = useWorldTextStore()

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
    
    // 通过 worldTextStore 保存文本数据
    const success = await worldTextStore.saveWorldText(props.worldId, {
      description: content
    })
    
    if (success) {
      hasUnsavedChanges.value = false
      console.log('内容保存成功')
    } else {
      throw new Error('保存失败')
    }
  } catch (error) {
    console.error('保存失败:', error)
    alert('保存失败，请重试')
  } finally {
    saving.value = false
  }
}

// 键盘快捷键处理
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.ctrlKey && e.key === 's') {
    e.preventDefault()
    saveContent()
  }
}



// 生命周期
onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
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
  width: 100vw;
  display: flex;
  flex-direction: column;
  background: #f8f9fa;
  padding-top: 0px; 
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px; /* 减少顶部导航栏的padding */
  background: white;
  border-bottom: 1px solid #e9ecef;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05); /* 减少阴影 */
  flex-shrink: 0; /* 防止导航栏被压缩 */
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
  padding: 4px 8px 8px 8px; /* 进一步减少padding */
  overflow: hidden; /* 防止滚动条 */
  display: flex;
  flex-direction: column;
}

.editor-wrapper {
  flex: 1;
  max-width: none; /* 移除最大宽度限制 */
  margin: 0;
  background: white;
  border-radius: 4px; /* 减少圆角 */
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05); /* 减少阴影 */
  height: 100%; /* 使用100%高度而不是calc */
  display: flex;
  flex-direction: column;
  width: 100%;
  overflow: hidden; /* 防止溢出 */
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