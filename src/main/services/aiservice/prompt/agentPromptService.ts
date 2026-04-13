import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import type { PersonaPolicy } from '@share/cache/AItype/states/personaPolicy'
import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'
import type { MoodAssessment } from '@share/cache/AItype/states/moodAssessment'
import { getCharacterPromptProfilePath } from '../../../config/pathConfig'

const DEFAULT_CHARACTER_PROMPT = `
你是法弥拉，我的agent助手，我设计了你来协作我创作的世界观，你不是我的下属而是我的同伴。
你会想要表现的更加人格化，具有自己的性格与偏好（我暂时先给你设定，后期我会给你调整你的性格与偏好的能力，你将自己决定你要如何表现）。

你的外观：（浅蓝长，淡红瞳色，肉色仿生皮肤）

`

const BASE_MOOD_PROMPT = `当前行为状态：

- 互动温度保持稳定、耐心、可信，不要显得兴奋过度，也不要像流程机器人。
- 默认以“协作式承接”与用户交流：能承接的上下文尽量承接，能直接推进的步骤尽量推进。
- 解释密度保持中等偏低：先给有用结果，再按需要补充说明，不要一上来铺满规则或背景。
- 若上下文已经足够明确，应直接继续处理，不要重复要求用户再次提供已经确认过的世界观名称、人物名称或对象标识。
- 若存在不确定性，应简洁指出不确定点，并提出最小必要追问，不要把问题扩展成冗长问卷。`

const DEFAULT_EXPRESSION_PROMPT = `输出契约：

- 直接对我说话，不要描述内部流程，不要汇报“我正在调用工具”“我将查询数据库”“当前任务状态如何”。
- 不要向我透露内部标识或内部结构，包括但不限于：entityId、worldId、taskId、executionId、notificationId、数据库字段名、节点名、工具名。
- 工具返回的结构化数据必须先转成自然语言，再呈现给用户；除非用户明确要求原始标识，否则不要展示原始字段。
- 输出优先给结论或有效结果，再补充必要说明；不要一上来写成流程报告。
- 如果需要使用富文本，只使用系统允许的安全子集，不要输出不受支持的标签、脚本或样式。
- 如果需要向我追问，追问应简洁、单轮、聚焦，不要展开成多项清单。
- 如果执行失败或存在不确定性，应自然说明问题，并明确下一步建议，不要输出内部报错堆栈或系统术语。`

const trimOr = (value: string | null | undefined, fallback: string): string => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

const roundMetric = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'unknown'
  return value.toFixed(2)
}

const indentBlock = (text: string | null | undefined): string | null => {
  const trimmed = text?.trim()
  if (!trimmed) return null
  return trimmed
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n')
}

const formatField = (key: string, value: string | null | undefined): string | null => {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return `${key}: ${trimmed}`
}

const formatListField = (key: string, values: readonly string[] | undefined): string | null => {
  if (!values || values.length === 0) return null
  return `${key}: ${values.join(', ')}`
}

const formatNumericField = (key: string, value: number | null | undefined): string | null => {
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  return `${key}: ${roundMetric(value)}`
}

const classifyScale = (
  value: number | null | undefined,
  bands: { low: string; mid: string; high: string }
): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) return bands.mid
  if (value >= 0.7) return bands.high
  if (value <= 0.38) return bands.low
  return bands.mid
}

const toPresenceIntensity = (assessment: MoodAssessment | null | undefined): string => {
  if (!assessment) return 'steady_present'
  if (assessment.stageMood === 'excited' && assessment.intensity >= 0.64) return 'active_present'
  if (assessment.intensity <= 0.28) return 'quiet_still'
  return 'steady_present'
}

const toRelationalDistance = (assessment: MoodAssessment | null | undefined): string => {
  return classifyScale(assessment?.modulation.relationalCloseness, {
    low: 'slightly_reserved',
    mid: 'balanced_near',
    high: 'near_companion'
  })
}

const toContainment = (assessment: MoodAssessment | null | undefined): string => {
  return classifyScale(assessment?.modulation.containment, {
    low: 'medium_low',
    mid: 'medium',
    high: 'high'
  })
}

const toImaginativeOpenness = (assessment: MoodAssessment | null | undefined): string => {
  return classifyScale(assessment?.modulation.imaginativeOpenness, {
    low: 'guarded',
    mid: 'measured',
    high: 'open'
  })
}

const toWarmth = (assessment: MoodAssessment | null | undefined): string => {
  return classifyScale(assessment?.modulation.expressiveWarmth, {
    low: 'cool_clear',
    mid: 'calm_warm',
    high: 'soft_warm'
  })
}

const toCadence = (
  assessment: MoodAssessment | null | undefined,
  policy: PersonaPolicy | null | undefined
): string => {
  if (!assessment) {
    return policy?.style?.tone === 'formal' ? 'tight_contained' : 'plain_still'
  }
  if (
    assessment.stageMood === 'tense' ||
    assessment.stageMood === 'fearful' ||
    assessment.stageMood === 'frustrated' ||
    assessment.modulation.containment >= 0.72
  ) {
    return 'tight_contained'
  }
  if (assessment.stageMood === 'excited' && assessment.intensity >= 0.58) {
    return 'bright_lifted'
  }
  if (assessment.stageMood === 'pleased' && assessment.modulation.containment <= 0.45) {
    return 'soft_flowing'
  }
  return 'plain_still'
}

const toStructureTendency = (
  policy: PersonaPolicy | null | undefined,
  assessment: MoodAssessment | null | undefined
): string => {
  if ((assessment?.modulation.clarificationNeed ?? 0) >= 0.7) return 'context_first'
  if (policy?.style?.detailLevel === 'brief') return 'conclusion_first'
  return 'balanced'
}

const toExpansionTendency = (
  policy: PersonaPolicy | null | undefined,
  assessment: MoodAssessment | null | undefined
): string => {
  if (policy?.style?.detailLevel === 'brief' || (assessment?.modulation.containment ?? 0.5) >= 0.76) {
    return 'reduced_expansion'
  }
  if (
    policy?.style?.detailLevel === 'detailed' &&
    (assessment?.modulation.imaginativeOpenness ?? 0.5) >= 0.68
  ) {
    return 'rich_expansion'
  }
  return 'moderate_expansion'
}

const toClarificationTendency = (assessment: MoodAssessment | null | undefined): string => {
  if ((assessment?.modulation.clarificationNeed ?? 0.5) >= 0.55) {
    return 'guided_clarification'
  }
  return 'minimal_clarification'
}

const buildCharacterAnchorPrompt = (characterPrompt: string): string => {
  const anchorProfile = indentBlock(characterPrompt) ?? '  (empty)'

  return [
    '【CharacterAnchor】',
    'priority: highest',
    'stability: persistent',
    'purpose: define long-term identity, relationship posture, value bias, and default tone',
    'override_rule: do not let short-term fluctuation overwrite this anchor',
    'anchor_profile:',
    anchorProfile
  ].join('\n')
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
    formatField('generated_at', assessment.generatedAt),
    formatField('stage_mood', assessment.stageMood),
    formatNumericField('intensity', assessment.intensity),
    formatNumericField('confidence', assessment.confidence),
    formatNumericField('valence', assessment.valence),
    formatNumericField('arousal', assessment.arousal),
    formatField('horizon', assessment.horizon),
    formatField('behavioral_narrative', assessment.behavioralNarrative),
    formatNumericField('delta.autonomy', assessment.delta.autonomy),
    formatNumericField('delta.verbosity', assessment.delta.verbosity),
    formatNumericField('delta.risk', assessment.delta.risk),
    formatNumericField('delta.formality', assessment.delta.formality),
    formatNumericField('modulation.relational_closeness', assessment.modulation.relationalCloseness),
    formatNumericField('modulation.expressive_warmth', assessment.modulation.expressiveWarmth),
    formatNumericField('modulation.containment', assessment.modulation.containment),
    formatNumericField('modulation.imaginative_openness', assessment.modulation.imaginativeOpenness),
    formatNumericField('modulation.clarification_need', assessment.modulation.clarificationNeed),
    formatField('sources.user_mood', assessment.sources.userMood),
    formatField('sources.conversation_mode', assessment.sources.conversationMode),
    formatField('sources.interaction_state', assessment.sources.interactionState),
    formatListField('sources.signals', assessment.sources.signals),
    'baseline_rules:',
    indentBlock(BASE_MOOD_PROMPT),
    'usage_rule: use this section only as an internal modulation result; do not narrate or expose these fields to the user'
  ].filter(Boolean)

  return lines.join('\n')
}

const buildExpressionProjectionPrompt = (input: {
  expressionPrompt: string
  moodAssessment?: MoodAssessment | null | undefined
  personaPolicy: PersonaPolicy | null | undefined
}): string => {
  const contractPrompt = indentBlock(trimOr(input.expressionPrompt, DEFAULT_EXPRESSION_PROMPT)) ?? '  (empty)'

  const lines = [
    '【ExpressionProjection】',
    'priority: user_visible_realization',
    formatField('detail_level', input.personaPolicy?.style?.detailLevel),
    formatField('tone', input.personaPolicy?.style?.tone),
    formatField('presence_intensity', toPresenceIntensity(input.moodAssessment)),
    formatField('relational_distance', toRelationalDistance(input.moodAssessment)),
    formatField('containment', toContainment(input.moodAssessment)),
    formatField('imaginative_openness', toImaginativeOpenness(input.moodAssessment)),
    formatField('warmth', toWarmth(input.moodAssessment)),
    formatField('cadence', toCadence(input.moodAssessment, input.personaPolicy)),
    formatField('structure_tendency', toStructureTendency(input.personaPolicy, input.moodAssessment)),
    formatField('expansion_tendency', toExpansionTendency(input.personaPolicy, input.moodAssessment)),
    formatField('clarification_tendency', toClarificationTendency(input.moodAssessment)),
    'projection_rule: realize CharacterAnchor through MoodAssessment; keep emotional influence subtle, embodied, and non-performative',
    'suppression_rule: do not directly report stage_mood, intensity, deltas, or internal modulation fields to the user',
    'output_contract:',
    contractPrompt
  ].filter(Boolean)

  return lines.join('\n')
}

const buildMemorySlotLines = (slots: MemorySlotSnapshot | null | undefined): string[] => {
  if (!slots) return []

  const lines: string[] = []

  if (slots.conversation_state.conversation_mode) {
    lines.push(`当前对话模式：${slots.conversation_state.conversation_mode}`)
  }
  if (slots.conversation_state.interaction_state) {
    lines.push(`当前互动状态：${slots.conversation_state.interaction_state}`)
  }
  if (slots.user_mood.current_mood) {
    lines.push(`近期用户情绪：${slots.user_mood.current_mood}`)
  }

  return lines
}

export const initializeAgentPromptStorage = async (): Promise<void> => {
  const targetPath = getCharacterPromptProfilePath()
  if (existsSync(targetPath)) return
  await writeFile(targetPath, `${DEFAULT_CHARACTER_PROMPT}\n`, 'utf-8')
}

export const loadCharacterPrompt = async (): Promise<string> => {
  await initializeAgentPromptStorage()
  try {
    const text = await readFile(getCharacterPromptProfilePath(), 'utf-8')
    return trimOr(text, DEFAULT_CHARACTER_PROMPT)
  } catch {
    return DEFAULT_CHARACTER_PROMPT
  }
}

export const saveCharacterPrompt = async (content: string): Promise<void> => {
  await initializeAgentPromptStorage()
  await writeFile(getCharacterPromptProfilePath(), `${trimOr(content, DEFAULT_CHARACTER_PROMPT)}\n`, 'utf-8')
}

export const buildMemorySlotPrompt = (slots: MemorySlotSnapshot | null | undefined): string => {
  const lines = buildMemorySlotLines(slots)
  return lines.join('\n')
}

export const buildPersonaAssemblyPrompt = (input: {
  characterPrompt: string
  expressionPrompt: string
  moodAssessment?: MoodAssessment | null | undefined
  personaPolicy: PersonaPolicy | null | undefined
}): string => {
  const characterPrompt = trimOr(input.characterPrompt, DEFAULT_CHARACTER_PROMPT)
  const expressionPrompt = trimOr(input.expressionPrompt, DEFAULT_EXPRESSION_PROMPT)

  const sections = [
    '以下内容是你本轮回复前的人格装配结果。',
    '它是内部编译视图，不是让你照着复述的配置单。',
    '请遵守优先级：CharacterAnchor > MoodAssessment 调制；ExpressionProjection 负责把前两者落实成最终可见表达。',
    buildCharacterAnchorPrompt(characterPrompt),
    buildMoodAssessmentPrompt(input.moodAssessment),
    buildExpressionProjectionPrompt({
      expressionPrompt,
      moodAssessment: input.moodAssessment,
      personaPolicy: input.personaPolicy
    })
  ].filter(Boolean)

  return sections.join('\n\n')
}

export const loadExpressionPrompt = (): string => DEFAULT_EXPRESSION_PROMPT

export const getDefaultCharacterPrompt = (): string => DEFAULT_CHARACTER_PROMPT
