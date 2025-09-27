<template>
  <div class="demo-container">
    <header class="demo-header">
      <div class="header-left">
        <button class="back-btn" @click="goBack">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="m12 19-7-7 7-7"/>
            <path d="m19 12H5"/>
          </svg>
        </button>
        <h1>富文本编辑器演示</h1>
      </div>
    </header>

    <main class="demo-main">
      <div class="demo-content">
        <div class="editor-section">
          <h2>ProseMirror 富文本编辑器</h2>
          <p class="description">
            这是一个基于 ProseMirror 的简单富文本编辑器，支持基本的文本格式化功能。
          </p>
          
          <div class="editor-wrapper">
            <TextEditor 
              v-model="content" 
              placeholder="在这里开始输入你的内容..."
              @change="onContentChange"
            />
          </div>

          <div class="features">
            <h3>支持的功能：</h3>
            <ul>
              <li><strong>粗体</strong> - Ctrl/Cmd + B 或点击 B 按钮</li>
              <li><em>斜体</em> - Ctrl/Cmd + I 或点击 I 按钮</li>
              <li>标题 - 点击 H1、H2 按钮</li>
              <li>无序列表 - 点击 • 按钮</li>
              <li>有序列表 - 点击 1. 按钮</li>
              <li>撤销/重做 - Ctrl/Cmd + Z / Ctrl/Cmd + Y</li>
            </ul>
          </div>
        </div>

        <div class="output-section">
          <h3>实时输出 (HTML):</h3>
          <div class="output-box">
            <pre><code>{{ content || '暂无内容' }}</code></pre>
          </div>
          
          <div class="actions">
            <button @click="clearContent" class="btn-secondary">
              清空内容
            </button>
            <button @click="loadSampleContent" class="btn-primary">
              加载示例内容
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import TextEditor from '../components/prosemirror/textEditor.vue'

const router = useRouter()
const content = ref('')

const goBack = () => {
  router.push('/')
}

const onContentChange = (newContent: string) => {
  console.log('Content changed:', newContent)
}

const clearContent = () => {
  content.value = ''
}

const loadSampleContent = () => {
  content.value = `
    <h1>欢迎使用富文本编辑器</h1>
    <p>这是一个<strong>示例文档</strong>，展示了编辑器的各种功能。</p>
    <h2>功能特性</h2>
    <p>编辑器支持以下格式：</p>
    <ul>
      <li><strong>粗体文本</strong></li>
      <li><em>斜体文本</em></li>
      <li>多级标题</li>
      <li>列表项目</li>
    </ul>
    <p>你可以使用工具栏按钮或键盘快捷键来格式化文本。</p>
    <h2>使用说明</h2>
    <ol>
      <li>选择要格式化的文本</li>
      <li>点击工具栏中的相应按钮</li>
      <li>或使用键盘快捷键</li>
    </ol>
    <p>开始创作你的内容吧！</p>
  `.trim()
}
</script>

<style scoped>
.demo-container {
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

.demo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: white;
  border-bottom: 1px solid #e9ecef;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
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

.demo-header h1 {
  font-size: 20px;
  font-weight: 600;
  color: #212529;
  margin: 0;
}

.demo-main {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
}

.demo-content {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 400px;
  gap: 32px;
}

.editor-section {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

.editor-section h2 {
  font-size: 24px;
  font-weight: 600;
  color: #212529;
  margin: 0 0 8px 0;
}

.description {
  color: #6c757d;
  margin: 0 0 24px 0;
  line-height: 1.5;
}

.editor-wrapper {
  margin-bottom: 32px;
}

.features h3 {
  font-size: 18px;
  font-weight: 600;
  color: #212529;
  margin: 0 0 12px 0;
}

.features ul {
  margin: 0;
  padding-left: 20px;
  color: #495057;
}

.features li {
  margin-bottom: 8px;
  line-height: 1.5;
}

.output-section {
  background: white;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
  height: fit-content;
}

.output-section h3 {
  font-size: 18px;
  font-weight: 600;
  color: #212529;
  margin: 0 0 16px 0;
}

.output-box {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 16px;
  margin-bottom: 16px;
  max-height: 300px;
  overflow-y: auto;
}

.output-box pre {
  margin: 0;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 12px;
  line-height: 1.4;
  color: #495057;
  white-space: pre-wrap;
  word-break: break-all;
}

.actions {
  display: flex;
  gap: 12px;
}

.btn-primary {
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

.btn-primary:hover {
  background: #0056b3;
}

.btn-secondary {
  padding: 8px 16px;
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

@media (max-width: 768px) {
  .demo-content {
    grid-template-columns: 1fr;
    gap: 24px;
  }
  
  .demo-main {
    padding: 16px;
  }
}
</style>