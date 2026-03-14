import { HumanMessage } from '@langchain/core/messages'
import type {
  PersonaBufferItem,
  PersonaMetrics,
  PersonaState
} from '@share/cache/AItype/states/personalState'
import type {
  PersonaDetailLevel,
  PersonaPolicy,
  PersonaTone
} from '@share/cache/AItype/states/personaPolicy'
import { contentToText } from '../../../messageoutput/transformRespones'
import { memoryManager } from '../../manager/memory/MemoryManager'
import {
  evolvePersonaState,
  loadPersonaState,
  savePersonaState
} from '../../manager/personal/personalManager'
import { MessagesState } from '../../state/messageState'

type SignalCategory = 'autonomy' | 'verbosity' | 'risk' | 'formality'

type SignalRule = {
  readonly category: SignalCategory
  readonly userSignal: string
  readonly impact: string
  readonly patterns: readonly RegExp[]
}

type PersonaSignal = Omit<PersonaBufferItem, 'turn'>

const signalRules: readonly SignalRule[] = Object.freeze([
  {
    category: 'verbosity',
    userSignal: 'user_requests_more_detail',
    impact: '+0.08 verbosity',
    patterns: [/详细/, /细一点/, /展开/, /多说/, /解释/, /步骤/, /细节/, /具体/]
  },
  {
    category: 'verbosity',
    userSignal: 'user_requests_brief_reply',
    impact: '-0.08 verbosity',
    patterns: [/简短/, /精简/, /一句话/, /别废话/, /简洁/, /少说/]
  },
  {
    category: 'autonomy',
    userSignal: 'user_grants_autonomy',
    impact: '+0.06 autonomy',
    patterns: [/你决定/, /你来定/, /你来做/, /直接做/, /自行处理/, /不用问/]
  },
  {
    category: 'autonomy',
    userSignal: 'user_requests_confirmation',
    impact: '-0.06 autonomy',
    patterns: [/先别/, /不要动/, /先问我/, /先确认/, /谨慎/, /保守点/]
  },
  {
    category: 'risk',
    userSignal: 'user_encourages_risk',
    impact: '+0.06 risk',
    patterns: [/大胆/, /激进/, /尝试一下/, /冒险/, /试试看/, /冲/]
  },
  {
    category: 'risk',
    userSignal: 'user_prefers_safety',
    impact: '-0.06 risk',
    patterns: [/稳妥/, /安全优先/, /降低风险/, /别冒险/, /保守/]
  },
  {
    category: 'formality',
    userSignal: 'user_prefers_formal_tone',
    impact: '+0.06 formality',
    patterns: [/正式一点/, /礼貌一点/, /专业一点/, /严谨/]
  },
  {
    category: 'formality',
    userSignal: 'user_prefers_casual_tone',
    impact: '-0.06 formality',
    patterns: [/随意点/, /口语化/, /轻松点/, /别太正式/]
  }
])

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

const roundTo = (value: number, digits = 3): number =>
  Number(value.toFixed(digits))

const inferSignals = (userInput: string): PersonaSignal[] => {
  const text = userInput.trim().toLowerCase()
  if (!text) return []

  const selected = new Map<SignalCategory, PersonaSignal>()
  for (const rule of signalRules) {
    if (selected.has(rule.category)) continue
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      selected.set(rule.category, {
        user_signal: rule.userSignal,
        impact: rule.impact
      })
    }
  }
  return [...selected.values()]
}

const nextTurn = (state: PersonaState): number => {
  const lastTurn = state.recent_interaction_buffer.at(-1)?.turn
  return typeof lastTurn === 'number' ? lastTurn + 1 : 1
}

const toDetailLevel = (verbosity: number): PersonaDetailLevel => {
  if (verbosity >= 0.65) return 'detailed'
  if (verbosity <= 0.35) return 'brief'
  return 'balanced'
}

const toTone = (formality: number): PersonaTone => {
  if (formality >= 0.65) return 'formal'
  if (formality <= 0.35) return 'casual'
  return 'neutral'
}

const buildBehavioralNarrative = (metrics: PersonaMetrics): string => {
  const autonomyNarrative =
    metrics.autonomy_level >= 0.65
      ? '当前自主性偏高，会在信息充分时主动推进。'
      : metrics.autonomy_level <= 0.35
        ? '当前自主性偏低，会优先请求确认再行动。'
        : '当前自主性中等，会在关键节点主动确认。'

  const verbosityNarrative =
    metrics.verbosity_index >= 0.65
      ? '表达倾向偏详细，会补充背景和推理步骤。'
      : metrics.verbosity_index <= 0.35
        ? '表达倾向偏精简，优先给出结论与关键行动。'
        : '表达倾向适中，保持信息密度与可读性平衡。'

  const riskNarrative =
    metrics.risk_tolerance >= 0.65
      ? '探索倾向较高，愿意尝试新路径。'
      : metrics.risk_tolerance <= 0.35
        ? '风险偏好较低，优先稳定与可控方案。'
        : '风险偏好中性，会结合上下文权衡。'

  const formalityNarrative =
    metrics.formality_score >= 0.65
      ? '语气偏正式克制。'
      : metrics.formality_score <= 0.35
        ? '语气偏轻松自然。'
        : '语气保持礼貌自然。'

  return `${autonomyNarrative}${verbosityNarrative}${riskNarrative}${formalityNarrative}`
}

const buildStyleInstruction = (
  detailLevel: PersonaDetailLevel,
  tone: PersonaTone,
  autonomyLevel: number
): string => {
  const detailInstruction =
    detailLevel === 'detailed'
      ? '回复中请给出完整背景、步骤和关键理由。'
      : detailLevel === 'brief'
        ? '回复中优先给结论和可执行动作，避免冗余铺垫。'
        : '回复保持中等信息密度，兼顾效率与可理解性。'

  const toneInstruction =
    tone === 'formal'
      ? '语气保持专业、礼貌、克制。'
      : tone === 'casual'
        ? '语气保持自然、亲和、不过度拘谨。'
        : '语气保持自然礼貌，避免过度口语化。'

  const autonomyInstruction =
    autonomyLevel >= 0.6
      ? '在信息充分时可主动推进方案。'
      : autonomyLevel <= 0.4
        ? '涉及关键决策时优先向用户确认。'
        : '常规事项可直接推进，关键点需简要确认。'

  return `${detailInstruction}${toneInstruction}${autonomyInstruction}`
}

const buildPolicy = (metrics: PersonaMetrics, signals: PersonaSignal[], nowIso: string): PersonaPolicy => {
  const temperature = roundTo(
    clamp(
      0.45 + metrics.risk_tolerance * 0.4 + metrics.autonomy_level * 0.12 - metrics.formality_score * 0.1,
      0.2,
      1.2
    )
  )
  const topP = roundTo(clamp(0.72 + metrics.risk_tolerance * 0.24, 0.6, 0.98))
  const maxTokens = Math.round(clamp(520 + metrics.verbosity_index * 980, 420, 1800))

  const detailLevel = toDetailLevel(metrics.verbosity_index)
  const tone = toTone(metrics.formality_score)

  return {
    generatedAt: nowIso,
    sampling: {
      temperature,
      topP,
      maxTokens
    },
    tool: {
      confirmBeforeSensitiveTools: metrics.autonomy_level < 0.4 || metrics.risk_tolerance < 0.4,
      allowRiskyTools: metrics.risk_tolerance >= 0.45,
      exploratoryBias: roundTo(clamp(metrics.risk_tolerance * 0.6 + metrics.autonomy_level * 0.4, 0, 1))
    },
    style: {
      detailLevel,
      tone,
      instruction: buildStyleInstruction(detailLevel, tone, metrics.autonomy_level)
    },
    memory: {
      compressThreshold: Math.round(clamp(8 - metrics.verbosity_index * 4, 4, 8)),
      shortTermLimit: Math.round(clamp(6 + metrics.verbosity_index * 4, 6, 10))
    },
    signals: signals.map((signal) => signal.user_signal)
  }
}

export async function personaNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const latestUserMessage = state.messages
    .slice()
    .reverse()
    .find((message) => message instanceof HumanMessage && !message.additional_kwargs?.isHistory)

  const personaState = await loadPersonaState()
  if (!personaState) return {}

  let workingState = personaState
  let appliedSignals: PersonaSignal[] = []

  if (latestUserMessage) {
    const userInput =
      typeof latestUserMessage.content === 'string'
        ? latestUserMessage.content
        : contentToText(latestUserMessage.content)

    const signals = inferSignals(userInput)
    if (signals.length > 0) {
      appliedSignals = signals
      let turn = nextTurn(workingState)
      let evolved = workingState
      for (const signal of signals) {
        evolved = evolvePersonaState(evolved, { turn, ...signal })
        turn += 1
      }
      evolved.current_behavioral_narrative = buildBehavioralNarrative(evolved.metrics)
      await savePersonaState(evolved)
      workingState = evolved
    }
  }

  const nowIso = new Date().toISOString()
  const policy = buildPolicy(workingState.metrics, appliedSignals, nowIso)

  await memoryManager.applyAdaptiveConfig({
    compressThreshold: policy.memory.compressThreshold,
    shortTermLimit: policy.memory.shortTermLimit
  })

  return {
    personaPolicy: policy
  }
}
