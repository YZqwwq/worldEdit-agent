import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type {
  MainAgentEvent,
  MainAgentEventConsumptionResult,
  MainAgentTaskNotificationEvent,
  MainAgentUserMessageEvent,
  TaskLifecycleState
} from '@share/cache/AItype/states/taskLifecycleState'
import type { MainAgentLifecycleControlResult } from './mainAgentLifecycleControlService'
import {
  MAIN_AGENT_FLOW_RULES,
  type MainAgentCommitOwner
} from '@share/cache/AItype/states/mainAgentOrchestrationRules'

export type MainAgentEventOrchestrationDependencies = {
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
  applyEffects: (result: MainAgentEventConsumptionResult) => Promise<void>
  completeTaskNotificationConsumption: (
    event: MainAgentTaskNotificationEvent
  ) => Promise<void>
  logUserMessageError: (error: unknown) => string
}

type UserMessagePreparedState =
  | {
      kind: 'handled'
      result: MainAgentEventConsumptionResult
    }
  | {
      kind: 'chat_runtime'
      turnId: number
      taskLifecycle?: TaskLifecycleState
    }

type MainAgentEventPreparedStateMap = {
  user_message: UserMessagePreparedState
  task_notification: null
}

type MainAgentEventHandler<TEvent extends MainAgentEvent> = {
  eventType: TEvent['type']
  owner: MainAgentCommitOwner
  prepare?: (
    event: TEvent,
    dependencies: MainAgentEventOrchestrationDependencies
  ) => Promise<MainAgentEventPreparedStateMap[TEvent['type']]>
  consume: (
    event: TEvent,
    prepared: MainAgentEventPreparedStateMap[TEvent['type']],
    dependencies: MainAgentEventOrchestrationDependencies
  ) => Promise<MainAgentEventConsumptionResult>
  commit?: (
    event: TEvent,
    result: MainAgentEventConsumptionResult,
    dependencies: MainAgentEventOrchestrationDependencies
  ) => Promise<void>
}

const createEffectContext = (event: MainAgentEvent) => ({
  eventId: event.id,
  sessionId: event.sessionId
})

const buildInterruptedResult = (
  event: MainAgentUserMessageEvent,
  turnId: number,
  fullText: string
): MainAgentEventConsumptionResult => {
  const effectContext = createEffectContext(event)
  const effects: MainAgentEventConsumptionResult['effects'] = [
    {
      ...effectContext,
      type: 'sync_memory_messages',
      messages: [
        {
          role: 'user',
          content: event.payload.text
        },
        ...(fullText.trim()
          ? ([
              {
                role: 'ai' as const,
                content: fullText
              }
            ] satisfies Array<{ role: 'user' | 'ai'; content: string }>)
          : [])
      ]
    },
    {
      ...effectContext,
      type: 'update_chat_turn',
      turnId,
      status: 'interrupted'
    },
    {
      ...effectContext,
      type: 'stream_done',
      onChunk: event.payload.onChunk,
      fullText
    }
  ]

  if (fullText.trim()) {
    effects.unshift({
      ...effectContext,
      type: 'save_message',
      role: 'ai',
      content: fullText,
      turnId,
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

const buildCompletedResult = (
  event: MainAgentUserMessageEvent,
  turnId: number,
  fullText: string
): MainAgentEventConsumptionResult => {
  const effectContext = createEffectContext(event)
  return {
    handled: true,
    consumer: 'chat_runtime',
    summary: 'user_message_completed',
    effects: [
      {
        ...effectContext,
        type: 'save_message',
        role: 'ai',
        content: fullText,
        turnId,
        messageStatus: 'committed',
        eventIdRef: event.id,
        consumer: 'chat_runtime'
      },
      {
        ...effectContext,
        type: 'update_chat_turn',
        turnId,
        status: 'completed'
      },
      {
        ...effectContext,
        type: 'stream_done',
        onChunk: event.payload.onChunk,
        fullText
      }
    ]
  }
}

const buildFailedUserMessageResult = (
  event: MainAgentUserMessageEvent,
  turnId: number | undefined,
  dependencies: MainAgentEventOrchestrationDependencies,
  error: unknown
): MainAgentEventConsumptionResult => {
  const effectContext = createEffectContext(event)
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

const userMessageHandler: MainAgentEventHandler<MainAgentUserMessageEvent> = {
  eventType: 'user_message',
  owner: MAIN_AGENT_FLOW_RULES.user_message.owner,
  async prepare(event, dependencies) {
    const control = await dependencies.controlUserMessage(event)
    if (control.handledResult) {
      return {
        kind: 'handled',
        result: control.handledResult
      }
    }

    const turn = await dependencies.createChatTurn({
      eventId: event.id,
      sessionId: event.sessionId,
      userMessageId: event.payload.messageId
    })

    return {
      kind: 'chat_runtime',
      turnId: turn.turnId,
      taskLifecycle: control.taskLifecycle
    }
  },
  async consume(event, prepared, dependencies) {
    if (prepared.kind === 'handled') {
      return prepared.result
    }

    try {
      const result = await dependencies.runUserMessage(
        event.id,
        prepared.turnId,
        event.payload.text,
        event.payload.onChunk,
        prepared.taskLifecycle
      )

      if (result.interrupted) {
        return buildInterruptedResult(event, prepared.turnId, result.fullText)
      }

      return buildCompletedResult(event, prepared.turnId, result.fullText)
    } catch (error) {
      return buildFailedUserMessageResult(event, prepared.turnId, dependencies, error)
    }
  }
}

const taskNotificationHandler: MainAgentEventHandler<MainAgentTaskNotificationEvent> = {
  eventType: 'task_notification',
  owner: MAIN_AGENT_FLOW_RULES.task_notification.owner,
  async consume(event, _prepared, dependencies) {
    return dependencies.consumeTaskNotification(event)
  },
  async commit(event, _result, dependencies) {
    await dependencies.completeTaskNotificationConsumption(event)
  }
}

export const MAIN_AGENT_EVENT_ORCHESTRATION_TABLE = {
  user_message: userMessageHandler,
  task_notification: taskNotificationHandler
} satisfies {
  [K in MainAgentEvent['type']]: MainAgentEventHandler<Extract<MainAgentEvent, { type: K }>>
}

async function executeMainAgentEventHandler<TEvent extends MainAgentEvent>(
  handler: MainAgentEventHandler<TEvent>,
  event: TEvent,
  dependencies: MainAgentEventOrchestrationDependencies
): Promise<MainAgentEventConsumptionResult> {
  const prepared = handler.prepare ? await handler.prepare(event, dependencies) : null
  const result = await handler.consume(event, prepared as MainAgentEventPreparedStateMap[TEvent['type']], dependencies)
  await dependencies.applyEffects(result)
  if (handler.commit) {
    await handler.commit(event, result, dependencies)
  }
  return result
}

export async function orchestrateMainAgentEvent(
  event: MainAgentEvent,
  dependencies: MainAgentEventOrchestrationDependencies
): Promise<MainAgentEventConsumptionResult> {
  if (event.type === 'user_message') {
    return executeMainAgentEventHandler(
      MAIN_AGENT_EVENT_ORCHESTRATION_TABLE.user_message,
      event,
      dependencies
    )
  }

  return executeMainAgentEventHandler(
    MAIN_AGENT_EVENT_ORCHESTRATION_TABLE.task_notification,
    event,
    dependencies
  )
}
