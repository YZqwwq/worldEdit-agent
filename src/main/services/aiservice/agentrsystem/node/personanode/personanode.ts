import { interactionObservationService } from '../../manager/personal/interactionObservationService'
import { personaConfigService } from '../../manager/personal/personaConfigService'
import { traceArtifact, traceDecision, traceState } from '../../../../log/trace/agentTraceEmitter'
import { MessagesState } from '../../state/messageState'
import {
  loadExpressionPromptProfile,
  loadMoodPrompt,
  resolveExpressionPromptProfile
} from '../../../prompt/main_agent/agentPromptService'
import { FAMILA_CHARACTER_MOOD_BOUNDARY } from './moodDynamicsBoundary'
import { inferMoodAppraisal } from './moodAppraisalService'
import { projectUserMoodSlot } from './userMoodProjection'
import { compileMoodAssessment } from './emotionDynamicsCompiler'
import { reconcilePersonaState } from './personaEvolutionService'
import { applyMoodExpressionDeltaToMetrics, buildPolicy } from './personaPolicyCompiler'
import { resolveWorkspaceProfile } from '../../workspaceProfileRegistry'
import type { InstantPerceptionContext } from '../instantperceptionnode/instantPerceptionContext'
import { getObservationText } from './personaObservationUtils'
import {
  getEffectiveMemorySlots,
  getEffectivePersona,
  getEffectiveSelfCore,
  getEffectiveLifeState,
  withMemorySlotsDraft,
  withPersonaDraft
} from '../../state/turnWorkspace'
import { buildSelfCoreAppraisalContext } from '../../../prompt/main_agent/persona/selfCoreProjection'
import { buildAgentHabitatPrompt } from '../../../prompt/main_agent/persona/agentHabitatPrompt'

/**
 * 人格总控节点。
 *
 * personaNode 仍然是 AI 人格侧的统一入口，内部按职责委托给：
 * - personaEvolutionService: 从观测更新长期/会话/瞬时人格参数。
 * - moodAppraisalService: 评价当前 Turn 输入对 Agent 的意义。
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
  const selfCore = getEffectiveSelfCore(state.turnWorkspace)
  const lifeState = getEffectiveLifeState(state.turnWorkspace)
  const workspaceProfile = resolveWorkspaceProfile(state.workspaceContext)
  const sceneCharacter = workspaceProfile?.scenePolicy
  const expressionProfileDefinition = resolveExpressionPromptProfile()
  const expressionProfile = await loadExpressionPromptProfile(expressionProfileDefinition.id)

  traceState('personaNode', {
    title: '输入快照: personaNode',
    summary: `观测 ${observations.length} 条，用户情绪=${slots.user_mood.current_mood || 'none'}`,
    data: {
      personaId: personaState.persona_id,
      personaUpdatedAt: personaState.last_updated,
      observationCount: observations.length,
      observationTypes: observations.map((observation) => observation.type),
      lastObservationId: slots.lastObservationId,
      userMood: slots.user_mood,
      previousMood: slots.ai_mood.current
        ? {
            primaryEmotion: slots.ai_mood.current.primaryEmotion,
            secondaryEmotion: slots.ai_mood.current.secondaryEmotion,
            intensity: slots.ai_mood.current.intensity,
            generatedAt: slots.ai_mood.current.generatedAt
          }
        : null,
      workspaceProfile: workspaceProfile?.id ?? null,
      sceneCharacter: sceneCharacter?.id ?? null,
      expressionProfile: expressionProfile.id,
      moodPromptChars: moodPrompt.length,
      configuredSignalRuleCount: config.signalRules.length
    }
  })

  const contextualUserObservation = observations
    .slice()
    .reverse()
    .find(
      (observation) =>
        perceptionContext.source === 'user' &&
        observation.type === 'user_message' &&
        getObservationText(observation).trim() === perceptionContext.currentEventText.trim()
    )

  const reconciled = await reconcilePersonaState({
    state: personaState,
    observations,
    slots,
    config,
    signalContext:
      perceptionContext.source === 'user' && contextualUserObservation
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
    selfContext: [
      selfCore ? buildSelfCoreAppraisalContext(selfCore) : '',
      buildAgentHabitatPrompt(),
      lifeState.narrative.trim()
        ? `进入本轮前正在经历：\n${lifeState.narrative.trim()}`
        : '进入本轮前没有已提交的主体生活状态。'
    ]
      .filter(Boolean)
      .join('\n\n'),
    observations,
    currentEventText: perceptionContext.currentEventText,
    eventSource: perceptionContext.source,
    recentHistory: perceptionContext.recentHistory,
    previousMood: slots.ai_mood.current
  })
  const moodAssessment = compileMoodAssessment({
    appraisal,
    previousMood: slots.ai_mood.current,
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
    user_mood:
      perceptionContext.source === 'user'
        ? projectUserMoodSlot(appraisal, {
            observationId: contextualUserObservation?.id ?? slots.lastObservationId + 1,
            retentionObservations: config.slot.userMoodRetentionObservations,
            nowIso
          })
        : slots.user_mood,
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
      cognition: policy.cognition
    }
  })

  return {
    personaPolicy: policy,
    expressionProfile,
    turnWorkspace: nextWorkspace
  }
}
