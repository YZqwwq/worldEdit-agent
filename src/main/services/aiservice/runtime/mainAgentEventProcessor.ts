import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type {
  MainAgentEvent,
  MainAgentEventConsumptionResult,
  MainAgentTaskNotificationEvent,
  MainAgentUserMessageEvent,
  TaskLifecycleState
} from '@share/cache/AItype/states/taskLifecycleState'
import type { MainAgentLifecycleControlResult } from './mainAgentLifecycleControlService'

export type MainAgentEventProcessorDependencies = {
  createChatTurn: (input: {
    eventId: string
    sessionId: string
    userMessageId: number
  }) => Promise<{ turnId: number }>
  controlUserMessage: (
    event: MainAgentUserMessageEvent
  ) => Promise<MainAgentLifecycleControlResult>
  runUserMessage: (
    eventId: string,
    turnId: number,
    message: string,
    onChunk?: (chunk: StreamChunk) => void,
    taskLifecycle?: TaskLifecycleState
  ) => Promise<{ fullText: string; interrupted: boolean }>
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
  let turnId: number | undefined

  try {
    const control = await dependencies.controlUserMessage(event)
    if (control.handledResult) {
      return control.handledResult
    }

    const turn = await dependencies.createChatTurn({
      eventId: event.id,
      sessionId: event.sessionId,
      userMessageId: event.payload.messageId
    })
    const currentTurnId = turn.turnId
    turnId = currentTurnId

    const result = await dependencies.runUserMessage(
      event.id,
      currentTurnId,
      event.payload.text,
      event.payload.onChunk,
      control.taskLifecycle
    )

    if (result.interrupted) {
      const effects: MainAgentEventConsumptionResult['effects'] = [
        {
          ...effectContext,
          type: 'sync_memory_messages',
          messages: [
            {
              role: 'user',
              content: event.payload.text
            },
            ...(result.fullText.trim()
              ? ([
                  {
                    role: 'ai' as const,
                    content: result.fullText
                  }
                ] satisfies Array<{ role: 'user' | 'ai'; content: string }>)
              : [])
          ]
        },
        {
          ...effectContext,
          type: 'update_chat_turn',
          turnId: currentTurnId,
          status: 'interrupted'
        },
        {
          ...effectContext,
          type: 'stream_done',
          onChunk: event.payload.onChunk,
          fullText: result.fullText
        }
      ]

      if (result.fullText.trim()) {
        effects.unshift({
          ...effectContext,
          type: 'save_message',
          role: 'ai',
          content: result.fullText,
          turnId: currentTurnId,
          messageStatus: 'interrupted',
          eventIdRef: event.id,
          consumer: 'chat_runtime'
        })
      }

      return {
        handled: true,
        consumer: 'chat_runtime',
        summary: 'user_message_interrupted',
        effects
      }
    }

    return {
      handled: true,
      consumer: 'chat_runtime',
      summary: 'user_message_completed',
      effects: [
        {
          ...effectContext,
          type: 'save_message',
          role: 'ai',
          content: result.fullText,
          turnId: currentTurnId,
          messageStatus: 'committed',
          eventIdRef: event.id,
          consumer: 'chat_runtime'
        },
        {
          ...effectContext,
          type: 'update_chat_turn',
          turnId: currentTurnId,
          status: 'completed'
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
        ...(typeof turnId === 'number'
          ? ([
              {
                ...effectContext,
                type: 'update_chat_turn',
                turnId,
                status: 'failed',
                errorMessage: dependencies.logUserMessageError(error)
              }
            ] as MainAgentEventConsumptionResult['effects'])
          : []),
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
