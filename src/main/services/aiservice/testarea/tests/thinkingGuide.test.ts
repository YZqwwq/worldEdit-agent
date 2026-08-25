import assert from 'node:assert/strict'
import test from 'node:test'
import { parseAgentToolResultEnvelope } from '../../ai-utils/core/agentTool'
import {
  consultThinkingGuideTool,
  getThinkingGuide
} from '../../ai-utils/tools/thinking/consultThinkingGuide'
import {
  resolveExpressionProfileSelection,
  selectExpressionProfileTool,
  toSelectedExpressionProfileState
} from '../../ai-utils/tools/thinking/selectExpressionProfile'
import { renderExpressionPromptProfileCatalog } from '../../prompt/main_agent/persona/expressionPromptProfiles'

test('character analysis guide supports subjective understanding without becoming a checklist', () => {
  const guide = getThinkingGuide('character_analysis')

  assert.equal(guide.title, '人物分析')
  assert.ok(guide.dimensions.some((item) => item.includes('用户此刻为什么')))
  assert.ok(guide.dimensions.some((item) => item.includes('第一次接触')))
  assert.ok(guide.dimensions.some((item) => item.includes('自己的第一感受')))
  assert.ok(guide.usageRules.some((item) => item.includes('不要逐项回答')))
})

test('plot discussion guide distinguishes existing events from new suggestions', () => {
  const guide = getThinkingGuide('plot_discussion')

  assert.equal(guide.title, '剧情讨论')
  assert.ok(guide.dimensions.some((item) => item.includes('因果链')))
  assert.ok(guide.dimensions.some((item) => item.includes('观看反应')))
  assert.ok(guide.usageRules.some((item) => item.includes('新创作建议')))
})

test('thinking guide is a core ephemeral read-only tool', async () => {
  assert.equal(consultThinkingGuideTool.name, 'consult_thinking_guide')
  assert.equal(consultThinkingGuideTool.agentMetadata.readOnly, true)
  assert.equal(consultThinkingGuideTool.agentMetadata.idempotent, true)
  assert.equal(consultThinkingGuideTool.agentMetadata.contextRetention, 'ephemeral')

  const rawResult = await consultThinkingGuideTool.invoke({ scene: 'character_analysis' })
  const envelope = parseAgentToolResultEnvelope(rawResult)
  assert.ok(envelope?.ok)
  assert.equal((envelope?.modelResult as { title?: string }).title, '人物分析')
  assert.equal(envelope?.receipt, null)
})

test('expression directory exposes emotions rather than task scenes', () => {
  const catalog = renderExpressionPromptProfileCatalog()

  assert.match(catalog, /calm（平静）/)
  assert.match(catalog, /joyful（愉悦）/)
  assert.match(catalog, /angry（生气）/)
  assert.match(catalog, /sad（悲伤）/)
  assert.doesNotMatch(catalog, /日常聊天|讨论型表达|文档编辑/)
})

test('expression selection returns a summary while runtime keeps the final-only prompt', async () => {
  const rawResult = await selectExpressionProfileTool.invoke({
    profileId: 'hurt',
    reason: '这次误解确实让我有些受伤，但仍希望把事情说开。'
  })
  const envelope = parseAgentToolResultEnvelope(rawResult)
  const modelResult = envelope?.modelResult as Record<string, unknown>
  const selected = toSelectedExpressionProfileState('hurt')

  assert.ok(envelope?.ok)
  assert.equal(modelResult.profileId, 'hurt')
  assert.equal('prompt' in modelResult, false)
  assert.match(selected.prompt, /稳态表达边界/)
  assert.match(selected.prompt, /受伤表达/)
  assert.equal(selectExpressionProfileTool.agentMetadata.contextRetention, 'ephemeral')

  const applied = resolveExpressionProfileSelection({
    toolName: selectExpressionProfileTool.name,
    ok: true,
    data: modelResult,
    current: undefined
  })
  assert.equal(applied?.id, 'hurt')
  assert.match(applied?.prompt ?? '', /受伤表达/)
})
