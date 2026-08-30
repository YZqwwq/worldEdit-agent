import assert from 'node:assert/strict'
import test from 'node:test'
import { z } from 'zod'
import { defineAgentTool } from '../../ai-utils/core/agentTool'
import { buildToolUsageSystemPrompt } from '../../ai-utils/core/toolUsagePrompt'
import type { AgentToolRegistryEntry, ToolsetRegistryEntry } from '../../ai-utils/toolkits/toolRegistryTypes'
import {
  isToolCallLimitReached,
  getAgentToolPhases,
  isToolAvailableInPhase,
  listEntriesForPhase,
  isToolVisible,
  incrementToolTurnCallCount,
  toToolMap,
  validateToolRegistry
} from '../../ai-utils/toolkits/toolRegistryTypes'

const toolsets: ToolsetRegistryEntry[] = [
  {
    id: 'test_tools',
    title: 'Test tools',
    summary: 'Registry validation fixtures.',
    tags: ['test'],
    activationHints: ['test'],
    whenToUse: ['test']
  }
]

const createTool = (name: string, readOnly = true) =>
  defineAgentTool({
    name,
    description: 'Test-only registry tool.',
    inputSchema: z.object({}),
    outputSchema: z.object({ ok: z.boolean() }),
    metadata: {
      description: { purpose: 'test', whenToUse: ['test'], inputSummary: 'none', outputSummary: 'test result' },
      display: { visibility: 'hidden' },
      execution: { level: 'safe', readOnly, idempotent: readOnly, completionSemantics: 'definitive' },
      retention: { context: 'ephemeral' }
    },
    execute: () => ({ ok: true })
  })

const createEntry = (
  name: string,
  overrides: Partial<AgentToolRegistryEntry> = {}
): AgentToolRegistryEntry => {
  const tool = overrides.tool ?? createTool(name, overrides.access !== 'write')
  return {
    key: name,
    tool,
    toolsetId: 'test_tools',
    category: 'test',
    capabilityLayer: 'core',
    capabilityGroup: 'Test',
    capabilitySummary: 'Test registry entry.',
    audience: 'main_agent',
    access: 'read',
    activationMode: 'always',
    enabled: true,
    ...overrides
  }
}

test('a coherent registry passes startup validation', () => {
  assert.doesNotThrow(() =>
    validateToolRegistry({
      registryName: 'test registry',
      entries: [createEntry('read_test_tool')],
      toolsets,
      allowedAudiences: ['main_agent', 'shared']
    })
  )
})

test('registry validation rejects duplicate names and unknown toolsets', () => {
  const first = createEntry('duplicate_tool')
  const second = createEntry('duplicate_tool', { toolsetId: 'missing_tools' })
  assert.throws(
    () =>
      validateToolRegistry({
        registryName: 'test registry',
        entries: [first, second],
        toolsets,
        allowedAudiences: ['main_agent']
      }),
    /Duplicate registry key[\s\S]*Duplicate tool name[\s\S]*unknown toolset/
  )
  assert.throws(() => toToolMap([first, second]), /Duplicate tool name/)
})

test('registry validation rejects access and metadata disagreement', () => {
  assert.throws(
    () =>
      validateToolRegistry({
        registryName: 'test registry',
        entries: [
          createEntry('misdeclared_read_tool', {
            tool: createTool('misdeclared_read_tool', false),
            access: 'read'
          })
        ],
        toolsets,
        allowedAudiences: ['main_agent']
      }),
    /readOnly=true/
  )
})

test('confirmation-required tools must be limited to one call per turn', () => {
  const confirmationTool = defineAgentTool({
    name: 'delete_test_tool',
    description: 'Test-only irreversible tool.',
    inputSchema: z.object({}),
    outputSchema: z.object({ ok: z.boolean() }),
    metadata: {
      description: { purpose: 'test', whenToUse: ['test'], inputSummary: 'none', outputSummary: 'test result' },
      display: { visibility: 'hidden' },
       execution: { level: 'confirmation_required', readOnly: false, idempotent: false, completionSemantics: 'definitive' },
      retention: { context: 'ephemeral' }
    },
    execute: () => ({ ok: true })
  })
  const entry = createEntry('delete_test_tool', {
    tool: confirmationTool,
    access: 'write'
  })

  assert.throws(
    () =>
      validateToolRegistry({
        registryName: 'test registry',
        entries: [entry],
        toolsets,
        allowedAudiences: ['main_agent']
      }),
    /turnCallLimit=1/
  )
  assert.doesNotThrow(() =>
    validateToolRegistry({
      registryName: 'test registry',
      entries: [{ ...entry, turnCallLimit: 1 }],
      toolsets,
      allowedAudiences: ['main_agent']
    })
  )
})

test('task-context tools cannot be exposed by manual or quick activation', () => {
  const entry = createEntry('task_only_tool', {
    activationMode: 'task_context',
    taskContext: {
      match: 'available_capability',
      executorKinds: ['character_editor']
    }
  })

  assert.equal(
    isToolVisible(entry, {
      activeTools: [entry.tool.name],
      quickTools: [entry.tool.name]
    }),
    false
  )
  assert.equal(
    isToolVisible(entry, {
      taskLifecycle: {
        capability: {
          executorKind: 'character_editor',
          requiredToolName: entry.tool.name,
          available: true,
          message: 'available'
        }
      }
    }),
    true
  )
})

test('task-context registry entries must declare an activation requirement', () => {
  assert.throws(
    () =>
      validateToolRegistry({
        registryName: 'test registry',
        entries: [
          createEntry('invalid_task_tool', {
            activationMode: 'task_context'
          })
        ],
        toolsets,
        allowedAudiences: ['main_agent']
      }),
    /must declare taskContext requirements/
  )
})

test('active-task tools enforce task status requirements', () => {
  const entry = createEntry('continue_task_tool', {
    activationMode: 'task_context',
    taskContext: {
      match: 'active_task',
      taskStatuses: ['awaiting_user_input']
    }
  })
  const activeTask = {
    id: 1,
    title: 'test',
    goal: 'test',
    summary: 'test',
    executorKind: 'character_editor' as const
  }

  assert.equal(
    isToolVisible(entry, {
      taskLifecycle: { activeTask: { ...activeTask, status: 'running' } }
    }),
    false
  )
  assert.equal(
    isToolVisible(entry, {
      taskLifecycle: { activeTask: { ...activeTask, status: 'awaiting_user_input' } }
    }),
    true
  )
})

test('arbitrary turn call limits allow calls below the limit and hide the next call', () => {
  const entry = createEntry('twice_per_turn_tool', { turnCallLimit: 2 })
  const afterFirst = incrementToolTurnCallCount(entry, {})
  assert.equal(isToolCallLimitReached(entry, { toolCallCounts: afterFirst }), false)
  assert.equal(isToolVisible(entry, { toolCallCounts: afterFirst }), true)

  const afterSecond = incrementToolTurnCallCount(entry, afterFirst)
  assert.equal(isToolCallLimitReached(entry, { toolCallCounts: afterSecond }), true)
  assert.equal(isToolVisible(entry, { toolCallCounts: afterSecond }), false)
})

test('tool routing defaults to cognition and supports explicit expression filtering', () => {
  const defaultEntry = createEntry('default_phase_tool')
  const expressionEntry = createEntry('expression_phase_tool', {
    tool: defineAgentTool({
      name: 'expression_phase_tool',
      description: 'Expression fixture.',
      inputSchema: z.object({}),
      outputSchema: z.object({ ok: z.boolean() }),
      metadata: {
        description: { purpose: 'test', inputSummary: 'none', outputSummary: 'test result' },
        display: { visibility: 'hidden' },
        execution: { level: 'safe', readOnly: true, idempotent: true, completionSemantics: 'definitive' },
        retention: { context: 'ephemeral' },
        routing: { phases: ['expression'] }
      },
      execute: () => ({ ok: true })
    })
  })

  assert.deepEqual(getAgentToolPhases(defaultEntry.tool), ['cognition'])
  assert.deepEqual(getAgentToolPhases(expressionEntry.tool), ['expression'])
  assert.equal(isToolAvailableInPhase(defaultEntry, 'cognition'), true)
  assert.equal(isToolAvailableInPhase(defaultEntry, 'expression'), false)
  assert.deepEqual(listEntriesForPhase([defaultEntry, expressionEntry], 'cognition'), [defaultEntry])
  assert.deepEqual(listEntriesForPhase([defaultEntry, expressionEntry], 'expression'), [expressionEntry])
})

test('agent tool projections omit internal execution and output metadata', () => {
  const entry = createEntry('projection_tool', {
    tool: defineAgentTool({
      name: 'projection_tool',
      description: 'Legacy verbose description should not be the primary projection.',
      inputSchema: z.object({ query: z.string() }),
      outputSchema: z.object({ secret: z.string() }),
      metadata: {
        description: {
          purpose: '按语义查询资料。',
          whenToUse: ['需要确认资料时'],
          inputSummary: '提供自然语言 query。',
          outputSummary: '内部结果。',
          usageContract: ['内部契约不应进入模型描述。'],
          modelConstraints: ['不要猜测目标。'],
          examples: ['{"query":"x"}']
        },
        display: { visibility: 'visible' },
        execution: { level: 'confirmation_required', readOnly: false, idempotent: false, completionSemantics: 'eventual' },
        retention: { context: 'evidence' }
      },
      execute: () => ({ secret: 'ok' })
    })
  })

  assert.match(entry.tool.description, /按语义查询资料。/)
  assert.match(entry.tool.description, /提供自然语言 query。/)
  assert.match(entry.tool.description, /不要猜测目标。/)
  assert.doesNotMatch(entry.tool.description, /内部结果|内部契约|confirmation_required|evidence|Examples|Output/)

  const prompt = buildToolUsageSystemPrompt([entry], { quickToolsets: ['test_tools'] }, toolsets)
  assert.ok(prompt)
  assert.doesNotMatch(prompt!, /projection_tool|输出：|类别：|面向：|结果保留|执行等级/)
  assert.match(prompt!, /常用工具集目录/)
})
