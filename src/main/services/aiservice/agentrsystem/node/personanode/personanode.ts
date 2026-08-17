import { interactionObservationService } from '../../manager/personal/interactionObservationService'
import { personaConfigService } from '../../manager/personal/personaConfigService'
import { traceArtifact, traceDecision, traceState } from '../../../../log/trace/agentTraceEmitter'
import { MessagesState } from '../../state/messageState'
import { applyScenePerceptionToMemorySlots } from '../../state/sceneContextAdapter'
import {
  loadExpressionPromptProfile,
  loadMoodPrompt,
  resolveExpressionPromptProfile
} from '../../../prompt/main_agent/agentPromptService'
import { FAMILA_CHARACTER_MOOD_BOUNDARY } from './moodDynamicsBoundary'
import { inferMoodAppraisal } from './moodAppraisalService'
import { compileMoodAssessment } from './emotionDynamicsCompiler'
import { reconcilePersonaState } from './personaEvolutionService'
import { applyMoodExpressionDeltaToMetrics, buildPolicy } from './personaPolicyCompiler'
import { resolveWorkspaceProfile } from '../../workspaceProfileRegistry'
import type { InstantPerceptionContext } from '../instantperceptionnode/instantPerceptionContext'
import { getObservationText } from './personaObservationUtils'
import {
  getEffectiveMemorySlots,
  getEffectivePersona,
  withMemorySlotsDraft,
  withPersonaDraft
} from '../../state/turnWorkspace'

/**
 * 人格总控节点。
 *
 * personaNode 仍然是 AI 人格侧的统一入口，内部按职责委托给：
 * - personaEvolutionService: 从观测更新长期/会话/瞬时人格参数。
 * - moodAppraisalService: 只评价用户消息和用户交互事件。
 * - emotionDynamicsCompiler: 负责情绪刺激、惯性、衰减和状态投影。
 * - moodDynamicsBoundary: 将原始情绪裁剪回角色稳定边界。
 * - personaPolicyCompiler: 编译本轮采样、工具、行动和记忆策略。
 */
export async function personaNode(
  state: typeof MessagesState.State,
  perceptionContext: InstantPerceptionContext
): Promise<Partial<typeof MessagesState.State>> {
  if (!state.turnWorkspace) {
    throw new Error('personaNode requires an active turn workspace')
  }

  const personaState = getEffectivePersona(state.turnWorkspace)
  if (!personaState) {
    return {}
  }

  const config = await personaConfigService.getConfig()
  const moodPrompt = await loadMoodPrompt()
  const persistedObservations = await interactionObservationService.listSince(
    personaState.last_observation_id
  )
  const observations = [
    ...persistedObservations,
    ...state.turnWorkspace.draft.observations.filter(
      (observation) => !persistedObservations.some((persisted) => persisted.id === observation.id)
    )
  ]
  const slots = getEffectiveMemorySlots(state.turnWorkspace)
  const effectiveSlots = applyScenePerceptionToMemorySlots(slots)
  const workspaceProfile = resolveWorkspaceProfile(state.workspaceContext)
  const sceneCharacter = workspaceProfile?.scenePolicy
  const expressionProfileDefinition = resolveExpressionPromptProfile(effectiveSlots)
  const expressionProfile = await loadExpressionPromptProfile(expressionProfileDefinition.id)

  traceState('personaNode', {
    title: '输入快照: personaNode',
    summary: `观测 ${observations.length} 条，场景=${effectiveSlots.conversation_state.conversation_mode || 'none'}，用户情绪=${effectiveSlots.user_mood.current_mood || 'none'}`,
    data: {
      personaState,
      config,
      moodPrompt,
      expressionProfile,
      previousMood: effectiveSlots.ai_mood.current ?? null,
      observations,
      slots,
      effectiveSlots,
      workspaceProfile: workspaceProfile?.id ?? null,
      sceneCharacter: sceneCharacter ?? null,
      scenePerception: effectiveSlots.scene_perception
    }
  })

  const contextualUserObservation = observations
    .slice()
    .reverse()
    .find(
      (observation) =>
        observation.type === 'user_message' &&
        getObservationText(observation).trim() === perceptionContext.currentUserText.trim()
    )

  const reconciled = await reconcilePersonaState({
    state: personaState,
    observations,
    slots: effectiveSlots,
    config,
    signalContext: contextualUserObservation
      ? {
          observationId: contextualUserObservation.id,
          recentDialogue: perceptionContext.recentHistory
        }
      : undefined
  })

  const baseMetrics = reconciled.state.metrics
  const nowIso = new Date().toISOString()
  const appraisal = await inferMoodAppraisal({
    moodPrompt,
    observations,
    currentUserText: perceptionContext.currentUserText,
    recentHistory: perceptionContext.recentHistory,
    previousMood: effectiveSlots.ai_mood.current
  })
  const moodAssessment = compileMoodAssessment({
    appraisal,
    previousMood: effectiveSlots.ai_mood.current,
    nowIso,
    boundary: FAMILA_CHARACTER_MOOD_BOUNDARY
  })
  const effectiveMetrics = applyMoodExpressionDeltaToMetrics(
    baseMetrics,
    moodAssessment.expressionDelta
  )
  const policy = buildPolicy(
    baseMetrics,
    effectiveMetrics,
    moodAssessment,
    reconciled.appliedSignals,
    nowIso,
    sceneCharacter
  )

  const nextSlots = {
    ...slots,
    ai_mood: {
      current: moodAssessment,
      updatedAt: moodAssessment.generatedAt
    }
  }
  const workspaceWithPersona = withPersonaDraft(state.turnWorkspace, reconciled.state)
  const nextWorkspace = withMemorySlotsDraft(workspaceWithPersona, nextSlots)

  traceDecision('personaNode', {
    title: '人格状态: personaNode',
    summary:
      `信号=${reconciled.appliedSignals.length}` +
      `，主情绪=${moodAssessment.primaryEmotion}` +
      (moodAssessment.secondaryEmotion ? `/${moodAssessment.secondaryEmotion}` : '') +
      `，强度=${moodAssessment.intensity.toFixed(2)}`,
    data: {
      signalLabels: reconciled.appliedSignals.map((signal) => signal.user_signal),
      appraisal: moodAssessment.appraisal,
      shortTerm: moodAssessment.shortTerm,
      slowMood: moodAssessment.slowMood,
      relationship: moodAssessment.relationship,
      projection: {
        primaryEmotion: moodAssessment.primaryEmotion,
        secondaryEmotion: moodAssessment.secondaryEmotion,
        intensity: moodAssessment.intensity,
        narrative: moodAssessment.narrative
      }
    }
  })

  traceArtifact('personaNode', {
    title: '行为倾向: personaNode',
    summary:
      `表达方案=${expressionProfile.id}` +
      `，温度偏移=${policy.sampling.temperatureOffset.toFixed(2)}`,
    data: {
      baseMetrics,
      effectiveMetrics,
      workspaceProfile: workspaceProfile?.id ?? null,
      sceneCharacter: sceneCharacter ?? null,
      expressionProfile: {
        id: expressionProfile.id,
        title: expressionProfile.title,
        summary: expressionProfile.summary
      },
      sampling: policy.sampling,
      action: policy.action
    }
  })

  return {
    personaPolicy: policy,
    expressionProfile,
    turnWorkspace: nextWorkspace
  }
}
