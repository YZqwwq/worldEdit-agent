<template>
  <header
    class="z-10 flex flex-shrink-0 items-center justify-between border-b border-slate-200/80 bg-white/88 px-8 py-5"
  >
    <div class="flex min-w-0 items-center gap-4">
      <router-link
        :to="backTo"
        class="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 no-underline"
      >
        <span>&larr;</span> 返回
      </router-link>

      <div class="min-w-0">
        <div class="text-[15px] font-semibold tracking-[0.08em] text-slate-900">
          {{ title }}
        </div>
        <div class="text-xs text-slate-500">
          持续对话
        </div>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-end gap-3">
      <button
        type="button"
        class="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        title="查看 AI 当前记忆内容"
        @click="$emit('open-memory')"
      >
        记忆状态
      </button>

      <button
        type="button"
        class="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        title="查看 AI 对世界观人物的印象"
        @click="$emit('open-character-impression')"
      >
        人物印象
      </button>

      <button
        type="button"
        class="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        title="查看或修改模型参数"
        @click="$emit('open-model-config')"
      >
        模型设置
      </button>

      <button
        type="button"
        class="flex cursor-pointer items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 shadow-sm transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        :disabled="disablePurge"
        title="清除所有 AI 数据"
        @click="$emit('open-purge-confirm')"
      >
        <span>🗑️</span> 清空
      </button>

      <button
        type="button"
        class="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        :class="{ 'border-blue-200 bg-blue-50 text-blue-600': showLogs }"
        @click="$emit('toggle-logs')"
      >
        <span v-if="showLogs">调试面板已开</span>
        <span v-else>显示调试</span>
      </button>

      <button
        type="button"
        class="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
        :class="{ 'border-emerald-200 bg-emerald-50 text-emerald-700': showTasks }"
        @click="$emit('toggle-tasks')"
      >
        <span v-if="showTasks">任务列表已开</span>
        <span v-else>显示任务</span>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    backTo?: string
    showLogs: boolean
    showTasks: boolean
    disablePurge?: boolean
  }>(),
  {
    title: 'AI 助手',
    backTo: '/',
    disablePurge: false
  }
)

defineEmits<{
  (e: 'open-memory'): void
  (e: 'open-character-impression'): void
  (e: 'open-model-config'): void
  (e: 'open-purge-confirm'): void
  (e: 'toggle-logs'): void
  (e: 'toggle-tasks'): void
}>()
</script>
