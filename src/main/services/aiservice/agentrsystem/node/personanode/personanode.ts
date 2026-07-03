import { memorySlotService } from '../../manager/memory/memorySlotService'
import { memoryManager } from '../../manager/memory/MemoryManager'
import { interactionObservationService } from '../../manager/personal/interactionObservationService'
import { personaConfigService } from '../../manager/personal/personaConfigService'
import { loadPersonaState, savePersonaState } from '../../manager/personal/personalManager'
import { traceArtifact, traceDecision, traceState } from '../../../../log/trace/agentTraceEmitter'
import { MessagesState } from '../../state/messageState'
import { applyScenePerceptionToMemorySlots } from '../../state/sceneContextAdapter'
import {
  loadExpressionPromptProfile,
  loadMoodPrompt,
  resolveExpressionPromptProfile
} from '../../../prompt/main_agent/agentPromptService'
import { applyCharacterMoodBoundary, FAMILA_CHARACTER_MOOD_BOUNDARY } from './characterMoodBoundary'
import { inferMoodAssessment } from './moodAssessmentService'
import { reconcilePersonaState } from './personaEvolutionService'
import { applyMoodDeltaToMetrics, buildPolicy } from './personaPolicyCompiler'

/**
 * 人格总控节点。
 *
 * personaNode 仍然是 AI 人格侧的统一入口，内部按职责委托给：
 * - personaEvolutionService: 从观测更新长期/会话/瞬时人格参数。
 * - moodAssessmentService: 根据情绪规则和上下文生成本轮 AI 侧情绪。
 * - characterMoodBoundary: 将原始情绪裁剪回角色稳定边界。
 * - personaPolicyCompiler: 编译本轮采样、工具、行动和记忆策略。
 */
export async function personaNode(
  _state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const personaState = await loadPersonaState()
  if (!personaState) {
    return {}
  }

  const config = await personaConfigService.getConfig()
  const moodPrompt = await loadMoodPrompt()
  const observations = await interactionObservationService.listSince(
    personaState.last_observation_id
  )
  const slots = await memorySlotService.reconcileFromObservations()
  const effectiveSlots = applyScenePerceptionToMemorySlots(slots)
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
      scenePerception: effectiveSlots.scene_perception
    }
  })

  const reconciled = await reconcilePersonaState({
    state: personaState,
    observations,
    slots: effectiveSlots,
    config
  })

  await savePersonaState(reconciled.state)

  const nowIso = new Date().toISOString()
  const rawMoodAssessment = await inferMoodAssessment({
    moodPrompt,
    observations,
    previousMood: effectiveSlots.ai_mood.current,
    state: reconciled.state,
    slots: effectiveSlots,
    signals: reconciled.appliedSignals,
    nowIso
  })
  const moodAssessment = applyCharacterMoodBoundary(
    rawMoodAssessment,
    FAMILA_CHARACTER_MOOD_BOUNDARY,
    effectiveSlots
  )
  const baseMetrics = reconciled.state.metrics
  const effectiveMetrics = applyMoodDeltaToMetrics(baseMetrics, moodAssessment.参数偏移)
  const policy = buildPolicy(
    baseMetrics,
    effectiveMetrics,
    moodAssessment,
    reconciled.appliedSignals,
    nowIso
  )

  await memorySlotService.updateAiMood({
    current: moodAssessment,
    updatedAt: moodAssessment.生成时间
  })

  traceDecision('personaNode', {
    title: '人格状态: personaNode',
    summary:
      `信号=${reconciled.appliedSignals.length}` +
      `，主情绪=${moodAssessment.主情绪}` +
      (moodAssessment.副情绪 ? `/${moodAssessment.副情绪}` : '') +
      `，强度=${moodAssessment.强度.toFixed(2)}`,
    data: {
      signalLabels: reconciled.appliedSignals.map((signal) => signal.user_signal),
      情绪状态: {
        主情绪: moodAssessment.主情绪,
        副情绪: moodAssessment.副情绪,
        强度: moodAssessment.强度,
        行为叙事: moodAssessment.行为叙事,
        情绪向量: moodAssessment.情绪向量
      }
    }
  })

  await memoryManager.applyAdaptiveConfig({
    archiveThreshold: policy.memory.archiveThreshold,
    shortTermLimit: policy.memory.shortTermLimit
  })

  traceArtifact('personaNode', {
    title: '行为倾向: personaNode',
    summary:
      `表达方案=${expressionProfile.id}` + `，温度=${policy.sampling.temperature.toFixed(2)}`,
    data: {
      baseMetrics,
      effectiveMetrics,
      expressionProfile: {
        id: expressionProfile.id,
        title: expressionProfile.title,
        summary: expressionProfile.summary
      },
      sampling: policy.sampling,
      action: policy.action,
      tool: policy.tool,
      memory: policy.memory
    }
  })

  return {
    personaPolicy: policy,
    expressionProfile
  }
}
