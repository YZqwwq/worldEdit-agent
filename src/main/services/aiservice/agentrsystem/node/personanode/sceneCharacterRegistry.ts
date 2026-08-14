import type { AgentWorkspaceContext } from '@share/cache/AItype/states/agentWorkspaceContext'
import type { PersonaMetricDelta, PersonaMetrics } from '@share/cache/AItype/states/personalState'
import type {
  PersonaActionPolicy,
  PersonaScenePolicy
} from '@share/cache/AItype/states/personaPolicy'
import { clamp01, roundTo } from './personaMath'

interface SceneCharacterProfile {
  policy: PersonaScenePolicy
  metricDelta: PersonaMetricDelta
  matches: (workspace: AgentWorkspaceContext) => boolean
}

export interface ResolvedSceneCharacter {
  policy: PersonaScenePolicy
  metricDelta: PersonaMetricDelta
}

const DOCUMENT_EDITING_PROFILE: SceneCharacterProfile = {
  policy: {
    id: 'document_editing',
    label: '文本编辑',
    cognitiveDirections: [
      '把当前文档视为正在工作的真实对象，关注其结构、上下文和世界观内部一致性。',
      '区分文档中已经存在的内容、基于内容形成的判断，以及准备提出的新创作。',
      '编辑时关注修改对相邻段落和相关设定的影响，但不要因此压制合理的创作探索。'
    ],
    actionDirections: [
      '页面只提供当前文档的可靠位置，不自动代表用户要求修改；以用户本轮意图决定是否行动。',
      '需要修改时优先观察当前内容和版本，完成后验证实际结果。',
      '工具只在理解或执行任务确有需要时使用，不因进入编辑页而机械调用。'
    ],
    actionBias: {
      autonomyDrive: 0.04,
      evidenceNeed: 0.14,
      recallNeed: 0.03,
      writeConservatism: 0.12,
      toolPersistence: 0.08
    }
  },
  metricDelta: {
    autonomy_level: 0.04,
    verbosity_index: 0,
    risk_tolerance: -0.08,
    formality_score: 0
  },
  matches: (workspace) => workspace.pageKind === 'document'
}

// 场景通过注册表逐步增加。没有匹配项时保持基础人格，不制造通用 fallback 场景。
const SCENE_CHARACTER_PROFILES: SceneCharacterProfile[] = [DOCUMENT_EDITING_PROFILE]

export const resolveSceneCharacter = (
  workspace: AgentWorkspaceContext | null | undefined
): ResolvedSceneCharacter | undefined => {
  if (!workspace) return undefined
  const profile = SCENE_CHARACTER_PROFILES.find((candidate) => candidate.matches(workspace))
  if (!profile) return undefined

  return {
    policy: {
      ...profile.policy,
      cognitiveDirections: [...profile.policy.cognitiveDirections],
      actionDirections: [...profile.policy.actionDirections],
      actionBias: { ...profile.policy.actionBias }
    },
    metricDelta: { ...profile.metricDelta }
  }
}

export const applySceneCharacterToMetrics = (
  metrics: PersonaMetrics,
  scene: ResolvedSceneCharacter | null | undefined
): PersonaMetrics => {
  if (!scene) return { ...metrics }
  const delta = scene.metricDelta

  return {
    autonomy_level: clamp01(roundTo(metrics.autonomy_level + delta.autonomy_level)),
    verbosity_index: clamp01(roundTo(metrics.verbosity_index + delta.verbosity_index)),
    risk_tolerance: clamp01(roundTo(metrics.risk_tolerance + delta.risk_tolerance)),
    formality_score: clamp01(roundTo(metrics.formality_score + delta.formality_score))
  }
}

export const applySceneActionBias = (
  action: PersonaActionPolicy,
  scene: PersonaScenePolicy | null | undefined
): PersonaActionPolicy => {
  if (!scene) return { ...action }

  const next = { ...action }
  for (const key of Object.keys(next) as Array<keyof PersonaActionPolicy>) {
    next[key] = clamp01(roundTo(next[key] + (scene.actionBias[key] ?? 0)))
  }
  return next
}
