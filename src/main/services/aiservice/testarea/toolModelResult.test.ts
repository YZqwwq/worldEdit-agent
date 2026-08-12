import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import {
  buildAgentToolModelMessage,
  defineAgentTool,
  parseAgentToolResultEnvelope
} from '../ai-utils/core/agentTool'

test('read-only tools expose the complete validated result to the next model call', async () => {
  const fullContent = Array.from({ length: 320 }, (_, index) => `段落-${index}-完整正文`).join('\n')
  const readTool = defineAgentTool({
    name: 'test_read_document',
    description: 'Test-only document reader.',
    inputSchema: z.object({}),
    outputSchema: z.object({ content: z.string(), revision: z.number().int() }),
    metadata: {
      whenToUse: ['test'],
      inputSummary: 'none',
      outputSummary: 'full test content',
      readOnly: true,
      idempotent: true
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
      whenToUse: ['test'],
      inputSummary: 'content',
      outputSummary: 'write receipt',
      readOnly: false,
      idempotent: false
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

test('usage rules and legal examples are visible in the model-facing tool description', () => {
  const describedTool = defineAgentTool({
    name: 'test_described_tool',
    description: 'Test-only described tool.',
    inputSchema: z.object({ entityId: z.string() }),
    outputSchema: z.object({ ok: z.boolean() }),
    metadata: {
      whenToUse: ['需要读取测试实体'],
      inputSummary: '提供扁平的 entityId。',
      outputSummary: '返回测试结果。',
      usageContract: ['不要把参数对象序列化成字符串。'],
      examples: ['{"entityId":"entity-a"}'],
      readOnly: true,
      idempotent: true
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
      whenToUse: ['test'],
      inputSummary: 'state',
      outputSummary: 'task state',
      readOnly: false,
      completionSemantics: 'eventual'
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
      whenToUse: ['test'],
      inputSummary: 'none',
      outputSummary: 'accepted task',
      readOnly: false,
      completionSemantics: 'eventual'
    },
    execute: () => ({ taskId: 'task-a' })
  })

  const envelope = parseAgentToolResultEnvelope(await eventualTool.invoke({}))
  assert.equal(envelope?.completion.state, 'accepted')
  assert.equal(envelope?.completion.final, false)
})
