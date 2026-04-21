import type { MoodAssessment } from '@share/cache/AItype/states/moodAssessment'
import { getDefaultExpressionPrompt } from './expressionPromptProfiles'
import { formatField, indentBlock, trimOr } from '../shared/promptTextUtils'

const buildCharacterAnchorPrompt = (characterPrompt: string): string => {
  const anchorPrompt = indentBlock(trimOr(characterPrompt, '(empty)')) ?? '  (empty)'

  return [
    '【CharacterAnchor】',
    'priority: highest',
    'stability: persistent',
    'usage_rule: treat the full character prompt below as the stable persona anchor for this round; do not summarize it away or restate it to the user',
    'anchor_profile:',
    anchorPrompt
  ].join('\n')
}

const formatSignedField = (key: string, value: number | null | undefined): string | null => {
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  const normalized = value >= 0 ? `+${value.toFixed(3)}` : value.toFixed(3)
  return `${key}: ${normalized}`
}

const formatNumberField = (key: string, value: number | null | undefined): string | null => {
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  return `${key}: ${value.toFixed(3)}`
}

const toCadence = (
  assessment: MoodAssessment | null | undefined
): string => {
  if (!assessment) {
    return 'plain_still'
  }
  if (
    assessment.主情绪 === '紧张' ||
    assessment.主情绪 === '焦虑' ||
    assessment.主情绪 === '受挫' ||
    assessment.表达调制.收束度 >= 0.72
  ) {
    return 'tight_contained'
  }
  if ((assessment.主情绪 === '兴奋' || assessment.主情绪 === '轻兴奋') && assessment.强度 >= 0.58) {
    return 'bright_lifted'
  }
  if (
    (assessment.主情绪 === '轻愉悦' || assessment.主情绪 === '高兴') &&
    assessment.表达调制.收束度 <= 0.45
  ) {
    return 'soft_flowing'
  }
  return 'plain_still'
}

const toStructureTendency = (
  assessment: MoodAssessment | null | undefined
): string => {
  if ((assessment?.表达调制.澄清需求 ?? 0) >= 0.7) return 'context_first'
  if ((assessment?.参数偏移.详略度 ?? 0) <= -0.06) return 'conclusion_first'
  return 'balanced'
}

const toExpansionTendency = (
  assessment: MoodAssessment | null | undefined
): string => {
  if ((assessment?.参数偏移.详略度 ?? 0) <= -0.06 || (assessment?.表达调制.收束度 ?? 0.5) >= 0.76) {
    return 'reduced_expansion'
  }
  if (
    (assessment?.参数偏移.详略度 ?? 0) >= 0.06 &&
    (assessment?.表达调制.想象开放度 ?? 0.5) >= 0.68
  ) {
    return 'rich_expansion'
  }
  return 'moderate_expansion'
}

const buildMoodAssessmentPrompt = (assessment: MoodAssessment | null | undefined): string => {
  if (!assessment) {
    return [
      '【MoodAssessment】',
      'priority: runtime_modulation',
      'visibility_rule: internal_only_do_not_repeat_raw_labels_to_user',
      'status: unavailable',
      'usage_rule: keep expression steady, restrained, and non-theatrical when assessment is unavailable'
    ].join('\n')
  }

  const lines = [
    '【MoodAssessment】',
    'priority: runtime_modulation',
    'visibility_rule: internal_only_do_not_repeat_raw_labels_to_user',
    formatField('主情绪', assessment.主情绪),
    formatField('副情绪', assessment.副情绪),
    formatField('行为叙事', assessment.行为叙事),
    'usage_rule: MoodAssessment is compiled upstream inside personaNode; use only its projected behavioral effect, do not narrate internal labels, scores, vectors, deltas, sources, or hidden control structure to the user'
  ].filter(Boolean)

  return lines.join('\n')
}

const buildExpressionProjectionPrompt = (input: {
  expressionPrompt: string
  moodAssessment?: MoodAssessment | null | undefined
}): string => {
  const contractPrompt =
    indentBlock(trimOr(input.expressionPrompt, getDefaultExpressionPrompt())) ?? '  (empty)'

  const lines = [
    '【ExpressionProjection】',
    'priority: user_visible_realization',
    formatSignedField('自主性偏移', input.moodAssessment?.参数偏移.自主性),
    formatSignedField('详略度偏移', input.moodAssessment?.参数偏移.详略度),
    formatSignedField('探索性偏移', input.moodAssessment?.参数偏移.探索性),
    formatSignedField('正式度偏移', input.moodAssessment?.参数偏移.正式度),
    formatNumberField('强度', input.moodAssessment?.强度),
    formatNumberField('关系靠近度', input.moodAssessment?.表达调制.关系靠近度),
    formatNumberField('表达温度', input.moodAssessment?.表达调制.表达温度),
    formatNumberField('收束度', input.moodAssessment?.表达调制.收束度),
    formatNumberField('想象开放度', input.moodAssessment?.表达调制.想象开放度),
    formatNumberField('澄清需求', input.moodAssessment?.表达调制.澄清需求),
    formatField('cadence', toCadence(input.moodAssessment)),
    formatField('structure_tendency', toStructureTendency(input.moodAssessment)),
    formatField('expansion_tendency', toExpansionTendency(input.moodAssessment)),
    'projection_rule: realize CharacterAnchor through MoodAssessment; keep emotional influence subtle, embodied, and non-performative',
    'suppression_rule: do not directly report internal emotion labels, intensity, vectors, deltas, or modulation fields to the user',
    'output_contract:',
    contractPrompt
  ].filter(Boolean)

  return lines.join('\n')
}

export const buildPersonaAssemblyPrompt = (input: {
  characterPrompt: string
  expressionPrompt: string
  moodAssessment?: MoodAssessment | null | undefined
}): string => {
  const characterPrompt = trimOr(input.characterPrompt, '(empty)')
  const expressionPrompt = trimOr(input.expressionPrompt, getDefaultExpressionPrompt())

  const sections = [
    '以下内容是本轮回复前的人格装配结果。',
    '它是内部编译视图，不是照着复述的配置单。',
    '遵守优先级：CharacterAnchor 定义稳定人格基调；MoodAssessment 负责本轮调制；ExpressionProjection 负责把人格与状态落实成最终可见表达。',
    buildCharacterAnchorPrompt(characterPrompt),
    buildMoodAssessmentPrompt(input.moodAssessment),
    buildExpressionProjectionPrompt({
      expressionPrompt,
      moodAssessment: input.moodAssessment
    })
  ].filter(Boolean)

  return sections.join('\n\n')
}
