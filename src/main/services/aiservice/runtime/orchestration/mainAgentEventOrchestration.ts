import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type {
  MainAgentEvent,
  MainAgentBackgroundPersonaStageEvent,
  MainAgentEventConsumptionResult,
  MainAgentTaskEvent,
  MainAgentTaskNotificationEvent,
  MainAgentUserMessageEvent,
  TaskLifecycleState
} from '@share/cache/AItype/states/taskLifecycleState'
import type {
  MainAgentGraphTurnResult,
  MainAgentInterruptionRecord,
  TurnWorkspace
} from '@share/cache/AItype/states/turnWorkspace'
import type { MainAgentLifecycleControlResult } from '../lifecycle/mainAgentLifecycleControlService'
import {
  MAIN_AGENT_FLOW_RULES,
  type MainAgentCommitOwner
} from '@share/cache/AItype/states/mainAgentOrchestrationRules'
import { isAgentLoopTerminationError } from '../../agentrsystem/execution/reasoningLoopPolicy'

type MainAgentRuntimeResult = {
  fullText: string
  interrupted: boolean
  graphResult?: MainAgentGraphTurnResult
  interruptedWorkspace?: TurnWorkspace
  interruption?: MainAgentInterruptionRecord
}

const USER_MESSAGE_FAILURE_NOTICE = '本轮处理未能完成。你可以重试这条消息。'

export type MainAgentEventOrchestrationDependencies = {
  createChatTurn: (input: {
    eventId: string
    sessionId: string
    userMessageId: number
  }) => Promise<{ turnId: number; resumeFromHead?: boolean }>
  controlUserMessage: (
    event: MainAgentUserMessageEvent,
    onChunk?: (chunk: StreamChunk) => void
  ) => Promise<MainAgentLifecycleControlResult>
  runUserMessage: (
    eventId: string,
    turnId: number,
    userMessageId: number,
    content: MainAgentUserMessageEvent['payload']['content'],
    workspaceContext: MainAgentUserMessageEvent['payload']['workspaceContext'],
    onChunk?: (chunk: StreamChunk) => void,
    taskLifecycle?: TaskLifecycleState,
    resumeFromHead?: boolean
  ) => Promise<MainAgentRuntimeResult>
  createBackgroundPersonaStageTurn: (input: {
    eventId: string
    sessionId: string
  }) => Promise<{ turnId: number }>
  createTaskNotificationTurn: (input: {
    eventId: string
    sessionId: string
  }) => Promise<{ turnId: number; resumeFromHead?: boolean }>
  prepareTaskNotification: (
    event: MainAgentTaskNotificationEvent
  ) => Promise<MainAgentTaskEvent | null>
  runTaskNotification: (
    eventId: string,
    turnId: number,
    sessionId: string,
    taskEvent: MainAgentTaskEvent,
    resumeFromHead?: boolean
  ) => Promise<MainAgentRuntimeResult>
  runBackgroundPersonaStage: (
    eventId: string,
    turnId: number,
    sessionId: string,
    payload: MainAgentBackgroundPersonaStageEvent['payload']
  ) => Promise<MainAgentRuntimeResult>
  applyEffects: (result: MainAgentEventConsumptionResult) => Promise<void>
  completeTaskNotificationConsumption: (event: MainAgentTaskNotificationEvent) => Promise<void>
  logUserMessageError: (error: unknown) => string
}

type UserMessagePreparedState = {
  kind: 'chat_runtime'
  turnId: number
  taskLifecycle?: TaskLifecycleState
  resumeFromHead?: boolean
}

type MainAgentEventPreparedStateMap = {
  user_message: UserMessagePreparedState
  task_notification: {
    turnId: number
    taskEvent: MainAgentTaskEvent
    resumeFromHead?: boolean
  } | null
  background_persona_stage: { turnId: number }
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
  fullText: string,
  workspace: TurnWorkspace | undefined,
  interruption: MainAgentInterruptionRecord | undefined,
  onChunk?: (chunk: StreamChunk) => void
): MainAgentEventConsumptionResult => {
  const effectContext = createEffectContext(event)
  const effects: MainAgentEventConsumptionResult['effects'] = [
    {
      ...effectContext,
      type: 'commit_turn',
      turnId,
      status: 'interrupted',
      consumer: 'chat_runtime',
      finalResponse: fullText.trim()
        ? { messageId: `${event.id}:interrupted`, content: fullText }
        : undefined,
      workspace,
      interruption,
      observations: [
        {
          type: 'user_interrupt',
          source: 'user',
          summary: '用户主动中断当前主 Agent Turn。',
          payload: {
            sourceVersionId: interruption?.sourceVersionId,
            resumePoint: interruption?.resumePoint
          }
        }
      ]
    },
    {
      ...effectContext,
      type: 'stream_interrupted',
      onChunk,
      fullText
    }
  ]

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
  graphResult: MainAgentGraphTurnResult,
  onChunk?: (chunk: StreamChunk) => void
): MainAgentEventConsumptionResult => {
  const effectContext = createEffectContext(event)
  if (!graphResult.finalResponse?.content.trim()) {
    throw new Error('Agent graph completed without a canonical final response')
  }
  return {
    handled: true,
    consumer: 'chat_runtime',
    summary: 'user_message_completed',
    effects: [
      {
        ...effectContext,
        type: 'commit_turn',
        turnId,
        status: 'completed',
        consumer: 'chat_runtime',
        finalResponse: graphResult.finalResponse,
        workspace: graphResult.workspace
      },
      {
        ...effectContext,
        type: 'stream_done',
        onChunk,
        fullText: graphResult.finalResponse.content
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
  const errorMessage = dependencies.logUserMessageError(error)
  const systemNotice = isAgentLoopTerminationError(error)
    ? error.userNotice
    : USER_MESSAGE_FAILURE_NOTICE
  const failedWorkspace = isAgentLoopTerminationError(error) ? error.turnWorkspace : undefined
  return {
    handled: true,
    consumer: 'chat_runtime',
    summary: 'user_message_failed',
    effects: [
      ...(typeof turnId === 'number'
        ? ([
            {
              ...effectContext,
              type: 'commit_turn',
              turnId,
              status: 'failed',
              consumer: 'chat_runtime',
              errorMessage,
              systemNotice,
              workspace: failedWorkspace
            }
          ] as MainAgentEventConsumptionResult['effects'])
        : []),
      {
        ...effectContext,
        type: 'stream_error',
        onChunk,
        message: systemNotice
      }
    ]
  }
}

const userMessageHandler: MainAgentEventHandler<MainAgentUserMessageEvent> = {
  eventType: 'user_message',
  owner: MAIN_AGENT_FLOW_RULES.user_message.owner,
  async prepare(event, dependencies, runtime) {
    const turn = await dependencies.createChatTurn({
      eventId: event.id,
      sessionId: event.sessionId,
      userMessageId: event.payload.messageId
    })

    if (turn.resumeFromHead) {
      return {
        kind: 'chat_runtime',
        turnId: turn.turnId,
        resumeFromHead: true
      }
    }

    const control = await dependencies.controlUserMessage(event, runtime?.onChunk)

    return {
      kind: 'chat_runtime',
      turnId: turn.turnId,
      taskLifecycle: control.taskLifecycle,
      resumeFromHead: turn.resumeFromHead
    }
  },
  async consume(event, prepared, dependencies, runtime) {
    try {
      const result = await dependencies.runUserMessage(
        event.id,
        prepared.turnId,
        event.payload.messageId,
        event.payload.content,
        event.payload.workspaceContext,
        runtime?.onChunk,
        prepared.taskLifecycle,
        prepared.resumeFromHead
      )

      if (result.interrupted) {
        return buildInterruptedResult(
          event,
          prepared.turnId,
          result.fullText,
          result.interruptedWorkspace,
          result.interruption,
          runtime?.onChunk
        )
      }

      if (!result.graphResult) {
        throw new Error('Agent runtime completed without a graph turn result')
      }
      return buildCompletedResult(event, prepared.turnId, result.graphResult, runtime?.onChunk)
    } catch (error) {
      return buildFailedUserMessageResult(
        event,
        prepared.turnId,
        dependencies,
        error,
        runtime?.onChunk
      )
    }
  }
}

const taskNotificationHandler: MainAgentEventHandler<MainAgentTaskNotificationEvent> = {
  eventType: 'task_notification',
  owner: MAIN_AGENT_FLOW_RULES.task_notification.owner,
  async prepare(event, dependencies) {
    const taskEvent = await dependencies.prepareTaskNotification(event)
    if (!taskEvent) return null
    const turn = await dependencies.createTaskNotificationTurn({
      eventId: event.id,
      sessionId: event.sessionId
    })
    return { turnId: turn.turnId, taskEvent, resumeFromHead: turn.resumeFromHead }
  },
  async consume(event, prepared, dependencies) {
    if (!prepared) {
      return {
        handled: false,
        consumer: 'task_notification_consumer',
        summary: 'task_notification_missing_or_already_consumed',
        effects: []
      }
    }
    try {
      const result = await dependencies.runTaskNotification(
        event.id,
        prepared.turnId,
        event.sessionId,
        prepared.taskEvent,
        prepared.resumeFromHead
      )
      if (result.interrupted || !result.graphResult?.finalResponse?.content.trim()) {
        throw new Error('Task notification subject turn did not complete.')
      }
      return {
        handled: true,
        consumer: 'task_notification_consumer',
        summary: 'task_notification_integrated_by_subject',
        effects: [
          {
            ...createEffectContext(event),
            type: 'commit_turn',
            turnId: prepared.turnId,
            status: 'completed',
            consumer: 'task_notification_consumer',
            finalResponse: result.graphResult.finalResponse,
            workspace: result.graphResult.workspace
          },
          {
            ...createEffectContext(event),
            type: 'emit_trace',
            taskId: prepared.taskEvent.taskId,
            actor: 'main_agent',
            stage: 'main_response_user',
            message: '主 Agent 已理解、验收并回应子 Agent 的执行结果。',
            dedupeKey: `${event.id}:main_response_user:main_agent`,
            payload: {
              notificationType: prepared.taskEvent.notificationType,
              outcome: prepared.taskEvent.payload.outcome
            }
          }
        ]
      }
    } catch (error) {
      throw new Error(
        `Task notification subject integration failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  },
  async commit(event, result, dependencies) {
    if (result.handled && result.summary === 'task_notification_integrated_by_subject') {
      await dependencies.completeTaskNotificationConsumption(event)
    }
  }
}

const buildBackgroundStageResult = (
  event: MainAgentBackgroundPersonaStageEvent,
  turnId: number,
  fullText: string,
  interrupted: boolean,
  graphResult?: MainAgentGraphTurnResult,
  interruptedWorkspace?: TurnWorkspace,
  interruption?: MainAgentInterruptionRecord
): MainAgentEventConsumptionResult => {
  const effectContext = createEffectContext(event)
  const status = interrupted ? 'interrupted' : 'completed'
  const summary = interrupted
    ? 'background_persona_stage_interrupted'
    : 'background_persona_stage_completed'

  return {
    handled: true,
    consumer: 'background_persona_stage_consumer',
    summary,
    effects: [
      {
        ...effectContext,
        type: 'commit_turn',
        turnId,
        status,
        consumer: 'background_persona_stage_consumer',
        workspace: interrupted ? interruptedWorkspace : graphResult?.workspace,
        interruption: interrupted ? interruption : undefined,
        observations: [
          {
            type: interrupted
              ? 'background_persona_stage_interrupted'
              : 'background_persona_stage_completed',
            source: 'background_persona',
            summary: `${event.payload.title} / ${event.payload.stageId}: ${fullText.trim().slice(0, 160)}`,
            payload: {
              backgroundTaskId: event.payload.backgroundTaskId,
              stageId: event.payload.stageId,
              stageKind: event.payload.stageKind,
              title: event.payload.title,
              resumePointer: event.payload.resumePointer,
              interrupted,
              sourceVersionId: interruption?.sourceVersionId,
              resumePoint: interruption?.resumePoint,
              result: fullText
            }
          }
        ]
      }
    ]
  }
}

const buildFailedBackgroundStageResult = (
  event: MainAgentBackgroundPersonaStageEvent,
  turnId: number | undefined,
  error: unknown
): MainAgentEventConsumptionResult => {
  const effectContext = createEffectContext(event)
  const message = error instanceof Error ? error.message : String(error)
  return {
    handled: true,
    consumer: 'background_persona_stage_consumer',
    summary: 'background_persona_stage_failed',
    effects: [
      ...(typeof turnId === 'number'
        ? ([
            {
              ...effectContext,
              type: 'commit_turn',
              turnId,
              status: 'failed',
              consumer: 'background_persona_stage_consumer',
              errorMessage: message,
              observations: [
                {
                  type: 'background_persona_stage_failed',
                  source: 'background_persona',
                  summary: `${event.payload.title} / ${event.payload.stageId} failed`,
                  payload: {
                    backgroundTaskId: event.payload.backgroundTaskId,
                    stageId: event.payload.stageId,
                    stageKind: event.payload.stageKind,
                    title: event.payload.title,
                    resumePointer: event.payload.resumePointer,
                    error: message
                  }
                }
              ]
            }
          ] satisfies MainAgentEventConsumptionResult['effects'])
        : [])
    ]
  }
}

const backgroundPersonaStageHandler: MainAgentEventHandler<MainAgentBackgroundPersonaStageEvent> = {
  eventType: 'background_persona_stage',
  owner: MAIN_AGENT_FLOW_RULES.background_persona_stage.owner,
  async prepare(event, dependencies) {
    const turn = await dependencies.createBackgroundPersonaStageTurn({
      eventId: event.id,
      sessionId: event.sessionId
    })
    return { turnId: turn.turnId }
  },
  async consume(event, prepared, dependencies) {
    try {
      const result = await dependencies.runBackgroundPersonaStage(
        event.id,
        prepared.turnId,
        event.sessionId,
        event.payload
      )
      return buildBackgroundStageResult(
        event,
        prepared.turnId,
        result.fullText,
        result.interrupted,
        result.graphResult,
        result.interruptedWorkspace,
        result.interruption
      )
    } catch (error) {
      return buildFailedBackgroundStageResult(event, prepared.turnId, error)
    }
  }
}

export const MAIN_AGENT_EVENT_ORCHESTRATION_TABLE = {
  user_message: userMessageHandler,
  task_notification: taskNotificationHandler,
  background_persona_stage: backgroundPersonaStageHandler
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

  if (event.type === 'background_persona_stage') {
    return executeMainAgentEventHandler(
      MAIN_AGENT_EVENT_ORCHESTRATION_TABLE.background_persona_stage,
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
