<template>
  <section v-if="shouldRender" class="mb-2 overflow-hidden border-b border-slate-200/70 pb-1">
    <button
      type="button"
      class="flex min-h-9 w-full items-center gap-2 px-1 text-left text-xs text-slate-600 transition hover:text-slate-900"
      :aria-expanded="activity.expanded"
      @click="$emit('toggle')"
    >
      <span
        class="h-1.5 w-1.5 shrink-0 rounded-full"
        :class="statusDotClass"
        aria-hidden="true"
      />
      <span class="min-w-0 flex-1 truncate font-medium">{{ summaryLabel }}</span>
      <span v-if="entrySummary" class="shrink-0 text-[11px] text-slate-400">
        {{ entrySummary }}
      </span>
      <span v-if="canExpand" class="shrink-0 text-[11px] text-slate-400">
        {{ activity.expanded ? '收起' : '查看' }}
      </span>
    </button>

    <div
      v-if="activity.expanded && canExpand"
      ref="activityBody"
      class="max-h-56 overflow-y-auto px-1 py-2"
    >
      <div v-if="orderedEntries.length" class="space-y-3">
        <div
          v-for="entry in orderedEntries"
          :key="`${entry.kind}:${entry.id}`"
          class="grid grid-cols-[18px_minmax(0,1fr)] gap-2"
        >
          <div class="flex justify-center pt-1.5">
            <span
              v-if="entry.kind === 'thought'"
              class="h-1.5 w-1.5 rounded-full bg-violet-400"
            />
            <span
              v-else
              class="h-2 w-2 rounded-sm border"
              :class="toolStatusClass(entry.status)"
            />
          </div>

          <div v-if="entry.kind === 'thought'" class="min-w-0">
            <div class="mb-1 text-[11px] font-medium text-slate-400">
              {{ entry.followsToolResult ? '重新考虑' : '思考' }}
            </div>
            <p class="whitespace-pre-wrap break-words text-[12px] leading-5 text-slate-600">
              {{ entry.text }}
            </p>
          </div>

          <div v-else class="min-w-0">
            <div class="flex items-center gap-2 text-[12px] leading-5 text-slate-600">
              <span class="min-w-0 flex-1 truncate">{{ entry.label }}</span>
              <span class="shrink-0 text-[11px]" :class="toolStatusTextClass(entry.status)">
                {{ toolStatusLabel(entry.status) }}
              </span>
            </div>
            <p
              v-if="entry.detail"
              class="mt-0.5 whitespace-pre-wrap break-words text-[11px] leading-4 text-slate-400"
            >
              {{ entry.detail }}
            </p>
          </div>
        </div>
      </div>

      <div v-else class="flex h-full items-center justify-center text-xs text-slate-400">
        正在形成第一步判断……
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { AgentStageStatus } from '../../../../../share/cache/render/aiagent/aiContent'
import type { AgentTurnActivity } from '../turnActivity'

const props = defineProps<{
  activity: AgentTurnActivity
}>()

defineEmits<{
  (e: 'toggle'): void
}>()

const activityBody = ref<HTMLElement | null>(null)
const orderedEntries = computed(() =>
  [...props.activity.entries]
    .filter((entry) => entry.kind !== 'thought' || entry.text.trim())
    .sort((a, b) => a.order - b.order)
)
const visibleThoughtCount = computed(
  () => props.activity.entries.filter((entry) => entry.kind === 'thought' && entry.text.trim()).length
)
const thoughtCount = computed(
  () => visibleThoughtCount.value
)
const toolCount = computed(
  () => props.activity.entries.filter((entry) => entry.kind === 'tool').length
)
const activeTool = computed(() =>
  [...props.activity.entries]
    .reverse()
    .find(
      (entry) =>
        entry.kind === 'tool' && (entry.status === 'start' || entry.status === 'running')
    )
)

const canExpand = computed(() => orderedEntries.value.length > 0)
const shouldRender = computed(
  () =>
    visibleThoughtCount.value > 0 ||
    toolCount.value > 0 ||
    ['thinking', 'using_tools', 'finalizing', 'responding'].includes(props.activity.phase)
)

const normalizeActivityLabel = (label: string): string => {
  const normalized = label.trim()
  if (!normalized || normalized === '选择表达状态' || normalized === 'select_expression_profile') {
    return '正在调整表达'
  }
  return normalized
}

const summaryLabel = computed(() => {
  if (activeTool.value?.kind === 'tool') return activeTool.value.label
  if (props.activity.phase === 'finalizing') return '正在打字'
  if (props.activity.phase === 'responding') return '正在回答'
  if (props.activity.phase === 'done') return thoughtCount.value ? '思考完成' : '本轮处理完成'
  if (props.activity.phase === 'error') return '本轮处理没有完成'
  if (props.activity.phase === 'interrupted') return '本轮处理已中断'
  return normalizeActivityLabel(props.activity.label || '正在思考')
})

const entrySummary = computed(() => {
  const parts: string[] = []
  if (thoughtCount.value) parts.push(`${thoughtCount.value} 段想法`)
  if (toolCount.value) parts.push(`${toolCount.value} 项工具`)
  return parts.join(' · ')
})

const statusDotClass = computed(() => {
  if (props.activity.phase === 'error') return 'bg-rose-500'
  if (props.activity.phase === 'interrupted') return 'bg-amber-500'
  if (props.activity.phase === 'done') return 'bg-emerald-500'
  return 'bg-sky-500 animate-pulse'
})

const toolStatusLabel = (status: AgentStageStatus): string => {
  if (status === 'done') return '完成'
  if (status === 'error') return '失败'
  return '进行中'
}

const toolStatusClass = (status: AgentStageStatus): string => {
  if (status === 'done') return 'border-emerald-400 bg-emerald-100'
  if (status === 'error') return 'border-rose-400 bg-rose-100'
  return 'border-sky-400 bg-sky-100'
}

const toolStatusTextClass = (status: AgentStageStatus): string => {
  if (status === 'done') return 'text-emerald-600'
  if (status === 'error') return 'text-rose-600'
  return 'text-sky-600'
}

watch(
  () =>
    props.activity.entries
      .map((entry) =>
        entry.kind === 'thought'
          ? `${entry.id}:${entry.text.length}`
          : `${entry.id}:${entry.status}:${entry.detail ?? ''}`
      )
      .join('|'),
  async () => {
    if (!props.activity.expanded) return
    await nextTick()
    if (activityBody.value) activityBody.value.scrollTop = activityBody.value.scrollHeight
  }
)
</script>
