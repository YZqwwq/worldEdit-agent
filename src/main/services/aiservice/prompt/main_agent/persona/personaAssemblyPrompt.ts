import type { PersonaPolicy } from '@share/cache/AItype/states/personaPolicy'
import type { MoodAssessment } from '@share/cache/AItype/states/moodAssessment'
import {
  BASE_MOOD_PROMPT,
  DEFAULT_CHARACTER_PROMPT,
  DEFAULT_EXPRESSION_PROMPT
} from '../shared/promptConstants'
import { classifyScale, formatField, indentBlock, trimOr } from '../shared/promptTextUtils'

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
    formatField('behavioral_narrative', assessment.behavioralNarrative),
    'baseline_rules:',
    indentBlock(BASE_MOOD_PROMPT),
    'usage_rule: treat the full MoodAssessment as hidden control state; only absorb its modulation effect, do not narrate its labels, scores, deltas, sources, or internal fields to the user'
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
