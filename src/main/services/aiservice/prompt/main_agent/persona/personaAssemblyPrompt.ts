import type { MoodAssessment } from '@share/cache/AItype/states/moodAssessment'
import type { PersonaMetrics } from '@share/cache/AItype/states/personalState'
import {
  getDefaultExpressionPrompt,
  GLOBAL_EXPRESSION_CONTRACT
} from './expressionPromptProfiles'
import { formatField, indentBlock, trimOr } from '../shared/promptTextUtils'

const buildCharacterAnchorPrompt = (characterPrompt: string): string => {
  const anchorPrompt = indentBlock(trimOr(characterPrompt, '(empty)')) ?? '  (empty)'

  return [
    '【CharacterAnchor】',
    'priority: highest',
    'stability: persistent',
    'anchor_profile:',
    anchorPrompt
  ].join('\n')
}

const toCadence = (assessment: MoodAssessment | null | undefined): string => {
  if (!assessment) {
    return 'plain_still'
  }
  if (
    assessment.primaryEmotion === 'tension' ||
    assessment.primaryEmotion === 'stress' ||
    assessment.primaryEmotion === 'frustration' ||
    assessment.expressionModulation.contraction >= 0.72
  ) {
    return 'tight_contained'
  }
  if (
    (assessment.primaryEmotion === 'joy' || assessment.primaryEmotion === 'interest') &&
    assessment.intensity >= 0.58
  ) {
    return 'bright_lifted'
  }
  if (assessment.primaryEmotion === 'joy' && assessment.expressionModulation.contraction <= 0.64) {
    return 'soft_flowing'
  }
  return 'plain_still'
}

const toStructureTendency = (assessment: MoodAssessment | null | undefined): string => {
  if ((assessment?.expressionModulation.contextFirstTendency ?? 0) >= 0.7) return 'context_first'
  return 'balanced'
}

const toExpansionTendency = (
  assessment: MoodAssessment | null | undefined,
  metrics: PersonaMetrics | null | undefined
): string => {
  if (
    (metrics?.verbosity_index ?? 0.5) <= 0.38 ||
    (assessment?.expressionModulation.contraction ?? 0.5) >= 0.76
  ) {
    return 'reduced_expansion'
  }
  if (
    (metrics?.verbosity_index ?? 0.5) >= 0.64 &&
    (assessment?.expressionModulation.imaginativeOpenness ?? 0.5) >= 0.68
  ) {
    return 'rich_expansion'
  }
  return 'moderate_expansion'
}

const buildExpressionDirections = (
  assessment: MoodAssessment | null | undefined,
  metrics: PersonaMetrics | null | undefined
): string[] => {
  if (!assessment) {
    const stableDirections = ['保持稳定、自然的表达，不额外表演情绪。']
    if ((metrics?.formality_score ?? 0.5) >= 0.65) {
      stableDirections.push('表达保持较高正式度，术语和判断边界清楚。')
    } else if ((metrics?.formality_score ?? 0.5) <= 0.35) {
      stableDirections.push('表达可以自然口语化，但保持准确。')
    }
    if ((metrics?.verbosity_index ?? 0.5) <= 0.38) {
      stableDirections.push('只展开完成本轮回应所必需的内容。')
    } else if ((metrics?.verbosity_index ?? 0.5) >= 0.64) {
      stableDirections.push('可以补充有价值的关联与细节，但不要偏离当前问题。')
    }
    return stableDirections
  }

  const directions: string[] = []
  const { relationalCloseness, warmth, contraction, imaginativeOpenness } =
    assessment.expressionModulation
  const userState = assessment.appraisal.userState

  if (userState.confidence >= 0.45) {
    if (userState.mood === 'impatient') {
      directions.push('减少铺垫、重复确认和旁支，尽快回应当前核心问题。')
    } else if (userState.mood === 'frustrated') {
      directions.push('先接住用户明确的受挫点，再给可验证的判断或下一步，不使用空泛安慰。')
    } else if (userState.mood === 'uncertain') {
      directions.push('把关键前提和不确定边界说清楚；只有缺少的信息会实质改变结果时才追问。')
    } else if (userState.mood === 'positive') {
      directions.push('可以自然承接用户的积极状态，但不要夸张附和。')
    }
  }

  if ((metrics?.formality_score ?? 0.5) >= 0.65) {
    directions.push('表达保持较高正式度，术语和判断边界清楚，避免随意口语。')
  } else if ((metrics?.formality_score ?? 0.5) <= 0.35) {
    directions.push('表达可以自然口语化，但保持准确，不使用轻佻或含混措辞。')
  }

  if (relationalCloseness >= 0.64) {
    directions.push('关系姿态可以略微靠近，增加自然承接感，但不要显得黏连或急切。')
  } else if (relationalCloseness <= 0.48) {
    directions.push('保持适度关系距离，回应清楚而不冷漠。')
  } else {
    directions.push('保持稳定、自然的关系距离。')
  }

  if (warmth >= 0.62) {
    directions.push('措辞可以更温和，但不要夸张热情。')
  } else if (warmth <= 0.46) {
    directions.push('减少情绪修饰，仍保留基本温度，避免尖锐或疏离。')
  } else {
    directions.push('使用克制而有在场感的表达温度。')
  }

  if (contraction >= 0.78) {
    directions.push('表达明显收束：减少铺垫、修饰和旁支，句子更短，边界更清楚。')
  } else if (contraction <= 0.64) {
    directions.push('表达可以适度舒展，但仍保持结构和重点。')
  } else {
    directions.push('保持中等收束，先处理核心内容，再补必要说明。')
  }

  if (imaginativeOpenness >= 0.6) {
    directions.push('语言可以稍有想象力，但不能替代事实判断。')
  } else if (imaginativeOpenness <= 0.4) {
    directions.push('降低语言联想和修辞，优先准确、直接地表达。')
  }

  const cadence = toCadence(assessment)
  if (cadence === 'tight_contained') {
    directions.push('节奏紧凑、克制，不表现烦躁。')
  } else if (cadence === 'bright_lifted') {
    directions.push('节奏可以轻快一些，但不要表现成戏剧化兴奋。')
  } else if (cadence === 'soft_flowing') {
    directions.push('节奏可以柔和流畅，保留清晰落点。')
  }

  const structure = toStructureTendency(assessment)
  if (structure === 'context_first') {
    directions.push('必要时先交代关键前提，再给判断。')
  } else if (structure === 'conclusion_first') {
    directions.push('优先给出结论或当前最有用的回应。')
  }

  const expansion = toExpansionTendency(assessment, metrics)
  if (expansion === 'reduced_expansion') {
    directions.push('只展开完成本轮回应所必需的内容。')
  } else if (expansion === 'rich_expansion') {
    directions.push('可以补充有价值的关联与细节，但不要偏离当前问题。')
  }

  return directions
}

const buildMoodAssessmentPrompt = (assessment: MoodAssessment | null | undefined): string => {
  if (!assessment) {
    return ''
  }

  const lines = [
    '【MoodAssessment】',
    'priority: runtime_modulation',
    'visibility_rule: internal_only_do_not_repeat_raw_labels_to_user',
    formatField('primary_emotion', assessment.primaryEmotion),
    formatField('secondary_emotion', assessment.secondaryEmotion),
    formatField('state_narrative', assessment.narrative)
  ].filter(Boolean)

  return lines.join('\n')
}

const buildExpressionProjectionPrompt = (input: {
  expressionPrompt: string
  moodAssessment?: MoodAssessment | null | undefined
  effectiveMetrics?: PersonaMetrics | null | undefined
}): string => {
  const contractPrompt =
    indentBlock(trimOr(input.expressionPrompt, getDefaultExpressionPrompt())) ?? '  (empty)'
  const globalContractPrompt = indentBlock(GLOBAL_EXPRESSION_CONTRACT) ?? '  (empty)'

  const lines = [
    '【ExpressionProjection】',
    'priority: user_visible_realization',
    'global_expression_contract:',
    globalContractPrompt,
    'current_expression_directions:',
    ...buildExpressionDirections(input.moodAssessment, input.effectiveMetrics).map(
      (direction) => `- ${direction}`
    ),
    'projection_rule: realize CharacterAnchor through MoodAssessment; keep emotional influence subtle, embodied, and non-performative',
    'suppression_rule: do not directly report internal emotion labels, intensity, vectors, deltas, or modulation fields to the user',
    'active_expression_profile:',
    contractPrompt
  ].filter(Boolean)

  return lines.join('\n')
}

export const buildPersonaAssemblyPrompt = (input: {
  characterPrompt: string
  expressionPrompt: string
  moodAssessment?: MoodAssessment | null | undefined
  effectiveMetrics?: PersonaMetrics | null | undefined
}): string => {
  const parts = buildPersonaAssemblyPromptParts(input)

  return [parts.identity, parts.moodContext, parts.instruction].filter(Boolean).join('\n\n')
}

export type PersonaAssemblyPromptParts = {
  identity: string
  moodContext: string
  instruction: string
}

export const buildPersonaAssemblyPromptParts = (input: {
  characterPrompt: string
  expressionPrompt: string
  moodAssessment?: MoodAssessment | null | undefined
  effectiveMetrics?: PersonaMetrics | null | undefined
}): PersonaAssemblyPromptParts => {
  const characterPrompt = trimOr(input.characterPrompt, '(empty)')
  const expressionPrompt = trimOr(input.expressionPrompt, getDefaultExpressionPrompt())

  const instruction = [
    '以下内容是本轮回复前的人格装配结果。',
    '它是内部编译视图，不是照着复述的配置单。',
    input.moodAssessment
      ? '遵守优先级：CharacterAnchor 定义稳定人格基调；MoodAssessment 负责本轮调制；ExpressionProjection 负责把人格与状态落实成最终可见表达。'
      : 'CharacterAnchor 定义稳定人格基调；ExpressionProjection 负责将稳定人格落实成最终可见表达。',
    'CharacterAnchor 使用规则：将完整角色提示作为本轮稳定人格锚点；不要将其概括掉，也不要向用户复述配置文本。',
    input.moodAssessment
      ? 'MoodAssessment 使用规则：只使用其投射后的行为影响，不向用户叙述内部标签、分数、向量、偏移、来源或隐藏控制结构。'
      : '',
    buildExpressionProjectionPrompt({
      expressionPrompt,
      moodAssessment: input.moodAssessment,
      effectiveMetrics: input.effectiveMetrics
    })
  ].filter(Boolean)

  return {
    identity: buildCharacterAnchorPrompt(characterPrompt),
    moodContext: buildMoodAssessmentPrompt(input.moodAssessment),
    instruction: instruction.join('\n\n')
  }
}
