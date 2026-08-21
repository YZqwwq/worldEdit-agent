import { traceArtifact, traceDecision, traceError } from '../../../../log/trace/agentTraceEmitter'
import { MessagesState, type InstantPerceptionDetectorStatus } from '../../state/messageState'
import { personaNode } from '../personanode/personanode'
import { buildInstantPerceptionContext } from './instantPerceptionContext'
import { shouldBypassInteractivePerception } from './instantPerceptionRouting'

type DetectorName = 'persona'

type DetectorResult = {
  name: DetectorName
  status: InstantPerceptionDetectorStatus
  patch: Partial<typeof MessagesState.State>
}

const detectorStateKeys = (patch: Partial<typeof MessagesState.State>): string[] =>
  Object.entries(patch)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key)

const now = (): number => Date.now()

const runDetector = async (
  name: DetectorName,
  run: () => Promise<Partial<typeof MessagesState.State>>
): Promise<DetectorResult> => {
  const startedAt = now()
  try {
    const patch = await run()
    const producedStateKeys = detectorStateKeys(patch)
    return {
      name,
      patch,
      status: {
        status: 'fulfilled',
        durationMs: now() - startedAt,
        producedStateKeys
      }
    }
  } catch (error) {
    traceError('instantPerceptionNode', error, {
      title: `异常: ${name} 瞬时感知失败`,
      summary: error instanceof Error ? error.message : String(error)
    })
    return {
      name,
      patch: {},
      status: {
        status: 'rejected',
        durationMs: now() - startedAt,
        producedStateKeys: [],
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

const skippedDetector = (name: DetectorName, reason: string): DetectorResult => ({
  name,
  patch: {},
  status: {
    status: 'skipped',
    durationMs: 0,
    producedStateKeys: [],
    skipReason: reason
  }
})

const mergeDetectorPatch = (
  target: Partial<typeof MessagesState.State>,
  patch: Partial<typeof MessagesState.State>
): void => {
  Object.assign(target, patch)
}

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

  if (shouldBypassInteractivePerception(state.backgroundPersonaStage)) {
    const reason = 'background_persona_stage_is_not_user_input'
    const persona = skippedDetector('persona', reason)
    const completedAtMs = now()
    const instantPerception = {
      mode: 'persona_appraisal' as const,
      startedAt,
      completedAt: new Date(completedAtMs).toISOString(),
      durationMs: completedAtMs - startedAtMs,
      detectors: {
        persona: persona.status
      },
      warnings: []
    }

    traceDecision('instantPerceptionNode', {
      title: '决策: 后台人格阶段跳过交互式感知',
      summary: '后台合成任务不会更新用户情绪或即时人格判断。',
      data: instantPerception
    })

    return { instantPerception }
  }

  const perceptionContext = await buildInstantPerceptionContext(state)
  let workingState = state

  const persona = await runDetector('persona', () => personaNode(workingState, perceptionContext))
  workingState = { ...workingState, ...persona.patch }

  const merged: Partial<typeof MessagesState.State> = {}
  mergeDetectorPatch(merged, persona.patch)
  merged.turnWorkspace = workingState.turnWorkspace

  const completedAtMs = now()
  const warnings = [persona]
    .filter((result) => result.status.status === 'rejected')
    .map((result) => `${result.name}: ${result.status.errorMessage || 'unknown error'}`)

  const instantPerception = {
    mode: 'persona_appraisal' as const,
    startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - startedAtMs,
    detectors: {
      persona: persona.status
    },
    warnings
  }

  traceDecision('instantPerceptionNode', {
    title: '决策: instantPerceptionNode 人格与情绪感知完成',
    summary: `persona=${persona.status.status}/${persona.status.durationMs}ms`,
    data: instantPerception
  })

  traceArtifact('instantPerceptionNode', {
    title: '产物: instantPerceptionNode 感知快照',
    summary:
      `耗时 ${instantPerception.durationMs}ms，` +
      `输出 ${[...persona.status.producedStateKeys].join(', ') || 'none'}`
  })

  return {
    ...merged,
    instantPerception
  }
}
