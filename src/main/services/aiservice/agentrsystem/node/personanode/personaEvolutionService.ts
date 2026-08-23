import type { InteractionObservationSnapshot } from '@share/cache/AItype/states/interactionObservation'
import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'
import type { PersonaConfig } from '@share/cache/AItype/states/personaConfig'
import type {
  PersonaBufferItem,
  InteractionPreference,
  PersonaMetricDelta,
  PersonaMetrics,
  PersonaState
} from '@share/cache/AItype/states/personalState'
import {
  clamp01,
  createNeutralPersonaMetrics,
  createZeroPersonaDelta,
  roundTo
} from '../../manager/personal/personalManager'
import { clamp } from './personaMath'
import { getObservationText } from './personaObservationUtils'
import { inferSignals } from './personaSignalInference'
import type { PersonaSignal, SignalCategory } from './personaTypes'
import type { RecentDialogueMessage } from '../instantperceptionnode/instantPerceptionContext'

const addMetricDelta = (
  delta: PersonaMetricDelta,
  category: SignalCategory,
  amount: number
): PersonaMetricDelta => {
  if (category === '自主性') {
    delta.autonomy_level = clamp(roundTo(delta.autonomy_level + amount), -1, 1)
  } else if (category === '详略度') {
    delta.verbosity_index = clamp(roundTo(delta.verbosity_index + amount), -1, 1)
  } else if (category === '探索性') {
    delta.risk_tolerance = clamp(roundTo(delta.risk_tolerance + amount), -1, 1)
  } else if (category === '正式度') {
    delta.formality_score = clamp(roundTo(delta.formality_score + amount), -1, 1)
  }
  return delta
}

const decayDelta = (input: PersonaMetricDelta, factor: number): PersonaMetricDelta => ({
  autonomy_level: roundTo(input.autonomy_level * factor),
  verbosity_index: roundTo(input.verbosity_index * factor),
  risk_tolerance: roundTo(input.risk_tolerance * factor),
  formality_score: roundTo(input.formality_score * factor)
})

const cloneMetrics = (input: PersonaMetrics): PersonaMetrics => ({ ...input })

const synthesizeMetrics = (
  interaction: InteractionPreference,
  operational: { risk_tolerance: number },
  session: PersonaMetricDelta,
  transient: PersonaMetricDelta,
  config: PersonaConfig
): PersonaMetrics => ({
  autonomy_level: clamp01(
    roundTo(
      interaction.autonomy_level +
        session.autonomy_level * config.layerWeights.session +
        transient.autonomy_level * config.layerWeights.transient
    )
  ),
  verbosity_index: clamp01(
    roundTo(
      interaction.verbosity_index +
        session.verbosity_index * config.layerWeights.session +
        transient.verbosity_index * config.layerWeights.transient
    )
  ),
  risk_tolerance: clamp01(
    roundTo(
      operational.risk_tolerance +
        session.risk_tolerance * config.layerWeights.session +
        transient.risk_tolerance * config.layerWeights.transient
    )
  ),
  formality_score: clamp01(
    roundTo(
      interaction.formality_score +
        session.formality_score * config.layerWeights.session +
        transient.formality_score * config.layerWeights.transient
    )
  )
})

// 将用户协作信号、操作基线和短时观测分别写入各自责任层。
const applyTaskObservationEffect = (
  state: PersonaState,
  observation: InteractionObservationSnapshot,
  config: PersonaConfig
): void => {
  const effect = config.taskObservationEffects.find((item) => item.type === observation.type)
  if (!effect) {
    return
  }

  for (const [key, amount] of Object.entries(effect.session ?? {})) {
    if (typeof amount === 'number') {
      addMetricDelta(state.session_hormones, key as SignalCategory, amount)
    }
  }
  for (const [key, amount] of Object.entries(effect.transient ?? {})) {
    if (typeof amount === 'number') {
      addMetricDelta(state.transient_state, key as SignalCategory, amount)
    }
  }
}

export const reconcilePersonaState = async (input: {
  state: PersonaState
  observations: InteractionObservationSnapshot[]
  slots: MemorySlotSnapshot
  config: PersonaConfig
  signalContext?: {
    observationId: number
    recentDialogue: RecentDialogueMessage[]
  }
}): Promise<{
  state: PersonaState
  appliedSignals: PersonaSignal[]
}> => {
  const next: PersonaState = {
    ...input.state,
    interaction_preferences: {
      autonomy_level: input.state.interaction_preferences?.autonomy_level ?? 0.5,
      verbosity_index: input.state.interaction_preferences?.verbosity_index ?? 0.5,
      formality_score: input.state.interaction_preferences?.formality_score ?? 0.5
    },
    operational_baseline: {
      risk_tolerance: input.state.operational_baseline?.risk_tolerance ?? 0.5
    },
    session_hormones: decayDelta(
      input.state.session_hormones || createZeroPersonaDelta(),
      input.config.decay.sessionFactor
    ),
    transient_state: decayDelta(
      input.state.transient_state || createZeroPersonaDelta(),
      input.config.decay.transientFactor
    ),
    metrics: cloneMetrics(input.state.metrics || createNeutralPersonaMetrics()),
    recent_interaction_buffer: [...(input.state.recent_interaction_buffer ?? [])]
  }

  const appliedSignals: PersonaSignal[] = []
  let turn = next.evolution_turn || 0

  for (const observation of input.observations) {
    if (observation.type === 'user_message') {
      const text = getObservationText(observation)
      const signals = await inferSignals(
        text,
        next.metrics,
        observation.id === input.signalContext?.observationId
          ? input.signalContext.recentDialogue
          : []
      )
      for (const signal of signals) {
        const stableAmount = signal.delta * input.config.learningRates.stableFromSignal
        if (signal.category === '探索性') {
          next.operational_baseline.risk_tolerance = clamp01(
            roundTo(next.operational_baseline.risk_tolerance + stableAmount)
          )
        } else {
          if (signal.category === '自主性') {
            next.interaction_preferences.autonomy_level = clamp01(
              next.interaction_preferences.autonomy_level + stableAmount
            )
          } else if (signal.category === '详略度') {
            next.interaction_preferences.verbosity_index = clamp01(
              next.interaction_preferences.verbosity_index + stableAmount
            )
          } else if (signal.category === '正式度') {
            next.interaction_preferences.formality_score = clamp01(
              next.interaction_preferences.formality_score + stableAmount
            )
          }
        }
        addMetricDelta(
          next.session_hormones,
          signal.category,
          signal.delta * input.config.learningRates.sessionFromSignal
        )
        turn += 1
        next.recent_interaction_buffer.push({
          turn,
          user_signal: signal.user_signal,
          impact: signal.impact
        } satisfies PersonaBufferItem)
      }
      appliedSignals.push(...signals)
    } else if (observation.type === 'user_interrupt') {
      addMetricDelta(
        next.transient_state,
        '详略度',
        -input.config.learningRates.transientFromInterrupt
      )
      addMetricDelta(
        next.transient_state,
        '自主性',
        -input.config.learningRates.transientFromInterrupt * 0.5
      )
    } else if (observation.type === 'user_revert') {
      addMetricDelta(
        next.transient_state,
        '探索性',
        -input.config.learningRates.transientFromRevert
      )
      addMetricDelta(
        next.transient_state,
        '详略度',
        -input.config.learningRates.transientFromRevert * 0.5
      )
    } else {
      applyTaskObservationEffect(next, observation, input.config)
    }

    next.last_observation_id = observation.id
    next.metrics = synthesizeMetrics(
      next.interaction_preferences,
      next.operational_baseline,
      next.session_hormones,
      next.transient_state,
      input.config
    )
  }

  next.metrics = synthesizeMetrics(
    next.interaction_preferences,
    next.operational_baseline,
    next.session_hormones,
    next.transient_state,
    input.config
  )
  next.recent_interaction_buffer = next.recent_interaction_buffer.slice(-20)
  next.evolution_turn = turn
  next.last_updated = new Date().toISOString()

  return {
    state: next,
    appliedSignals
  }
}
