import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type {
  MainAgentEvent,
  MainAgentEventConsumptionResult,
  MainAgentTaskNotificationEvent,
  MainAgentUserMessageEvent
} from '@share/cache/AItype/states/taskLifecycleState'

export type MainAgentEventProcessorDependencies = {
  runUserMessage: (
    message: string,
    onChunk?: (chunk: StreamChunk) => void
  ) => Promise<{ fullText: string }>
  consumeTaskNotification: (
    event: MainAgentTaskNotificationEvent
  ) => Promise<MainAgentEventConsumptionResult>
  logUserMessageError: (error: unknown) => string
}

const createEffectContext = (event: MainAgentEvent) => ({
  eventId: event.id,
  sessionId: event.sessionId
})

async function processUserMessageEvent(
  event: MainAgentUserMessageEvent,
  dependencies: MainAgentEventProcessorDependencies
): Promise<MainAgentEventConsumptionResult> {
  const effectContext = createEffectContext(event)

  try {
    const result = await dependencies.runUserMessage(event.payload.text, event.payload.onChunk)

    return {
      handled: true,
      consumer: 'chat_runtime',
      summary: 'user_message_completed',
      effects: [
        {
          ...effectContext,
          type: 'save_message',
          role: 'ai',
          content: result.fullText
        },
        {
          ...effectContext,
          type: 'stream_done',
          onChunk: event.payload.onChunk,
          fullText: result.fullText
        }
      ]
    }
  } catch (error: unknown) {
    return {
      handled: true,
      consumer: 'chat_runtime',
      summary: 'user_message_failed',
      effects: [
        {
          ...effectContext,
          type: 'stream_error',
          onChunk: event.payload.onChunk,
          message: dependencies.logUserMessageError(error)
        }
      ]
    }
  }
}

export async function processMainAgentEvent(
  event: MainAgentEvent,
  dependencies: MainAgentEventProcessorDependencies
): Promise<MainAgentEventConsumptionResult> {
  if (event.type === 'user_message') {
    return processUserMessageEvent(event, dependencies)
  }

  return dependencies.consumeTaskNotification(event)
}
