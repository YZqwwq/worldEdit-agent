<template>
  <div class="map-editor-container">
    <!-- 顶部导航栏 -->
    <header class="editor-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m12 19-7-7 7-7"/>
            <path d="m19 12H5"/>
          </svg>
        </button>
        <h1 class="editor-title">地图编辑器</h1>
      </div>
      
      <div class="header-right">
        <button class="save-btn" @click="saveContent" :disabled="uiState.loading">
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
      <div class="editor-placeholder">
        <div class="placeholder-content">
          <div class="placeholder-icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/>
              <path d="M9 3v15"/>
              <path d="M15 6v15"/>
            </svg>
          </div>
          <h2>Canvas 地图编辑器</h2>
          <p>这里将提供强大的地图绘制和编辑功能</p>
          <p>基于 Canvas 的地图编辑器，支持像素和矢量图层，包括：</p>
          <ul>
            <li>多图层地图绘制</li>
            <li>地形地貌设计</li>
            <li>城市建筑标记</li>
            <li>路径路线规划</li>
            <li>区域边界划分</li>
            <li>交互式地点标注</li>
          </ul>
          <div class="feature-list">
            <div class="feature-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,11 12,14 22,4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              像素+矢量双图层
            </div>
            <div class="feature-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,11 12,14 22,4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              丰富绘图工具
            </div>
            <div class="feature-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,11 12,14 22,4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              智能地形生成
            </div>
            <div class="feature-item">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9,11 12,14 22,4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              多格式导出
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
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
const { uiState } = storeToRefs(worldStore)

// 方法
const goBack = () => {
  router.push(`/editor/${props.worldId}`)
}

const saveContent = async () => {
  try {
    // TODO: 实现保存逻辑
    console.log('保存地图内容')
  } catch (error) {
    console.error('Failed to save content:', error)
  }
}
</script>

<style scoped>
.map-editor-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #f8f9fa;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e9ecef;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
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

.editor-title {
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
  background: #17a2b8;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
}

.save-btn:hover {
  background: #138496;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.editor-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
}

.editor-placeholder {
  text-align: center;
  max-width: 600px;
}

.placeholder-content {
  background: white;
  border-radius: 16px;
  padding: 48px 32px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.1);
}

.placeholder-icon {
  color: #17a2b8;
  margin-bottom: 24px;
}

.placeholder-content h2 {
  font-size: 28px;
  font-weight: 700;
  color: #212529;
  margin: 0 0 16px 0;
}

.placeholder-content p {
  font-size: 16px;
  color: #6c757d;
  line-height: 1.6;
  margin: 0 0 16px 0;
}

.placeholder-content ul {
  text-align: left;
  color: #495057;
  margin: 24px 0;
  padding-left: 20px;
}

.placeholder-content li {
  margin-bottom: 8px;
  line-height: 1.5;
}

.feature-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-top: 32px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  background: #f8f9fa;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: #495057;
}

.feature-item svg {
  color: #28a745;
  flex-shrink: 0;
}
</style>