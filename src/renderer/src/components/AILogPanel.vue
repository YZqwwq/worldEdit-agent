<template>
  <aside class="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
    <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
      <h3 class="text-sm font-semibold uppercase tracking-[0.22em] text-slate-700">
        Agent 思维链
      </h3>
      <div class="flex items-center gap-2">
        <span v-if="logs.length === 0" class="text-xs text-slate-400">等待任务...</span>
        <span v-else class="text-xs font-medium text-blue-600 animate-pulse">运行中</span>
      </div>
    </div>

    <div class="flex-grow overflow-y-auto p-5 space-y-4 scroll-smooth">
      <div
        v-for="group in groupedLogs"
        :key="group.id"
        class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
      >
        <button
          type="button"
          class="flex w-full items-start justify-between gap-3 px-4 py-4 text-left transition hover:bg-slate-50"
          @click="toggleGroupFold(group.id)"
        >
          <div class="flex min-w-0 items-start gap-3">
            <div
              class="mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 bg-white"
              :class="getGroupColor(group)"
            />
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class="text-[10px] text-slate-400 transform transition-transform duration-200"
                  :class="isGroupFolded(group.id) ? '-rotate-90' : 'rotate-0'"
                >
                  ▼
                </span>
                <span class="truncate text-sm font-semibold text-slate-800">
                  {{ group.node }}
                </span>
                <span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                  {{ group.logs.length }} 条
                </span>
              </div>
              <div v-if="group.summary" class="mt-1 text-xs leading-5 text-slate-500">
                {{ group.summary }}
              </div>
            </div>
          </div>
          <div class="flex flex-col items-end gap-1 text-[10px] font-mono text-slate-400">
            <span>{{ formatTime(group.startedAt) }}</span>
            <span v-if="typeof group.durationMs === 'number'">{{ group.durationMs }} ms</span>
          </div>
        </button>

        <transition
          enter-active-class="transition ease-out duration-200"
          enter-from-class="opacity-0 -translate-y-2 max-h-0"
          enter-to-class="opacity-100 translate-y-0 max-h-[1200px]"
          leave-active-class="transition ease-in duration-150"
          leave-from-class="opacity-100 translate-y-0 max-h-[1200px]"
          leave-to-class="opacity-0 -translate-y-2 max-h-0"
        >
          <div v-if="!isGroupFolded(group.id)" class="border-t border-slate-200 bg-slate-50/60 px-4 py-4">
            <div class="space-y-4">
              <div
                v-for="(log, index) in group.logs"
                :key="log.id"
                class="relative pl-6"
              >
                <div
                  class="absolute left-1.5 top-2 bottom-0 w-0.5 bg-slate-200"
                  :class="{ 'h-full': index === group.logs.length - 1 }"
                />

                <div
                  class="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 bg-white z-10 transition-colors"
                  :class="getStepColor(log)"
                />

                <div class="flex flex-col gap-1">
                  <div class="flex items-center justify-between cursor-pointer" @click="toggleLogFold(log.id)">
                    <div class="flex items-center gap-1.5 overflow-hidden">
                      <span
                        v-if="log.data"
                        class="text-[10px] text-slate-400 transform transition-transform duration-200"
                        :class="isLogFolded(log.id) ? '-rotate-90' : 'rotate-0'"
                      >
                        ▼
                      </span>
                      <span class="truncate text-xs font-bold text-slate-700">
                        {{ getStepTitle(log, index) }}
                      </span>
                    </div>
                    <span class="text-[10px] font-mono text-slate-400 flex-shrink-0">
                      {{ formatTime(log.timestamp) }}
                    </span>
                  </div>

                  <div v-if="log.summary" class="text-[11px] leading-5 text-slate-500">
                    {{ log.summary }}
                    <span v-if="typeof log.durationMs === 'number'" class="ml-1 font-mono text-slate-400">
                      · {{ log.durationMs }} ms
                    </span>
                  </div>

                  <transition
                    enter-active-class="transition ease-out duration-200"
                    enter-from-class="opacity-0 -translate-y-2 max-h-0"
                    enter-to-class="opacity-100 translate-y-0 max-h-[500px]"
                    leave-active-class="transition ease-in duration-150"
                    leave-from-class="opacity-100 translate-y-0 max-h-[500px]"
                    leave-to-class="opacity-0 -translate-y-2 max-h-0"
                  >
                    <div
                      v-if="log.data && !isLogFolded(log.id)"
                      class="mt-2 overflow-x-auto rounded-xl border border-slate-100 bg-white p-3 text-[10px] font-mono text-slate-600 shadow-inner whitespace-pre-wrap break-all"
                    >
                      {{ formatData(log.data) }}
                    </div>
                  </transition>
                </div>
              </div>
            </div>
          </div>
        </transition>
      </div>

      <div v-if="logs.length > 0" class="text-center text-xs text-slate-400">
        等待下一步...
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AgentLog } from '../services/aiClientService'

const props = defineProps<{
  logs: AgentLog[]
}>()

type AgentLogGroup = {
  id: string
  node: string
  logs: AgentLog[]
  startedAt: number
  durationMs?: number
  summary: string
  status: 'running' | 'completed' | 'error'
}

const groupFoldedMap = ref<Record<string, boolean>>({})
const logFoldedMap = ref<Record<string, boolean>>({})

const groupedLogs = computed<AgentLogGroup[]>(() => {
  const groups: AgentLogGroup[] = []
  let currentGroup: AgentLogGroup | null = null

  for (const log of props.logs) {
    const shouldStartNewGroup =
      !currentGroup ||
      log.phase === 'enter' ||
      currentGroup.status !== 'running' ||
      currentGroup.node !== log.node

    if (shouldStartNewGroup) {
      currentGroup = {
        id: `${log.node}-${log.id}`,
        node: log.node,
        logs: [],
        startedAt: log.timestamp,
        summary: '',
        status: 'running'
      }
      groups.push(currentGroup)
    }

    const activeGroup = currentGroup
    if (!activeGroup) {
      continue
    }

    activeGroup.logs.push(log)

    if (log.summary) {
      activeGroup.summary = log.summary
    }

    if (typeof log.durationMs === 'number') {
      activeGroup.durationMs = log.durationMs
    }

    if (log.phase === 'exit') {
      activeGroup.status = 'completed'
    } else if (log.phase === 'error') {
      activeGroup.status = 'error'
    }
  }

  return groups
})

const isGroupFolded = (groupId: string) => {
  if (groupFoldedMap.value[groupId] !== undefined) {
    return groupFoldedMap.value[groupId]
  }
  return true
}

const toggleGroupFold = (groupId: string) => {
  groupFoldedMap.value[groupId] = !isGroupFolded(groupId)
}

const isLogFolded = (logId: string) => {
  if (logFoldedMap.value[logId] !== undefined) {
    return logFoldedMap.value[logId]
  }
  return true
}

const toggleLogFold = (logId: string) => {
  logFoldedMap.value[logId] = !isLogFolded(logId)
}

const getGroupColor = (group: AgentLogGroup) => {
  if (group.status === 'error') return 'border-red-500 bg-red-50'
  if (group.status === 'completed') return 'border-emerald-500 bg-emerald-50'
  return 'border-blue-500 bg-blue-50'
}

const getStepColor = (log: AgentLog) => {
  switch (log.phase) {
    case 'enter':
      return 'border-blue-500 ring-2 ring-blue-100'
    case 'exit':
      return 'border-green-500'
    case 'state':
      return 'border-slate-500 bg-slate-100'
    case 'decision':
      return 'border-purple-500 bg-purple-100'
    case 'artifact':
      return 'border-amber-500 bg-amber-100'
    case 'error':
      return 'border-red-500 bg-red-100'
    default:
      return 'border-gray-300'
  }
}

const getStepTitle = (log: AgentLog, index: number) => {
  if (log.title) return log.title
  return `${index + 1}. ${log.phase}: ${log.node}`
}

const formatTime = (ts: number) => {
  const date = new Date(ts)
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

const formatData = (data: unknown) => {
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}
</script>
