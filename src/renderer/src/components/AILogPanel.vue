<template>
  <div class="flex flex-col h-full bg-white border-l border-gray-200 shadow-xl w-80">
    <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
      <h3 class="text-sm font-semibold text-gray-700 uppercase tracking-wider">
        Agent 思维链
      </h3>
      <div class="flex items-center gap-2">
        <span v-if="logs.length === 0" class="text-xs text-gray-400">等待任务...</span>
        <span v-else class="text-xs text-blue-600 font-medium animate-pulse">运行中</span>
      </div>
    </div>

    <div class="flex-grow overflow-y-auto p-4 space-y-6 scroll-smooth">
      <div v-for="(log, index) in logs" :key="index" class="relative pl-6 group">
        <!-- 时间轴线 -->
        <div 
          class="absolute left-1.5 top-2 bottom-0 w-0.5 bg-gray-200 group-last:bottom-auto group-last:h-full"
          :class="{'bg-blue-200': isActive(log)}"
        ></div>

        <!-- 节点图标 -->
        <div 
          class="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 bg-white z-10 transition-colors"
          :class="getStepColor(log)"
        ></div>

        <!-- 内容卡片 -->
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between cursor-pointer" @click="toggleFold(index)">
            <div class="flex items-center gap-1.5 overflow-hidden">
              <!-- 折叠箭头 -->
              <span 
                v-if="log.data"
                class="text-[10px] text-gray-400 transform transition-transform duration-200"
                :class="isFolded(index, log) ? '-rotate-90' : 'rotate-0'"
              >
                ▼
              </span>
              <span class="text-xs font-bold text-gray-700 truncate max-w-[130px]">
                {{ getStepTitle(log) }}
              </span>
            </div>
            <span class="text-[10px] text-gray-400 font-mono flex-shrink-0">
              {{ formatTime(log.timestamp) }}
            </span>
          </div>

          <!-- 详情数据 (JSON Viewer 简化版) -->
          <transition
            enter-active-class="transition ease-out duration-200"
            enter-from-class="opacity-0 -translate-y-2 max-h-0"
            enter-to-class="opacity-100 translate-y-0 max-h-[500px]"
            leave-active-class="transition ease-in duration-150"
            leave-from-class="opacity-100 translate-y-0 max-h-[500px]"
            leave-to-class="opacity-0 -translate-y-2 max-h-0"
          >
            <div 
              v-if="log.data && !isFolded(index, log)" 
              class="mt-1 p-2 text-[10px] font-mono text-gray-600 bg-gray-50 rounded border border-gray-100 overflow-x-auto whitespace-pre-wrap break-all shadow-inner"
            >
              {{ formatData(log.data) }}
            </div>
          </transition>
        </div>
      </div>
      
      <!-- 结束占位 -->
      <div v-if="logs.length > 0" class="relative pl-6">
         <div class="absolute left-1.5 top-0 h-4 w-0.5 bg-gray-200"></div>
         <div class="absolute left-0 top-4 w-3.5 h-3.5 rounded-full bg-gray-300"></div>
         <span class="text-xs text-gray-400 ml-1 mt-3 block">等待下一步...</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { AgentLog } from '../services/aiClientService'

const props = defineProps<{
  logs: AgentLog[]
}>()

// 存储手动折叠的状态
const foldedMap = ref<Record<number, boolean>>({})

// 判断是否折叠
const isFolded = (index: number, log: AgentLog) => {
  // 如果手动操作过，以手动状态为准
  if (foldedMap.value[index] !== undefined) {
    return foldedMap.value[index]
  }
  
  // 默认策略：
  // 1. ContextNode 的输入/输出通常包含巨大Prompt，默认折叠
  if (log.nodeName === 'contextNode') return true
  
  // 2. 工具调用的输入/输出通常比较关键，默认展开
  if (log.subType === 'tool_start' || log.subType === 'tool_end') return false
  
  // 3. LLM 调用的输入通常也是 Prompt，默认折叠
  if (log.nodeName === 'llmCall' && log.subType === 'node_enter') return true
  
  // 4. Thought 类型的日志默认展开
  if (log.subType === 'thought') return false
  
  // 其他情况默认展开
  return false
}

// 切换折叠状态
const toggleFold = (index: number) => {
  // 获取当前状态（如果是 undefined，则先计算出默认值）
  const currentStatus = isFolded(index, props.logs[index])
  foldedMap.value[index] = !currentStatus
}

const isActive = (log: AgentLog) => {
  // 简单逻辑：如果是最新的几个日志之一，认为是活跃
  return false
}

const getStepColor = (log: AgentLog) => {
  switch (log.subType) {
    case 'node_enter':
      return 'border-blue-500 ring-2 ring-blue-100'
    case 'node_exit':
      return 'border-green-500'
    case 'tool_start':
      return 'border-orange-500 bg-orange-50'
    case 'tool_end':
      return 'border-orange-600 bg-orange-500'
    case 'thought':
      return 'border-purple-500 bg-purple-100'
    default:
      return 'border-gray-300'
  }
}

const getStepTitle = (log: AgentLog) => {
  if (log.subType === 'node_enter') return `进入: ${log.nodeName}`
  if (log.subType === 'node_exit') return `完成: ${log.nodeName}`
  if (log.subType === 'tool_start') return `调用工具: ${log.nodeName}`
  if (log.subType === 'tool_end') return `工具返回: ${log.nodeName}`
  if (log.subType === 'thought') return `思考: ${log.nodeName}`
  return log.subType
}

const formatTime = (ts: number) => {
  const date = new Date(ts)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

const formatData = (data: any) => {
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}
</script>
