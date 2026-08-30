import { traceArtifact, traceDecision } from '../../../../log/trace/agentTraceEmitter'
import { MessagesState } from '../../state/messageState'
import { personaNode } from '../personanode/personanode'
import { buildInstantPerceptionContext } from './instantPerceptionContext'
import { advanceTurnLifecycle } from '@share/cache/AItype/states/turnLifecycle'

const detectorStateKeys = (patch: Partial<typeof MessagesState.State>): string[] =>
  Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)

const now = (): number => Date.now()

/**
 * InstantPerceptionNode: 本轮 Persona/Mood 即时感知的编排入口。
 * 场景与对象由主 Agent 根据对话、页面与工具证据直接理解，不再预先分类。
 *
 * 后续可以在这里继续挂载 task intent、memory need、tool need 等 detector，
 * 但 detector 不应执行重型阅读、长推理或持久写入类任务。
 */
export async function instantPerceptionNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  if (!state.turnWorkspace) {
    throw new Error('instantPerceptionNode requires an active turn workspace')
  }

  const startedAtMs = now()
  const startedAt = new Date(startedAtMs).toISOString()
  const lifecycle = advanceTurnLifecycle(
    state.turnLifecycle,
    'forming'
  )

  const perceptionContext = await buildInstantPerceptionContext(state)
  const personaStartedAt = now()
  const personaPatch = await personaNode(state, perceptionContext)
  const workingState = { ...state, ...personaPatch }
  const personaStatus = {
    status: 'fulfilled',
    durationMs: now() - personaStartedAt,
    producedStateKeys: detectorStateKeys(personaPatch)
  }

  const completedAtMs = now()
  const instantPerception = {
    mode: 'persona_appraisal' as const,
    startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - startedAtMs,
    detectors: {
      persona: personaStatus
    },
    warnings: []
  }

  traceDecision('instantPerceptionNode', {
    title: '决策: instantPerceptionNode 人格与情绪感知完成',
    summary: `persona=${personaStatus.status}/${personaStatus.durationMs}ms`,
    data: instantPerception
  })

  traceArtifact('instantPerceptionNode', {
    title: '产物: instantPerceptionNode 感知快照',
    summary:
      `耗时 ${instantPerception.durationMs}ms，` +
      `输出 ${personaStatus.producedStateKeys.join(', ') || 'none'}`
  })

  return {
    ...personaPatch,
    turnLifecycle: lifecycle,
    turnWorkspace: workingState.turnWorkspace ?? state.turnWorkspace
  }
}
