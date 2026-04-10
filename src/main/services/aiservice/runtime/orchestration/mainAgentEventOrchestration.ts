import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type {
  MainAgentEvent,
  MainAgentEventConsumptionResult,
  MainAgentTaskNotificationEvent,
  MainAgentUserMessageEvent,
  TaskLifecycleState
} from '@share/cache/AItype/states/taskLifecycleState'
import type { MainAgentLifecycleControlResult } from '../lifecycle/mainAgentLifecycleControlService'
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
  getPersistedUserMessageText: (messageId: number) => Promise<string>
  controlUserMessage: (
    event: MainAgentUserMessageEvent,
    onChunk?: (chunk: StreamChunk) => void
  ) => Promise<MainAgentLifecycleControlResult>
  runUserMessage: (
    eventId: string,
    turnId: number,
    userMessageId: number,
    content: MainAgentUserMessageEvent['payload']['content'],
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
    dependencies: MainAgentEventOrchestrationDependencies,
    runtime?: { onChunk?: (chunk: StreamChunk) => void }
  ) => Promise<MainAgentEventPreparedStateMap[TEvent['type']]>
  consume: (
    event: TEvent,
    prepared: MainAgentEventPreparedStateMap[TEvent['type']],
    dependencies: MainAgentEventOrchestrationDependencies,
    runtime?: { onChunk?: (chunk: StreamChunk) => void }
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
  userText: string,
  fullText: string,
  onChunk?: (chunk: StreamChunk) => void
): MainAgentEventConsumptionResult => {
  const effectContext = createEffectContext(event)
  const effects: MainAgentEventConsumptionResult['effects'] = [
    {
      ...effectContext,
      type: 'sync_memory_messages',
      messages: [
        {
          role: 'user',
          content: userText
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
      onChunk,
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
  fullText: string,
  onChunk?: (chunk: StreamChunk) => void
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
        onChunk,
        fullText
      }
    ]
  }
}

const buildFailedUserMessageResult = (
  event: MainAgentUserMessageEvent,
  turnId: number | undefined,
  dependencies: MainAgentEventOrchestrationDependencies,
  error: unknown,
  onChunk?: (chunk: StreamChunk) => void
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
        onChunk,
        message: dependencies.logUserMessageError(error)
      }
    ]
  }
}

const userMessageHandler: MainAgentEventHandler<MainAgentUserMessageEvent> = {
  eventType: 'user_message',
  owner: MAIN_AGENT_FLOW_RULES.user_message.owner,
  async prepare(event, dependencies, runtime) {
    const control = await dependencies.controlUserMessage(event, runtime?.onChunk)
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
  async consume(event, prepared, dependencies, runtime) {
    if (prepared.kind === 'handled') {
      return prepared.result
    }

    try {
      const result = await dependencies.runUserMessage(
        event.id,
        prepared.turnId,
        event.payload.messageId,
        event.payload.content,
        runtime?.onChunk,
        prepared.taskLifecycle
      )

      const userText = await dependencies.getPersistedUserMessageText(event.payload.messageId)

      if (result.interrupted) {
        return buildInterruptedResult(event, prepared.turnId, userText, result.fullText, runtime?.onChunk)
      }

      return buildCompletedResult(event, prepared.turnId, result.fullText, runtime?.onChunk)
    } catch (error) {
      return buildFailedUserMessageResult(event, prepared.turnId, dependencies, error, runtime?.onChunk)
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
  dependencies: MainAgentEventOrchestrationDependencies,
  runtime?: { onChunk?: (chunk: StreamChunk) => void }
): Promise<MainAgentEventConsumptionResult> {
  const prepared = handler.prepare ? await handler.prepare(event, dependencies, runtime) : null
  const result = await handler.consume(
    event,
    prepared as MainAgentEventPreparedStateMap[TEvent['type']],
    dependencies,
    runtime
  )
  await dependencies.applyEffects(result)
  if (handler.commit) {
    await handler.commit(event, result, dependencies)
  }
  return result
}

export async function orchestrateMainAgentEvent(
  event: MainAgentEvent,
  dependencies: MainAgentEventOrchestrationDependencies,
  runtime?: { onChunk?: (chunk: StreamChunk) => void }
): Promise<MainAgentEventConsumptionResult> {
  if (event.type === 'user_message') {
    return executeMainAgentEventHandler(
      MAIN_AGENT_EVENT_ORCHESTRATION_TABLE.user_message,
      event,
      dependencies,
      runtime
    )
  }

  return executeMainAgentEventHandler(
    MAIN_AGENT_EVENT_ORCHESTRATION_TABLE.task_notification,
    event,
    dependencies,
    runtime
  )
}
