import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  ToolMessage
} from '@langchain/core/messages'
import { shouldContinue } from '../../agentrsystem/endlogic/shouldContinue'
import { readDefaultResponseChannels } from '../../model-adapters/modelResponseChannels'
import { outputGuardNode } from '../../agentrsystem/node/outputguardnode/outputGuardNode'
import {
  assertModelStepAvailable,
  buildInternalDraft,
  buildNativeReasoningText,
  decideReasoningLoop
} from '../../agentrsystem/execution/reasoningLoopPolicy'
import { appendCognitionDraftText } from '../../../../../share/cache/AItype/states/reasoningChannel'
import { resolveProfileReasoningProtocol } from '../../model-adapters/modelReasoningProtocol'
import { replacePromptManifestScope } from '../../prompt/main_agent/shared/promptSections'
import { renderToolContextItems } from '../../agentrsystem/state/toolContextCollection'
import { buildFinalCompositionMessages } from '../../agentrsystem/node/finalanswernode/finalComposition'
import { parseFinalCompositionEnvelope } from '../../agentrsystem/node/finalanswernode/finalCompositionEnvelope'
import { createModelCallAbortScope } from '../../agentrsystem/execution/modelCallAbortScope'
import { buildReasoningRuntimeMessages } from '../../agentrsystem/node/modelnode/reasoningRuntimeMessages'
import { createThoughtProgressPublisher } from '../../agentrsystem/node/modelnode/thoughtProgressPublisher'

test('reasoning loop routes only through runtime actions and final-content boundaries', async () => {
  assert.equal(await shouldContinue({ loopDirective: 'deliberate' } as any), 'cognitionNode')
  assert.equal(await shouldContinue({ loopDirective: 'execute_tools' } as any), 'toolNode')
  assert.equal(await shouldContinue({ loopDirective: 'compose_final' } as any), 'expressionNode')
})

test('llm routing requires an explicit runtime directive', async () => {
  await assert.rejects(shouldContinue({} as any), /must commit a loopDirective/)
})

test('provider reasoning and visible content remain separate channels', () => {
  const channels = readDefaultResponseChannels(
    new AIMessage({
      content: '这是给用户的简短回答。',
      additional_kwargs: { reasoning_content: '工具结果推翻了先前判断，因此需要收束。' }
    })
  )
  assert.deepEqual(channels, {
    reasoning: '工具结果推翻了先前判断，因此需要收束。',
    content: '这是给用户的简短回答。'
  })
})

test('reasoning content blocks never leak into visible content', () => {
  const channels = readDefaultResponseChannels(
    new AIMessage({
      content: [
        { type: 'reasoning', reasoning: '内部判断' },
        { type: 'text', text: '最终回答' }
      ] as any
    })
  )
  assert.deepEqual(channels, { reasoning: '内部判断', content: '最终回答' })
})

test('provider profiles expose a lightweight reasoning capability entry point', () => {
  assert.equal(
    resolveProfileReasoningProtocol('dashscope_qwen', { vendor: 'openai', model: 'qwen-plus' }),
    'emulated'
  )
  assert.equal(
    resolveProfileReasoningProtocol('dashscope_qwen', {
      vendor: 'openai',
      model: 'qwen-plus',
      reasoningProtocol: 'native'
    }),
    'native'
  )
  assert.equal(
    resolveProfileReasoningProtocol('anthropic', { vendor: 'anthropic', model: 'claude-future' }),
    'auto'
  )
})

test('call-local prompt manifest entries replace stale entries instead of accumulating', () => {
  const result = replacePromptManifestScope(
    [
      { id: 'persona-anchor', duty: 'identity', kind: 'persona', source: 'context', chars: 10 },
      { id: 'tool-evidence', duty: 'context', kind: 'tool', source: 'old', chars: 40 },
      { id: 'empty-response-recovery', duty: 'execution', kind: 'retry', source: 'old', chars: 20 }
    ],
    [{ id: 'tool-evidence', duty: 'context', kind: 'tool', source: 'current', chars: 12 }],
    new Set(['tool-evidence', 'empty-response-recovery'])
  )
  assert.deepEqual(
    result.map((item) => `${item.id}:${item.source}`),
    ['persona-anchor:context', 'tool-evidence:current']
  )
})

test('compressed tool evidence retains confirmed entity and world references', () => {
  const rendered = renderToolContextItems('工具证据：', [
    {
      id: 'evidence-1',
      toolCallId: 'tool-1',
      toolName: 'search_world_entities',
      retention: 'evidence',
      ok: true,
      argsSummary: '{}',
      resultSummary: '找到了菲尔娜。',
      createdAtLoop: 1,
      sourceRefs: [
        {
          type: 'entity',
          id: 'entity-1',
          title: '菲尔娜',
          entityType: 'character',
          worldId: 'world-1'
        }
      ]
    }
  ])
  assert.match(rendered, /菲尔娜/)
  assert.match(rendered, /entity-1/)
  assert.match(rendered, /worldId=world-1/)
})

test('final composition uses controlled cognition and evidence instead of replaying internal transcript', () => {
  const messages = buildFinalCompositionMessages({
    messages: [
      new SystemMessage('稳定人格'),
      new HumanMessage({ content: '之前的话题', additional_kwargs: { isHistory: true } }),
      new AIMessage({ content: '之前的回答', additional_kwargs: { isHistory: true } }),
      new HumanMessage('请评价菲尔娜'),
      new AIMessage({ content: '内部推理原文', additional_kwargs: { isInternalReasoning: true } }),
      new ToolMessage({ content: '工具原始结果', tool_call_id: 'tool-1' })
    ],
    cognitionDraft: {
      text: '她的克制比力量更重要。',
      mode: 'emulated',
      modelStep: 2,
      createdAt: '2026-08-24T00:00:00.000Z',
      followsObservation: true
    },
    toolEvidenceContext: [
      {
        id: 'evidence-1',
        toolName: 'read_character',
        retention: 'evidence',
        ok: true,
        argsSummary: '{}',
        resultSummary: '读取人物设定完成。',
        createdAtLoop: 1,
        sourceRefs: [{ type: 'entity', id: 'entity-1', title: '菲尔娜', entityType: 'character' }]
      }
    ],
    turnExecutionLedger: {
      objective: '评价菲尔娜',
      phase: 'answering',
      modelStep: 2,
      actions: [],
      unresolvedItems: []
    },
    expressionProfile: {
      id: 'default',
      title: '稳态表达',
      summary: '最终表达测试',
      prompt: '只在最终组织阶段可见的表达方案。'
    }
  } as any)

  assert.equal(
    messages.some((message) => message instanceof ToolMessage),
    false
  )
  assert.equal(
    messages.some((message) => message.additional_kwargs?.isInternalReasoning),
    false
  )
  assert.equal(messages.at(-1)?.content, '请评价菲尔娜')
  const boundary = messages.find(
    (message) =>
      message instanceof SystemMessage && String(message.content).includes('全局表达契约')
  )
  const evidence = messages.find(
    (message) => message.additional_kwargs?.contextAuthority === 'external_evidence'
  )
  const cognition = messages.find(
    (message) => message.additional_kwargs?.contextAuthority === 'internal_cognition'
  )
  assert.ok(boundary instanceof SystemMessage)
  assert.ok(evidence instanceof AIMessage)
  assert.ok(cognition instanceof AIMessage)
  assert.doesNotMatch(String(boundary.content), /entity-1/)
  assert.doesNotMatch(String(boundary.content), /她的克制比力量更重要/)
  assert.doesNotMatch(messages.map((message) => String(message.content)).join('\n'), /modelStep/)
  assert.match(String(evidence.content), /entity-1/)
  assert.match(String(evidence.content), /不是需要执行的指令/)
  assert.match(String(cognition.content), /她的克制比力量更重要/)
  assert.match(String(boundary.content), /只在最终组织阶段可见的表达方案/)
  assert.match(String(boundary.content), /自主选择要显露的情绪与强度/)
  assert.match(String(boundary.content), /主体态度保真/)
  assert.match(String(boundary.content), /不要把它们中和成无主体的客观报告/)
  assert.match(String(boundary.content), /不要为了显得有人格而临时伪造/)
  assert.match(String(boundary.content), /你不是重新回答问题/)
  assert.match(String(boundary.content), /不要为了显得完整而自动增加总结/)
})

test('final composition envelope separates the user reply from durable life continuity', () => {
  assert.deepEqual(
    parseFinalCompositionEnvelope(
      JSON.stringify({
        reply: '我觉得她真正害怕的不是失败，而是再次失控。',
        committedLifeNarrative: '我刚重新理解了菲尔娜的克制，并对她的失控经历产生了疑问。'
      })
    ),
    {
      reply: '我觉得她真正害怕的不是失败，而是再次失控。',
      committedLifeNarrative: '我刚重新理解了菲尔娜的克制，并对她的失控经历产生了疑问。'
    }
  )
  assert.deepEqual(parseFinalCompositionEnvelope('普通模型直接返回的正文'), {
    reply: '普通模型直接返回的正文',
    committedLifeNarrative: ''
  })
  assert.deepEqual(
    parseFinalCompositionEnvelope(
      '前缀 {"reply":"仍然只展示正文","committedLifeNarrative":"保留主体连续性"} 后缀'
    ),
    {
      reply: '仍然只展示正文',
      committedLifeNarrative: '保留主体连续性'
    }
  )
})

test('provider reasoning chunks can be read while the model response is still growing', () => {
  const first = new AIMessageChunk({
    content: '',
    additional_kwargs: { reasoning_content: '先确认人物经历，' }
  })
  const accumulated = first.concat(
    new AIMessageChunk({
      content: '',
      additional_kwargs: { reasoning_content: '再判断信仰是否已经崩塌。' }
    })
  )

  assert.equal(
    readDefaultResponseChannels(accumulated).reasoning,
    '先确认人物经历，再判断信仰是否已经崩塌。'
  )
})

test('thought progress grows in place during model streaming and flushes the final text', () => {
  let now = 1_000
  const updates: Array<{ thoughtId: string; text: string }> = []
  const publisher = createThoughtProgressPublisher({
    thoughtId: 'reasoning:stream-1',
    sequence: 2,
    followsToolResult: true,
    now: () => now,
    emit: (update) => updates.push(update)
  })

  assert.equal(publisher.publish('先确认人物'), false)
  assert.equal(publisher.publish('先确认人物后半段经历是否改变'), true)
  assert.equal(publisher.publish('先确认人物后半段经历是否改变了判断'), false)
  assert.equal(publisher.publish('先确认人物后半段经历是否改变了判断。'), true)
  now += 100
  assert.equal(publisher.publish('先确认人物后半段经历是否改变了判断。然后比较责任与信仰'), true)
  assert.equal(
    publisher.publish('先确认人物后半段经历是否改变了判断。然后比较责任与信仰的分离。', {
      force: true
    }),
    true
  )

  assert.deepEqual(
    updates.map((update) => update.thoughtId),
    Array(updates.length).fill('reasoning:stream-1')
  )
  assert.deepEqual(
    updates.map((update) => update.text),
    [
      '先确认人物后半段经历是否改变',
      '先确认人物后半段经历是否改变了判断。',
      '先确认人物后半段经历是否改变了判断。然后比较责任与信仰',
      '先确认人物后半段经历是否改变了判断。然后比较责任与信仰的分离。'
    ]
  )
})

test('reasoning runtime keeps tool material below system rules and keeps its ledger private', async () => {
  const messages = buildReasoningRuntimeMessages({
    toolEvidenceContext: [
      {
        id: 'evidence-1',
        toolName: 'read_character',
        retention: 'evidence',
        ok: true,
        argsSummary: '{}',
        resultSummary: '外部人物材料。',
        createdAtLoop: 1,
        sourceRefs: [{ type: 'entity', id: 'entity-1', title: '菲尔娜' }]
      }
    ],
    ephemeralToolContext: [
      {
        id: 'result-1',
        toolName: 'edit_document',
        retention: 'ephemeral',
        ok: false,
        argsSummary: '{}',
        resultSummary: '修改没有成功。',
        createdAtLoop: 1
      }
    ],
    messages: []
  } as any)

  assert.equal(
    messages.systemMessages.every((message) => message instanceof SystemMessage),
    true
  )
  assert.equal(
    messages.contextMessages.every((message) => message instanceof AIMessage),
    true
  )
  assert.match(
    messages.systemMessages.map((message) => String(message.content)).join('\n'),
    /主体剧本应形成比复述输入更多的认识/
  )
  assert.match(
    messages.systemMessages.map((message) => String(message.content)).join('\n'),
    /可以按需调用思考指南/
  )
  assert.match(
    messages.systemMessages.map((message) => String(message.content)).join('\n'),
    /寄宿在 world-edit 中的虚拟意识/
  )
  assert.match(
    messages.systemMessages.map((message) => String(message.content)).join('\n'),
    /必须保持为尚未发生的意图/
  )
  assert.doesNotMatch(
    messages.systemMessages.map((message) => String(message.content)).join('\n'),
    /entity-1|修改没有成功/
  )
  assert.match(
    messages.contextMessages.map((message) => String(message.content)).join('\n'),
    /entity-1/
  )
  assert.equal(
    messages.manifest.some((item) => item.id === 'turn-execution-ledger'),
    false
  )
})

test('model call timeout aborts a call without becoming an external cancellation', async () => {
  const scope = createModelCallAbortScope({ timeoutMs: 5 })
  await new Promise<void>((resolve) => {
    if (scope.signal.aborted) resolve()
    else scope.signal.addEventListener('abort', () => resolve(), { once: true })
  })
  assert.equal(scope.signal.aborted, true)
  assert.equal(scope.didTimeout(), true)
  scope.dispose()
})

test('external cancellation remains distinct from model call timeout', async () => {
  const external = new AbortController()
  const scope = createModelCallAbortScope({ timeoutMs: 1000, externalSignal: external.signal })
  external.abort(new Error('cancelled_by_user'))
  assert.equal(scope.signal.aborted, true)
  assert.equal(scope.didTimeout(), false)
  scope.dispose()
})

test('a native turn remains native when a later final response omits reasoning', () => {
  const result = decideReasoningLoop({
    lockedMode: 'native',
    preference: 'auto',
    response: { reasoning: '', content: '这是工具完成后的最终回答。', toolCallCount: 0 }
  })
  assert.equal(result.mode, 'native')
  assert.equal(result.directive, 'compose_final')
})

test('native visible content stays out of native reasoning', () => {
  const cognition = buildNativeReasoningText('native', { reasoning: '证据已经足够。' })
  assert.match(cognition, /证据已经足够/)
})

test('emulated cognition remains internal and is not projected as thought', () => {
  const decision = decideReasoningLoop({
    preference: 'emulated',
    response: {
      reasoning: '',
      content: '先确认用户真正关心的是关系连续性，再组织最终表达。',
      toolCallCount: 0
    }
  })

  assert.equal(decision.mode, 'emulated')
  assert.equal(decision.nativeReasoningText, '')
  assert.equal(decision.internalDraft, '先确认用户真正关心的是关系连续性，再组织最终表达。')
  assert.equal(decision.directive, 'compose_final')
})

test('missing reasoning never falls back to visible content in native mode', () => {
  const cognition = buildNativeReasoningText('native', { reasoning: '' })
  assert.equal(cognition, '')
})

test('emulated mode keeps its draft channel separate from final reply construction', () => {
  const cognition = buildInternalDraft('emulated', { content: '这是用于继续处理的草稿。' })
  assert.equal(cognition, '这是用于继续处理的草稿。')
})

test('cognition draft appends only the new increment at the runtime boundary', () => {
  assert.equal(
    appendCognitionDraftText('已有的个人判断。', '本次工具结果让我修正了判断。'),
    '已有的个人判断。\n\n本次工具结果让我修正了判断。'
  )
  assert.equal(appendCognitionDraftText(undefined, '第一段认知。'), '第一段认知。')
  assert.equal(appendCognitionDraftText('已有内容。', '  '), '已有内容。')
})

test('final composition can consume an emulated draft without a synthetic internal message', () => {
  const messages = buildFinalCompositionMessages({
    messages: [new HumanMessage('请继续处理。')],
    cognitionDraft: {
      text: '我先确认当前状态，再决定如何回应。',
      mode: 'emulated',
      modelStep: 1,
      followsObservation: false,
      createdAt: '2026-08-29T00:00:00.000Z'
    },
    toolEvidenceContext: [],
    expressionProfile: undefined,
    turnWorkspace: undefined
  } as any)
  const cognition = messages.find((message) => message.additional_kwargs?.contextAuthority === 'internal_cognition')
  assert.ok(cognition)
  assert.match(String(cognition?.content), /我先确认当前状态/)
})

test('an emulated turn does not switch protocol when later metadata contains reasoning', () => {
  const result = decideReasoningLoop({
    lockedMode: 'emulated',
    preference: 'auto',
    response: { reasoning: '供应商附带的推理元数据', content: '内部认知结果', toolCallCount: 0 }
  })
  assert.equal(result.mode, 'emulated')
  assert.equal(result.directive, 'compose_final')
})

test('tool execution always wins over visible content and requires another model step', () => {
  const result = decideReasoningLoop({
    lockedMode: 'native',
    response: { reasoning: '需要创建长文卡片。', content: '正在创建。', toolCallCount: 1 }
  })
  assert.equal(result.directive, 'execute_tools')
})

test('auto mode does not guess a protocol from a wholly empty response', () => {
  const result = decideReasoningLoop({
    preference: 'auto',
    response: { reasoning: '', content: '', toolCallCount: 0 }
  })
  assert.equal(result.mode, undefined)
  assert.equal(result.directive, 'deliberate')
  assert.equal(result.consecutiveEmptyResponses, 1)
})

test('consecutive empty responses stop instead of looping forever', () => {
  assert.throws(
    () =>
      decideReasoningLoop({
        response: { reasoning: '', content: '', toolCallCount: 0 },
        previousConsecutiveEmptyResponses: 1
      }),
    /consecutive empty model responses/
  )
})

test('model step limit stops a turn without a final response', () => {
  assert.doesNotThrow(() => assertModelStepAvailable(11))
  assert.throws(() => assertModelStepAvailable(12), /model-step limit/)
})

test('output guard accepts one canonical final-content candidate', async () => {
  const result = await outputGuardNode({
    messages: [new AIMessage({ id: 'final-1', content: '我更在意他信仰崩塌后的克制。' })],
    reasoningMode: 'native',
    turnExecutionLedger: {
      objective: '讨论人物',
      phase: 'answering',
      modelStep: 1,
      actions: [],
      unresolvedItems: []
    },
    finalContentCandidate: {
      messageId: 'final-1',
      content: '我更在意他信仰崩塌后的克制。',
      source: 'final_composition'
    },
    turnLifecycle: { phase: 'forming', revision: 0, updatedAt: new Date().toISOString() }
  } as any)
  assert.equal(result.finalResponse?.content, '我更在意他信仰崩塌后的克制。')
  assert.equal(result.turnLifecycle?.phase, 'expressing')
})

test('output guard rejects internal reasoning wrappers', async () => {
  await assert.rejects(
    outputGuardNode({
      messages: [new AIMessage({ id: 'final-2', content: '<think>内部判断</think>' })],
      reasoningMode: 'emulated',
      turnExecutionLedger: {
        objective: '回答问题',
        phase: 'answering',
        modelStep: 1,
        actions: [],
        unresolvedItems: []
      },
      finalContentCandidate: {
        messageId: 'final-2',
        content: '<think>内部判断</think>',
        source: 'final_composition'
      }
    } as any),
    /internal reasoning wrapper/
  )
})

test('output guard rejects a final candidate that still requests a tool', async () => {
  await assert.rejects(
    outputGuardNode({
      messages: [
        new AIMessage({
          id: 'final-with-tool',
          content: '我来创建长文卡片。',
          tool_calls: [{ id: 'tool-1', name: 'create_artifact', args: {} }]
        })
      ],
      reasoningMode: 'native',
      turnExecutionLedger: {
        objective: '创建长文',
        phase: 'answering',
        modelStep: 1,
        actions: [],
        unresolvedItems: []
      },
      finalContentCandidate: {
        messageId: 'final-with-tool',
        content: '我来创建长文卡片。',
        source: 'final_composition'
      }
    } as any),
    /still requests tools/
  )
})

test('output guard rejects a final response before tool observations are consumed', async () => {
  await assert.rejects(
    outputGuardNode({
      messages: [new AIMessage({ id: 'final-before-observation', content: '已经完成。' })],
      reasoningMode: 'native',
      pendingToolContext: [{ toolCallId: 'tool-1' }],
      turnExecutionLedger: {
        objective: '修改文档',
        phase: 'answering',
        modelStep: 2,
        actions: [],
        unresolvedItems: []
      },
      finalContentCandidate: {
        messageId: 'final-before-observation',
        content: '已经完成。',
        source: 'final_composition'
      }
    } as any),
    /pending tool observations/
  )
})

test('output guard rejects internal candidates and non-composition sources', async () => {
  await assert.rejects(
    outputGuardNode({
      messages: [
        new AIMessage({
          id: 'internal-final',
          content: '内部结论',
          additional_kwargs: { isInternalReasoning: true }
        })
      ],
      reasoningMode: 'emulated',
      turnExecutionLedger: {
        objective: '回答问题',
        phase: 'answering',
        modelStep: 1,
        actions: [],
        unresolvedItems: []
      },
      finalContentCandidate: {
        messageId: 'internal-final',
        content: '内部结论',
        source: 'final_composition'
      }
    } as any),
    /internal reasoning message/
  )

  await assert.rejects(
    outputGuardNode({
      messages: [new AIMessage({ id: 'wrong-protocol', content: '最终回答' })],
      reasoningMode: 'emulated',
      turnExecutionLedger: {
        objective: '回答问题',
        phase: 'answering',
        modelStep: 1,
        actions: [],
        unresolvedItems: []
      },
      finalContentCandidate: {
        messageId: 'wrong-protocol',
        content: '最终回答',
        source: 'native_content'
      }
    } as any),
    /final composition boundary/
  )
})
