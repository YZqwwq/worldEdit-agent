import assert from 'node:assert/strict'
import test from 'node:test'
import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type {
  MainAgentEffect,
  MainAgentEventConsumptionResult,
  MainAgentUserMessageEvent
} from '@share/cache/AItype/states/taskLifecycleState'
import { createDefaultMemorySlots } from '../agentrsystem/manager/memory/memoryWritePolicy'
import {
  createFinalResponse,
  createTurnWorkspace,
  withMemoryMessagesDraft,
  withSuccessfulToolUse
} from '../agentrsystem/state/turnWorkspace'
import {
  orchestrateMainAgentEvent,
  type MainAgentEventOrchestrationDependencies
} from '../runtime/orchestration/mainAgentEventOrchestration'
import { resolveContextualToolsets } from '../agentrsystem/node/contextnode/contextualToolActivation'

const CURRENT_DOCUMENT_CONTEXT = {
  pageKind: 'document' as const,
  routeName: 'WorldEntityDocumentEditor',
  capturedAt: '2026-08-09T10:00:00.000Z',
  world: { id: 'world-1234', name: '1234' },
  document: {
    id: 'document-foundation-energy',
    title: '物质与能量',
    ownerKind: 'world' as const,
    parentDocumentId: null,
    revision: 68
  }
}

const createScenarioEvent = (): MainAgentUserMessageEvent => ({
  id: 'event-scenario-1',
  type: 'user_message',
  source: 'user',
  sessionId: 'default',
  priority: 'interactive',
  createdAt: Date.parse(CURRENT_DOCUMENT_CONTEXT.capturedAt),
  payload: {
    messageId: 101,
    content: [{ type: 'text', text: '看看菲尔娜的描述是否与当前基础设定一致' }],
    workspaceContext: CURRENT_DOCUMENT_CONTEXT
  }
})

test('document discussion keeps one coherent path from page snapshot to final commit', async () => {
  const event = createScenarioEvent()
  const appliedEffects: MainAgentEffect[] = []
  const streamedChunks: StreamChunk[] = []
  let runtimeWorkspaceContext: unknown

  let workspace = createTurnWorkspace({
    eventId: event.id,
    turnId: 501,
    sessionId: event.sessionId,
    runId: 'run-scenario-1',
    memorySlots: createDefaultMemorySlots(),
    persona: null
  })
  workspace = withSuccessfulToolUse(workspace, 'list_world_documents')
  workspace = withSuccessfulToolUse(workspace, 'read_world_document')
  workspace = withMemoryMessagesDraft(workspace, [
    { role: 'user', content: '看看菲尔娜的描述是否与当前基础设定一致' },
    { role: 'ai', content: '菲尔娜的人物描述与当前基础设定基本一致。' }
  ])

  const dependencies: MainAgentEventOrchestrationDependencies = {
    createChatTurn: async () => ({ turnId: 501 }),
    controlUserMessage: async () => ({}),
    runUserMessage: async (_eventId, _turnId, _messageId, _content, workspaceContext) => {
      runtimeWorkspaceContext = workspaceContext
      return {
        fullText: '这段流式文本不应成为持久化权威来源。',
        interrupted: false,
        graphResult: {
          workspace,
          finalResponse: createFinalResponse({
            messageId: 'response-scenario-1',
            content: '菲尔娜的人物描述与当前基础设定基本一致。'
          })
        }
      }
    },
    createBackgroundPersonaStageTurn: async () => ({ turnId: 0 }),
    runBackgroundPersonaStage: async () => ({ fullText: '', interrupted: false }),
    consumeTaskNotification: async () => {
      throw new Error('not used in this scenario')
    },
    applyEffects: async (result: MainAgentEventConsumptionResult) => {
      appliedEffects.push(...result.effects)
      for (const effect of result.effects) {
        if (effect.type === 'stream_done') {
          effect.onChunk?.({
            type: 'done',
            fullContent: [{ type: 'text', text: effect.fullText }]
          })
        }
      }
    },
    completeTaskNotificationConsumption: async () => undefined,
    logUserMessageError: (error) => (error instanceof Error ? error.message : String(error))
  }

  const result = await orchestrateMainAgentEvent(event, dependencies, {
    onChunk: (chunk) => streamedChunks.push(chunk)
  })

  assert.deepEqual(runtimeWorkspaceContext, CURRENT_DOCUMENT_CONTEXT)
  assert.equal(result.summary, 'user_message_completed')
  assert.equal(result.eventCommitted, true)
  assert.deepEqual(
    appliedEffects.map((effect) => effect.type),
    ['commit_turn', 'stream_done']
  )

  const commitEffects = appliedEffects.filter((effect) => effect.type === 'commit_turn')
  assert.equal(commitEffects.length, 1)
  const commit = commitEffects[0]
  assert.equal(commit.type, 'commit_turn')
  assert.equal(commit.status, 'completed')
  assert.equal(commit.finalResponse?.content, '菲尔娜的人物描述与当前基础设定基本一致。')
  assert.deepEqual(commit.workspace?.draft.successfulToolNames, [
    'list_world_documents',
    'read_world_document'
  ])
  assert.deepEqual(commit.workspace?.draft.memoryMessages, [
    { role: 'user', content: '看看菲尔娜的描述是否与当前基础设定一致' },
    { role: 'ai', content: '菲尔娜的人物描述与当前基础设定基本一致。' }
  ])
  assert.deepEqual(streamedChunks, [
    {
      type: 'done',
      fullContent: [{ type: 'text', text: '菲尔娜的人物描述与当前基础设定基本一致。' }]
    }
  ])
})

test('the current document page activates the document capability package', () => {
  const activeToolsets = resolveContextualToolsets(CURRENT_DOCUMENT_CONTEXT)

  assert.deepEqual(activeToolsets, ['world_document_editor'])
})

test('a resumed turn can pause again without publishing a formal commit', async () => {
  const event = createScenarioEvent()
  const appliedEffects: MainAgentEffect[] = []
  let receivedResumeFlag = false
  const dependencies: MainAgentEventOrchestrationDependencies = {
    createChatTurn: async () => ({ turnId: 501, resumeFromHead: true }),
    controlUserMessage: async () => {
      throw new Error('lifecycle control must not rerun while resuming a paused graph')
    },
    runUserMessage: async (
      _eventId,
      _turnId,
      _messageId,
      _content,
      _workspaceContext,
      _onChunk,
      _taskLifecycle,
      resumeFromHead
    ) => {
      receivedResumeFlag = resumeFromHead === true
      return { fullText: '', interrupted: false, paused: true }
    },
    createBackgroundPersonaStageTurn: async () => ({ turnId: 0 }),
    runBackgroundPersonaStage: async () => ({ fullText: '', interrupted: false }),
    consumeTaskNotification: async () => {
      throw new Error('not used')
    },
    applyEffects: async (result) => {
      appliedEffects.push(...result.effects)
    },
    completeTaskNotificationConsumption: async () => undefined,
    logUserMessageError: (error) => (error instanceof Error ? error.message : String(error))
  }

  const result = await orchestrateMainAgentEvent(event, dependencies)

  assert.equal(receivedResumeFlag, true)
  assert.equal(result.paused, true)
  assert.deepEqual(appliedEffects.map((effect) => effect.type), ['stream_paused'])
  assert.equal(appliedEffects.some((effect) => effect.type === 'commit_turn'), false)
})
