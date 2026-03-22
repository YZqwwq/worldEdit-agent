<template>
  <aside class="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
    <div class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
      <h3 class="text-sm font-semibold uppercase tracking-[0.22em] text-slate-700">
        子 Agent 任务
      </h3>
      <div class="flex items-center gap-2">
        <span v-if="loading" class="text-xs text-slate-400">同步中...</span>
        <span v-else-if="hasRunningExecution" class="text-xs font-medium text-emerald-600">
          运行中
        </span>
        <span v-else class="text-xs text-slate-400">空闲</span>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-5">
      <div v-if="loading && !snapshot" class="py-10 text-center text-sm text-slate-400">
        正在读取任务队列...
      </div>

      <div v-else-if="!snapshot?.activeTask" class="py-10 text-center text-sm text-slate-400">
        暂无运行中的子 agent 任务
      </div>

      <div v-else class="space-y-5">
        <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                消息分发层
              </div>
              <h4 class="mt-2 text-sm font-semibold text-slate-800">
                {{ formatDispatchState(snapshot.dispatch.state) }}
              </h4>
            </div>
            <span
              class="rounded-full px-2.5 py-1 text-[11px] font-medium"
              :class="dispatchStateClass(snapshot.dispatch.state)"
            >
              {{ snapshot.dispatch.totalQueued }} 条待处理
            </span>
          </div>

          <div class="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              用户队列 {{ snapshot.dispatch.queuedUserCount }}
            </span>
            <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              子队列 {{ snapshot.dispatch.queuedTaskCount }}
            </span>
          </div>

          <p v-if="snapshot.dispatch.currentLabel" class="mt-4 text-sm leading-6 text-slate-600">
            当前处理：{{ snapshot.dispatch.currentLabel }}
          </p>
        </section>

        <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                当前主任务
              </div>
              <h4 class="mt-2 text-sm font-semibold text-slate-800">
                {{ snapshot.activeTask.title }}
              </h4>
            </div>
            <span
              class="rounded-full px-2.5 py-1 text-[11px] font-medium"
              :class="taskStatusClass(snapshot.activeTask.status)"
            >
              {{ formatTaskStatus(snapshot.activeTask.status) }}
            </span>
          </div>

          <div class="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
            <span class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              {{ formatExecutor(snapshot.activeTask.executorKind) }}
            </span>
            <span
              v-if="snapshot.activeTask.goal"
              class="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1"
            >
              目标已登记
            </span>
          </div>

          <p v-if="snapshot.activeTask.summary" class="mt-4 text-sm leading-6 text-slate-600">
            {{ snapshot.activeTask.summary }}
          </p>

          <div
            v-if="snapshot.activeTask.progressNotes"
            class="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800"
          >
            {{ snapshot.activeTask.progressNotes }}
          </div>
        </section>

        <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between">
            <h4 class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              Execution 队列
            </h4>
            <span class="text-xs text-slate-400">
              {{ snapshot.executions.length }} 条
            </span>
          </div>

          <div v-if="snapshot.executions.length === 0" class="py-6 text-center text-sm text-slate-400">
            当前任务还没有 execution 记录
          </div>

          <div v-else class="space-y-3">
            <article
              v-for="execution in snapshot.executions"
              :key="execution.id"
              class="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-3"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-slate-700">
                    #{{ execution.runNumber }} {{ formatExecutor(execution.executorKind) }}
                  </div>
                  <div class="mt-1 text-[11px] text-slate-400">
                    创建于 {{ formatIsoTime(execution.createdAt) }}
                  </div>
                </div>
                <span
                  class="rounded-full px-2.5 py-1 text-[11px] font-medium"
                  :class="executionStatusClass(execution.status)"
                >
                  {{ formatExecutionStatus(execution.status) }}
                </span>
              </div>

              <p v-if="execution.resultSummary" class="mt-3 text-sm leading-6 text-slate-600">
                {{ execution.resultSummary }}
              </p>

              <div
                v-if="execution.errorReport"
                class="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700"
              >
                {{ execution.errorReport }}
              </div>
            </article>
          </div>
        </section>

        <section class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div class="mb-3 flex items-center justify-between">
            <h4 class="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
              交互追踪
            </h4>
            <span class="text-xs text-slate-400">
              {{ snapshot.traces.length }} 条
            </span>
          </div>

          <div v-if="snapshot.traces.length === 0" class="py-6 text-center text-sm text-slate-400">
            当前任务还没有追踪埋点
          </div>

          <div v-else class="space-y-3">
            <article
              v-for="trace in snapshot.traces"
              :key="trace.id"
              class="rounded-xl border border-slate-200 bg-white px-3 py-3"
            >
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-sm font-medium text-slate-700">
                    {{ formatTraceStage(trace.stage) }}
                  </div>
                  <div class="mt-1 text-[11px] text-slate-400">
                    {{ formatTraceActor(trace.actor) }} · {{ formatIsoTime(trace.createdAt) }}
                  </div>
                </div>
                <span
                  class="rounded-full px-2.5 py-1 text-[11px] font-medium"
                  :class="traceStageClass(trace.stage)"
                >
                  {{ trace.executionId ? `#${trace.executionId}` : 'task' }}
                </span>
              </div>

              <p class="mt-3 text-sm leading-6 text-slate-600">
                {{ trace.message }}
              </p>
            </article>
          </div>
        </section>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type {
  MainAgentDispatchState,
  TaskTraceActor,
  TaskTraceStage,
  TaskExecutionStatus,
  TaskExecutorKind,
  TaskMonitorSnapshot,
  TaskStatus
} from '../../../share/cache/AItype/states/taskLifecycleState'

const props = defineProps<{
  snapshot: TaskMonitorSnapshot | null
  loading?: boolean
}>()

const hasRunningExecution = computed(() =>
  (props.snapshot?.executions ?? []).some((execution) =>
    ['queued', 'dispatching', 'running', 'awaiting_input'].includes(execution.status)
  )
)

const formatDispatchState = (state: MainAgentDispatchState): string => {
  if (state === 'processing') return '处理中'
  if (state === 'active') return '双源待处理'
  if (state === 'user-active') return '等待用户消息'
  if (state === 'tasklist-active') return '等待子队列消息'
  return '空闲'
}

const dispatchStateClass = (state: MainAgentDispatchState): string => {
  if (state === 'processing') return 'bg-emerald-50 text-emerald-700'
  if (state === 'active') return 'bg-amber-50 text-amber-700'
  if (state === 'user-active') return 'bg-sky-50 text-sky-700'
  if (state === 'tasklist-active') return 'bg-indigo-50 text-indigo-700'
  return 'bg-slate-100 text-slate-600'
}

const formatExecutor = (executorKind: TaskExecutorKind): string => {
  if (executorKind === 'character_editor') return 'Character Editor'
  if (executorKind === 'code_worker') return 'Code Worker'
  if (executorKind === 'doc_worker') return 'Doc Worker'
  if (executorKind === 'architecture_analyst') return 'Architecture Analyst'
  if (executorKind === 'tool_builder') return 'Tool Builder'
  if (executorKind === 'general_research') return 'Research Worker'
  return 'General Worker'
}

const formatTaskStatus = (status: TaskStatus): string => {
  if (status === 'running') return '运行中'
  if (status === 'pending_main_ack') return '等待主 Agent'
  if (status === 'awaiting_user_input') return '等待补充'
  if (status === 'awaiting_user_confirmation') return '等待确认'
  if (status === 'done') return '已完成'
  if (status === 'cancelled') return '已取消'
  return '已激活'
}

const formatExecutionStatus = (status: TaskExecutionStatus): string => {
  if (status === 'queued') return '排队中'
  if (status === 'dispatching') return '派发中'
  if (status === 'running') return '执行中'
  if (status === 'awaiting_input') return '等待输入'
  if (status === 'reported_done') return '已回报'
  if (status === 'failed') return '失败'
  return '已取消'
}

const taskStatusClass = (status: TaskStatus): string => {
  if (status === 'running' || status === 'active') {
    return 'bg-emerald-50 text-emerald-700'
  }
  if (status === 'pending_main_ack' || status === 'awaiting_user_confirmation') {
    return 'bg-amber-50 text-amber-700'
  }
  if (status === 'awaiting_user_input') {
    return 'bg-sky-50 text-sky-700'
  }
  if (status === 'done') {
    return 'bg-slate-100 text-slate-600'
  }
  return 'bg-rose-50 text-rose-700'
}

const executionStatusClass = (status: TaskExecutionStatus): string => {
  if (status === 'queued' || status === 'dispatching') {
    return 'bg-sky-50 text-sky-700'
  }
  if (status === 'running') {
    return 'bg-emerald-50 text-emerald-700'
  }
  if (status === 'awaiting_input') {
    return 'bg-amber-50 text-amber-700'
  }
  if (status === 'reported_done') {
    return 'bg-slate-100 text-slate-700'
  }
  return 'bg-rose-50 text-rose-700'
}

const formatTraceActor = (actor: TaskTraceActor): string => {
  if (actor === 'subagent') return '子 Agent'
  if (actor === 'main_agent') return '主 Agent'
  if (actor === 'user') return '用户'
  return '系统'
}

const formatTraceStage = (stage: TaskTraceStage): string => {
  if (stage === 'subagent_activated') return '子 Agent 已激活'
  if (stage === 'subagent_notify_main') return '子 Agent 请求主 Agent 响应'
  if (stage === 'main_received_subagent') return '主 Agent 已接收子 Agent'
  if (stage === 'main_response_silent') return '主 Agent 静默处理'
  if (stage === 'main_response_user') return '主 Agent 请求用户'
  return '用户补充任务输入'
}

const traceStageClass = (stage: TaskTraceStage): string => {
  if (stage === 'subagent_activated') return 'bg-blue-50 text-blue-700'
  if (stage === 'subagent_notify_main') return 'bg-indigo-50 text-indigo-700'
  if (stage === 'main_received_subagent') return 'bg-amber-50 text-amber-700'
  if (stage === 'main_response_silent') return 'bg-emerald-50 text-emerald-700'
  if (stage === 'main_response_user') return 'bg-sky-50 text-sky-700'
  return 'bg-slate-100 text-slate-700'
}

const formatIsoTime = (iso?: string): string => {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes}`
}
</script>
