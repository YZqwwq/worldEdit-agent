<template>
  <div class="flex h-screen bg-gray-50 overflow-hidden">
    <!-- 主聊天区域 -->
    <div class="flex flex-col flex-grow min-w-0">
      <!-- 顶部导航栏 -->
      <header
        class="flex flex-shrink-0 justify-between items-center px-6 py-4 bg-white border-b border-gray-200 shadow-sm z-10"
      >
        <router-link
          to="/"
          class="flex items-center gap-1 px-4 py-2 text-sm font-medium text-gray-600 transition-colors bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 no-underline shadow-sm"
        >
          <span>&larr;</span> 返回
        </router-link>
        <div class="text-lg font-semibold text-gray-800 tracking-wide">AI 助手</div>
        
        <div class="flex items-center gap-3">
          <!-- 清除历史按钮 -->
          <button
            @click="handleClearHistory"
            class="px-3 py-2 text-sm font-medium text-red-600 transition-colors bg-white border border-red-200 rounded-lg hover:bg-red-50 hover:text-red-700 hover:border-red-300 shadow-sm cursor-pointer flex items-center gap-2"
            title="清除所有对话记录"
          >
            <span>🗑️</span> 清空
          </button>

          <!-- 调试面板开关 -->
          <button
            @click="showLogs = !showLogs"
            class="px-4 py-2 text-sm font-medium text-gray-600 transition-colors bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300 shadow-sm cursor-pointer flex items-center gap-2"
            :class="{'text-blue-600 border-blue-200 bg-blue-50': showLogs}"
          >
            <span v-if="showLogs">隐藏调试</span>
            <span v-else>显示调试</span>
          </button>
        </div>
      </header>

      <!-- 消息列表区域 -->
      <div
        class="flex flex-col flex-grow gap-6 p-6 overflow-y-auto scroll-smooth"
        ref="messagesContainer"
      >
        <div
          v-for="message in messages"
          :key="message.id"
          class="flex w-full gap-3"
          :class="message.sender === 'user' ? 'justify-end' : 'justify-start'"
        >
          <div
            class="flex flex-col max-w-[85%] min-w-[60px]"
            :class="message.sender === 'user' ? 'items-end' : 'items-start'"
          >
            <!-- AI 消息头部信息：头像 + 名称 + 时间 -->
            <div 
              v-if="message.sender === 'ai'" 
              class="flex items-center gap-2 mb-2 text-xs text-gray-400"
            >
              <!-- 头像 -->
              <div
                class="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center border border-blue-200"
              >
                <span class="text-[10px]">🤖</span>
              </div>
              
              <span class="font-medium text-gray-600">AI 助手</span>
              <span>{{ formatTime(message.timestamp) }}</span>
            </div>

            <!-- 消息内容区域 -->
            <div
              class="px-5 py-3.5 text-base leading-7 rounded-2xl shadow-sm break-words overflow-hidden"
              :class="[
                message.sender === 'user'
                  ? 'bg-[#f3f5f9] text-gray-900 rounded-br-sm'
                  : 'bg-transparent text-gray-800 !p-0 !shadow-none' 
              ]"
            >
              <MdPreview
                :modelValue="message.text"
                class="!bg-transparent !p-0"
                :theme="'light'"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 底部输入区域 -->
      <div class="flex flex-shrink-0 gap-4 p-6 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div class="relative flex-grow">
          <textarea
            v-model="userInput"
            @keyup.enter.exact="handleSend"
            placeholder="输入你的问题... (Enter 发送)"
            class="w-full h-14 py-3.5 pl-5 pr-4 text-sm text-gray-800 placeholder-gray-400 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 focus:bg-white transition-all resize-none shadow-inner"
            :disabled="isLoading"
          ></textarea>
        </div>

        <button
          @click="handleSend"
          class="flex flex-shrink-0 items-center justify-center px-8 h-14 text-sm font-semibold text-white transition-all bg-blue-600 rounded-xl shadow-md hover:bg-blue-700 hover:shadow-lg active:transform active:scale-95 focus:ring-4 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:transform-none"
          :disabled="isLoading || !userInput.trim()"
        >
          {{ isLoading ? '思考中...' : '发送' }}
        </button>
      </div>
    </div>

    <!-- 右侧调试面板 -->
    <transition
      enter-active-class="transition ease-out duration-300"
      enter-from-class="transform translate-x-full"
      enter-to-class="transform translate-x-0"
      leave-active-class="transition ease-in duration-200"
      leave-from-class="transform translate-x-0"
      leave-to-class="transform translate-x-full"
    >
      <AILogPanel v-if="showLogs" :logs="agentLogs" class="flex-shrink-0" />
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, watch, onMounted } from 'vue'
import { useAIChatService } from '../services/aiClientService'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import AILogPanel from '../components/AILogPanel.vue'

const { messages, isLoading, sendMessage, loadHistory, clearHistory, agentLogs } = useAIChatService()
const userInput = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
const showLogs = ref(true) // 默认开启调试面板以便演示

// Load history when component is mounted
onMounted(async () => {
  await loadHistory()
  // Scroll to bottom after loading history
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
})

const handleSend = (): void => {
  if (userInput.value.trim()) {
    sendMessage(userInput.value)
    userInput.value = ''
  }
}

const handleClearHistory = async () => {
  if (confirm('确定要清空所有对话记录吗？此操作无法撤销。')) {
    await clearHistory()
  }
}

// 格式化时间函数
const formatTime = (timestamp?: number): string => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${month}月${day}日 ${hours}:${minutes}`
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
/* 取消 md-editor-v3 代码块头部的吸顶行为 */
:deep(.md-editor-preview .md-editor-code .md-editor-code-head) {
  position: static !important;
  top: auto !important;
  z-index: auto !important;
}
</style>
