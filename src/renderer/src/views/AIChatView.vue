<template>
  <div class="chat-view">
    <div class="chat-header">
      <router-link to="/" class="btn-back">返回</router-link>
      <div class="header-title">AI助手</div>
      <button class="btn-config">模型配置</button>
    </div>
    <div class="chat-messages" ref="messagesContainer">
      <div
        v-for="message in messages"
        :key="message.id"
        class="message-wrapper"
        :class="{ 'sent-wrapper': message.sender === 'user' }"
      >
        <div class="message-bubble" :class="message.sender === 'user' ? 'sent' : 'received'">
          <MdPreview :modelValue="message.text" />
        </div>
      </div>
    </div>
    <div class="chat-input-area">
      <textarea
        v-model="userInput"
        @keyup.enter="handleSend"
        placeholder="输入你的问题..."
        class="chat-input"
        :disabled="isLoading"
      ></textarea>
      <button @click="handleSend" class="btn-send" :disabled="isLoading">
        {{ isLoading ? '思考中...' : '发送' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useAIChatService } from '../services/aiClientService'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'

const { messages, isLoading, sendMessage } = useAIChatService()
const userInput = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

const handleSend = (): void => {
  if (userInput.value.trim()) {
    sendMessage(userInput.value)
    userInput.value = ''
  }
}

// Scroll to the bottom when new messages are added
watch(
  messages,
  async () => {
    await nextTick()
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  },
  { deep: true }
)
</script>

<style scoped>
.chat-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: #ffffff;
}

.chat-header {
  padding: 10px 20px;
  border-bottom: 1px solid #e0e0e0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.header-title {
  font-size: 16px;
  font-weight: 500;
}

.btn-back {
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #d9d9d9;
  background-color: #fff;
  cursor: pointer;
  font-size: 14px;
  text-decoration: none;
  color: #333;
}

.btn-back:hover {
  background-color: #f5f5f5;
}

.btn-config {
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #d9d9d9;
  background-color: #fff;
  cursor: pointer;
  font-size: 14px;
}

.btn-config:hover {
  background-color: #f5f5f5;
}

.chat-messages {
  flex-grow: 1;
  padding: 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.message-wrapper {
  display: flex;
  max-width: 80%;
  align-self: flex-start;
}

.sent-wrapper {
  align-self: flex-end;
}

.message-bubble {
  padding: 1px 4px;
  border-radius: 18px;
  line-height: 1.5;
}

.received {
  background-color: #f0f2f5;
  color: #333;
  border-top-left-radius: 4px;
}

.sent {
  background-color: #e6f7ff;
  color: #333;
  border-top-right-radius: 4px;
}

.chat-input-area {
  display: flex;
  padding: 20px;
  border-top: 1px solid #e0e0e0;
  gap: 10px;
  flex-shrink: 0;
}

.chat-input {
  flex-grow: 1;
  padding: 10px;
  border-radius: 4px;
  border: 1px solid #d9d9d9;
  font-size: 14px;
  resize: none;
  height: 40px;
}

.btn-send {
  padding: 0 20px;
  border-radius: 4px;
  border: none;
  background-color: #007bff;
  color: white;
  cursor: pointer;
  font-size: 14px;
}

.btn-send:hover {
  background-color: #0056b3;
}

.btn-send:disabled {
  background-color: #a0cfff;
  cursor: not-allowed;
}

/* 取消 md-editor-v3 代码块头部的吸顶行为 */
:deep(.md-editor-preview .md-editor-code .md-editor-code-head) {
  position: static !important;
  top: auto !important;
  z-index: auto !important;
}
</style>
