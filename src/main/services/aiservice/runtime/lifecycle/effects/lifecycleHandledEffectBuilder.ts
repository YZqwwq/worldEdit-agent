import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type {
  MainAgentEventConsumptionResult,
  MainAgentUserMessageEvent,
  TaskTraceStage
} from '@share/cache/AItype/states/taskLifecycleState'

const createEffectContext = (event: MainAgentUserMessageEvent) => ({
  eventId: event.id,
  sessionId: event.sessionId
})

export const buildLifecycleHandledResult = (input: {
  event: MainAgentUserMessageEvent
  summary: string
  visibleMessage: string
  taskId: number
  executionId?: number
  userTraceMessage: string
  mainTraceMessage: string
  mainTraceStage?: TaskTraceStage
  payload?: Record<string, unknown>
  onChunk?: (chunk: StreamChunk) => void
}): MainAgentEventConsumptionResult => {
  const effectContext = createEffectContext(input.event)

  return {
    handled: true,
    consumer: 'lifecycle_control',
    summary: input.summary,
    effects: [
      {
        ...effectContext,
        type: 'save_message',
        role: 'ai',
        content: input.visibleMessage,
        eventIdRef: input.event.id,
        consumer: 'lifecycle_control'
      },
      {
        ...effectContext,
        type: 'emit_trace',
        taskId: input.taskId,
        executionId: input.executionId,
        actor: 'user',
        stage: 'user_replied_to_task',
        message: input.userTraceMessage,
        dedupeKey: `${input.event.id}:user_replied_to_task:user`,
        payload: input.payload
      },
      {
        ...effectContext,
        type: 'emit_trace',
        taskId: input.taskId,
        executionId: input.executionId,
        actor: 'main_agent',
        stage: input.mainTraceStage ?? 'main_response_user',
        message: input.mainTraceMessage,
        dedupeKey: `${input.event.id}:${input.mainTraceStage ?? 'main_response_user'}:main_agent`,
        payload: input.payload
      },
      {
        ...effectContext,
        type: 'stream_done',
        onChunk: input.onChunk,
        fullText: input.visibleMessage
      }
    ]
  }
}
