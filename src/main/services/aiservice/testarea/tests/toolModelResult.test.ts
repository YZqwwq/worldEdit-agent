import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import {
  buildAgentToolModelMessage,
  defineAgentTool,
  parseAgentToolResultEnvelope
} from '../../ai-utils/core/agentTool'
import {
  extractDocumentSourceRefs,
  extractEntitySourceRefs
} from '../../agentrsystem/node/toolnode/toolContextSourceRefs'

test('entity results become compact tool evidence references', () => {
  const refs = extractEntitySourceRefs({
    entities: [
      {
        world: { id: 'world-1', name: '银月世界' },
        entity: {
          id: 'character-1',
          worldId: 'world-1',
          type: 'character',
          name: '艾琳'
        }
      },
      {
        id: 'nation-1',
        worldId: 'world-1',
        type: 'nation',
        name: '银月帝国'
      }
    ]
  })

  assert.deepEqual(refs, [
    {
      type: 'entity',
      id: 'character-1',
      title: '艾琳',
      entityType: 'character',
      worldId: 'world-1'
    },
    {
      type: 'entity',
      id: 'nation-1',
      title: '银月帝国',
      entityType: 'nation',
      worldId: 'world-1'
    }
  ])
})

test('character impression results expose an entity reference without inventing a world', () => {
  assert.deepEqual(
    extractEntitySourceRefs({
      impression: {
        characterEntityId: 'character-2',
        structuredText: '省略'
      }
    }),
    [
      {
        type: 'entity',
        id: 'character-2',
        title: undefined,
        entityType: 'character',
        worldId: undefined
      }
    ]
  )
})

test('character reading results infer the character type from the standard character field', () => {
  assert.deepEqual(
    extractEntitySourceRefs({
      character: { entityId: 'character-3', name: '洛兰', worldId: 'world-2' }
    }),
    [
      {
        type: 'entity',
        id: 'character-3',
        title: '洛兰',
        entityType: 'character',
        worldId: 'world-2'
      }
    ]
  )
})

test('document results retain document identity and revision for later model steps', () => {
  assert.deepEqual(
    extractDocumentSourceRefs({
      document: {
        id: 'document-1',
        worldId: 'world-1',
        title: '菲尔娜人物志',
        revision: 7,
        markdown: '正文省略'
      }
    }),
    [
      {
        type: 'document',
        id: 'document-1',
        title: '菲尔娜人物志',
        worldId: 'world-1',
        revision: 7
      }
    ]
  )
})

test('read-only tools expose the complete validated result to the next model call', async () => {
  const fullContent = Array.from({ length: 320 }, (_, index) => `段落-${index}-完整正文`).join('\n')
  const readTool = defineAgentTool({
    name: 'test_read_document',
    description: 'Test-only document reader.',
    inputSchema: z.object({}),
    outputSchema: z.object({ content: z.string(), revision: z.number().int() }),
    metadata: {
      description: { purpose: 'test', whenToUse: ['test'], inputSummary: 'none', outputSummary: 'test result' },
      display: { visibility: 'hidden' },
      execution: { level: 'safe', readOnly: true, idempotent: true, completionSemantics: 'definitive' },
      retention: { context: 'ephemeral' }
    },
    execute: () => ({ content: fullContent, revision: 68 })
  })

  const rawResult = await readTool.invoke({})
  const envelope = parseAgentToolResultEnvelope(rawResult)
  assert.ok(envelope)
  assert.deepEqual(envelope.modelResult, { content: fullContent, revision: 68 })

  const modelMessage = buildAgentToolModelMessage(readTool.name, envelope, rawResult)
  const parsedModelMessage = JSON.parse(modelMessage) as {
    result: { content: string; revision: number }
  }
  assert.equal(parsedModelMessage.result.content, fullContent)
  assert.equal(parsedModelMessage.result.revision, 68)
  assert.equal('message' in parsedModelMessage, false)
  assert.ok(modelMessage.length > fullContent.length)
})

test('write tools return a receipt projection instead of echoing a full write payload', async () => {
  const writeTool = defineAgentTool({
    name: 'test_write_document',
    description: 'Test-only document writer.',
    inputSchema: z.object({ content: z.string() }),
    outputSchema: z.object({ content: z.string(), revision: z.number().int() }),
    metadata: {
      description: { purpose: 'test', whenToUse: ['test'], inputSummary: 'none', outputSummary: 'test result' },
      display: { visibility: 'hidden' },
      execution: { level: 'notice', readOnly: false, idempotent: false, completionSemantics: 'definitive' },
      retention: { context: 'ephemeral' }
    },
    execute: ({ content }) => ({ content, revision: 69 }),
    buildReceipt: (data) => ({
      kind: 'document_updated',
      summary: `revision=${data.revision}`
    })
  })

  const fullContent = '不应回显的写入正文'.repeat(500)
  const rawResult = await writeTool.invoke({ content: fullContent })
  const envelope = parseAgentToolResultEnvelope(rawResult)
  assert.ok(envelope)
  assert.equal(JSON.stringify(envelope.modelResult).includes(fullContent), false)
  assert.equal(envelope.receipt?.kind, 'document_updated')
})

test('repeatable write tools can expose the authoritative state required by the next edit', async () => {
  const editTool = defineAgentTool({
    name: 'test_continue_document_edit',
    description: 'Test-only repeatable document editor.',
    inputSchema: z.object({ expectedRevision: z.number().int() }),
    outputSchema: z.object({
      documentId: z.string(),
      revision: z.number().int(),
      content: z.string()
    }),
    metadata: {
      description: { purpose: 'test', whenToUse: ['test'], inputSummary: 'none', outputSummary: 'test result' },
      display: { visibility: 'hidden' },
      execution: { level: 'notice', readOnly: false, idempotent: false, completionSemantics: 'definitive' },
      retention: { context: 'ephemeral' }
    },
    execute: ({ expectedRevision }) => ({
      documentId: 'document-a',
      revision: expectedRevision + 1,
      content: '不应进入下一轮模型上下文的完整正文'.repeat(200)
    }),
    buildReceipt: (data) => ({
      kind: 'document_locally_edited',
      summary: `revision=${data.revision}`
    }),
    buildModelResult: (data) => ({
      completed: { documentId: data.documentId },
      continuation: { expectedRevisionForNextWrite: data.revision }
    })
  })

  const rawResult = await editTool.invoke({ expectedRevision: 10 })
  const envelope = parseAgentToolResultEnvelope(rawResult)
  assert.ok(envelope)
  assert.deepEqual(envelope.modelResult, {
    completed: { documentId: 'document-a' },
    continuation: { expectedRevisionForNextWrite: 11 }
  })
  assert.equal(JSON.stringify(envelope.modelResult).includes('完整正文'), false)
})

test('usage rules and legal examples are visible in the model-facing tool description', () => {
  const describedTool = defineAgentTool({
    name: 'test_described_tool',
    description: 'Test-only described tool.',
    inputSchema: z.object({ entityId: z.string() }),
    outputSchema: z.object({ ok: z.boolean() }),
    metadata: {
      description: { purpose: 'test', whenToUse: ['需要读取测试实体'], inputSummary: '提供 entityId。', outputSummary: '返回测试结果。', usageContract: ['不要把参数对象序列化成字符串。'], examples: ['{"entityId":"entity-a"}'] },
      display: { visibility: 'hidden' },
      execution: { level: 'safe', readOnly: true, idempotent: true, completionSemantics: 'definitive' },
      retention: { context: 'ephemeral' }
    },
    execute: () => ({ ok: true })
  })

  assert.match(describedTool.description, /Rules:/)
  assert.match(describedTool.description, /不要把参数对象序列化成字符串/)
  assert.match(describedTool.description, /Examples:/)
  assert.match(describedTool.description, /entity-a/)
})

test('eventual tools expose a non-final accepted state until explicitly completed', async () => {
  const eventualTool = defineAgentTool({
    name: 'test_eventual_task',
    description: 'Test-only eventual task.',
    inputSchema: z.object({ state: z.enum(['accepted', 'running', 'completed']) }),
    outputSchema: z.object({ state: z.enum(['accepted', 'running', 'completed']) }),
    metadata: {
      description: { purpose: 'test', whenToUse: ['test'], inputSummary: 'state', outputSummary: 'task state' },
      display: { visibility: 'hidden' },
      execution: { level: 'notice', readOnly: false, idempotent: false, completionSemantics: 'eventual' },
      retention: { context: 'ephemeral' }
    },
    execute: ({ state }) => ({ state }),
    resolveCompletionState: ({ state }) => state
  })

  const accepted = parseAgentToolResultEnvelope(await eventualTool.invoke({ state: 'accepted' }))
  assert.equal(accepted?.ok, true)
  assert.deepEqual(accepted?.completion, {
    semantics: 'eventual',
    state: 'accepted',
    final: false
  })

  const completed = parseAgentToolResultEnvelope(await eventualTool.invoke({ state: 'completed' }))
  assert.deepEqual(completed?.completion, {
    semantics: 'eventual',
    state: 'completed',
    final: true
  })
})

test('eventual tools default to accepted rather than pretending to be complete', async () => {
  const eventualTool = defineAgentTool({
    name: 'test_default_eventual_task',
    description: 'Test-only eventual task with default state.',
    inputSchema: z.object({}),
    outputSchema: z.object({ taskId: z.string() }),
    metadata: {
      description: { purpose: 'test', whenToUse: ['test'], inputSummary: 'none', outputSummary: 'accepted task' },
      display: { visibility: 'hidden' },
      execution: { level: 'notice', readOnly: false, idempotent: false, completionSemantics: 'eventual' },
      retention: { context: 'ephemeral' }
    },
    execute: () => ({ taskId: 'task-a' })
  })

  const envelope = parseAgentToolResultEnvelope(await eventualTool.invoke({}))
  assert.equal(envelope?.completion.state, 'accepted')
  assert.equal(envelope?.completion.final, false)
})
