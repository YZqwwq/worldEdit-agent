import assert from 'node:assert/strict'
import test from 'node:test'
import type { StreamChunk } from '@share/cache/render/aiagent/aiContent'
import type {
  MainAgentEffect,
  MainAgentEventConsumptionResult,
  MainAgentBackgroundPersonaStageEvent,
  MainAgentUserMessageEvent
} from '@share/cache/AItype/states/taskLifecycleState'
import { createDefaultMemorySlots } from '../agentrsystem/manager/memory/memoryWritePolicy'
import {
  createFinalResponse,
  createTurnWorkspace,
  withDurableToolReceipt,
  withMemoryMessagesDraft,
  withSuccessfulToolUse
} from '../agentrsystem/state/turnWorkspace'
import {
  orchestrateMainAgentEvent,
  type MainAgentEventOrchestrationDependencies
} from '../runtime/orchestration/mainAgentEventOrchestration'
import { resolveWorkspaceProfile } from '../agentrsystem/workspaceProfileRegistry'

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
  const profile = resolveWorkspaceProfile(CURRENT_DOCUMENT_CONTEXT)

  assert.equal(profile?.id, 'document_editing')
  assert.deepEqual(profile?.autoToolsets, ['world_document_editor', 'agent_artifact'])
  assert.deepEqual(
    profile?.relatedToolsets.map((toolset) => toolset.id),
    ['world_read', 'character_narrative_reader']
  )
})

test('an interrupted turn commits its stable workspace and interruption boundary', async () => {
  const event = createScenarioEvent()
  const appliedEffects: MainAgentEffect[] = []
  const workspace = withDurableToolReceipt(
    withSuccessfulToolUse(
      createTurnWorkspace({
        eventId: event.id,
        turnId: 501,
        sessionId: event.sessionId,
        runId: 'run-interrupted',
        memorySlots: createDefaultMemorySlots(),
        persona: null
      }),
      'update_world_document'
    ),
    {
      toolCallId: 'call-update-document',
      toolName: 'update_world_document',
      operation: '更新世界观文档',
      subject: { type: 'document', id: 'doc-1' },
      completion: 'complete',
      completionState: 'completed',
      summary: '文档已更新。',
      retryable: false,
      evidenceRef: 'document:doc-1',
      payload: { revision: 9 },
      persistedAt: '2026-08-13T00:00:00.000Z'
    }
  )
  const dependencies: MainAgentEventOrchestrationDependencies = {
    createChatTurn: async () => ({ turnId: 501 }),
    controlUserMessage: async () => ({}),
    runUserMessage: async () => ({
      fullText: '已经展示的部分回复',
      interrupted: true,
      interruptedWorkspace: workspace,
      interruption: {
        reason: 'user_interrupted',
        interruptedAt: '2026-08-13T00:00:00.000Z',
        sourceVersionId: 9,
        resumePoint: 'toolContextReloadNode'
      }
    }),
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

  assert.equal(result.summary, 'user_message_interrupted')
  assert.deepEqual(
    appliedEffects.map((effect) => effect.type),
    ['commit_turn', 'stream_interrupted']
  )
  const commit = appliedEffects.find((effect) => effect.type === 'commit_turn')
  assert.equal(commit?.type, 'commit_turn')
  assert.equal(commit?.status, 'interrupted')
  assert.equal(commit?.finalResponse?.content, '已经展示的部分回复')
  assert.deepEqual(commit?.workspace, workspace)
  assert.equal(commit?.workspace?.draft.durableToolReceipts[0]?.payload?.revision, 9)
  assert.equal(commit?.interruption?.sourceVersionId, 9)
})

test('an interrupted background stage commits the same stable workspace boundary', async () => {
  const event: MainAgentBackgroundPersonaStageEvent = {
    id: 'event-background-interrupted',
    type: 'background_persona_stage',
    source: 'background_persona',
    sessionId: 'default',
    priority: 'idle',
    createdAt: Date.parse(CURRENT_DOCUMENT_CONTEXT.capturedAt),
    dedupeKey: 'background_persona_stage:task-1:stage-1',
    payload: {
      backgroundTaskId: 'task-1',
      stageId: 'stage-1',
      stageKind: 'reflection',
      title: '整理近期体验',
      resumePointer: 'stage-1',
      instruction: '整理当前阶段的稳定认识。',
      input: {}
    }
  }
  const workspace = createTurnWorkspace({
    eventId: event.id,
    turnId: 601,
    sessionId: event.sessionId,
    runId: 'run-background-interrupted',
    memorySlots: createDefaultMemorySlots(),
    persona: null
  })
  const appliedEffects: MainAgentEffect[] = []
  const dependencies: MainAgentEventOrchestrationDependencies = {
    createChatTurn: async () => ({ turnId: 0 }),
    controlUserMessage: async () => ({}),
    runUserMessage: async () => ({ fullText: '', interrupted: false }),
    createBackgroundPersonaStageTurn: async () => ({ turnId: 601 }),
    runBackgroundPersonaStage: async () => ({
      fullText: '已经形成的阶段认识',
      interrupted: true,
      interruptedWorkspace: workspace,
      interruption: {
        reason: 'user_interrupted',
        interruptedAt: '2026-08-13T00:00:00.000Z',
        sourceVersionId: 12,
        resumePoint: 'sceneNode'
      }
    }),
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
  const commit = appliedEffects.find((effect) => effect.type === 'commit_turn')

  assert.equal(result.summary, 'background_persona_stage_interrupted')
  assert.equal(commit?.type, 'commit_turn')
  assert.equal(commit?.status, 'interrupted')
  assert.deepEqual(commit?.workspace, workspace)
  assert.equal(commit?.interruption?.sourceVersionId, 12)
  assert.equal(commit?.observations?.[0]?.type, 'background_persona_stage_interrupted')
})
