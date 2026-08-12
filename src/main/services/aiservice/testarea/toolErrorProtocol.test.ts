import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import { AgentToolError, defineAgentTool, parseAgentToolResultEnvelope } from '../ai-utils/core/agentTool'

const createFailingTool = (name: string, execute: () => never) =>
  defineAgentTool({
    name,
    description: 'Test-only failing tool.',
    inputSchema: z.object({ value: z.string() }),
    outputSchema: z.object({ ok: z.boolean() }),
    metadata: {
      whenToUse: ['test'],
      inputSummary: 'value',
      outputSummary: 'never succeeds',
      readOnly: false
    },
    execute
  })

test('invalid tool output returns a non-retryable structured error', async () => {
  const tool = defineAgentTool({
    name: 'invalid_output_tool',
    description: 'Test-only invalid output tool.',
    inputSchema: z.object({}),
    outputSchema: z.object({ ok: z.literal(true) }),
    metadata: {
      whenToUse: ['test'],
      inputSummary: 'none',
      outputSummary: 'invalid test output',
      readOnly: true
    },
    execute: () => ({ ok: false }) as never
  })
  const envelope = parseAgentToolResultEnvelope(await tool.invoke({}))
  assert.equal(envelope?.ok, false)
  assert.equal(envelope?.error?.code, 'INVALID_TOOL_OUTPUT')
  assert.equal(envelope?.error?.retryable, false)
  assert.ok(Array.isArray(envelope?.error?.details?.issues))
})

test('AgentToolError preserves business code, retryability and recovery data', async () => {
  const tool = createFailingTool('not_found_tool', () => {
    throw new AgentToolError({
      code: 'NOT_FOUND',
      message: '目标文档不存在。',
      retryable: false,
      details: { documentId: 'missing-document' },
      nextSuggestions: ['重新查询文档目录。']
    })
  })
  const envelope = parseAgentToolResultEnvelope(await tool.invoke({ value: 'x' }))
  assert.equal(envelope?.error?.code, 'NOT_FOUND')
  assert.equal(envelope?.error?.retryable, false)
  assert.deepEqual(envelope?.error?.details, { documentId: 'missing-document' })
  assert.deepEqual(envelope?.nextSuggestions, ['重新查询文档目录。'])
})

test('document revision conflicts are normalized without domain coupling', async () => {
  class RevisionConflictError extends Error {
    readonly code = 'DOCUMENT_REVISION_CONFLICT'
    constructor(
      readonly documentId: string,
      readonly expectedRevision: number,
      readonly currentRevision: number
    ) {
      super('revision mismatch')
    }
  }

  const tool = createFailingTool('revision_conflict_tool', () => {
    throw new RevisionConflictError('document-a', 2, 3)
  })
  const envelope = parseAgentToolResultEnvelope(await tool.invoke({ value: 'x' }))
  assert.equal(envelope?.error?.code, 'REVISION_CONFLICT')
  assert.equal(envelope?.error?.retryable, true)
  assert.deepEqual(envelope?.error?.details, {
    documentId: 'document-a',
    expectedRevision: 2,
    currentRevision: 3
  })
})

test('unknown exceptions become non-retryable internal errors', async () => {
  const tool = createFailingTool('internal_error_tool', () => {
    throw new Error('unexpected failure')
  })
  const envelope = parseAgentToolResultEnvelope(await tool.invoke({ value: 'x' }))
  assert.equal(envelope?.error?.code, 'INTERNAL_ERROR')
  assert.equal(envelope?.error?.retryable, false)
})
