import { traceArtifact, traceDecision, traceError } from '../../../../log/trace/agentTraceEmitter'
import { MessagesState, type InstantPerceptionDetectorStatus } from '../../state/messageState'
import { personaNode } from '../personanode/personanode'
import { worldFocusNode } from '../worldfocusnode/worldFocusNode'

type DetectorName = 'worldFocus' | 'persona'

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

const mergeDetectorPatch = (
  target: Partial<typeof MessagesState.State>,
  patch: Partial<typeof MessagesState.State>
): void => {
  Object.assign(target, patch)
}

/**
 * InstantPerceptionNode: 本轮即时感知 DAG 的编排层。
 *
 * 第一版采用“并行基础 detector + 统一 merge”的形态：
 * - worldFocusNode: 识别世界观/实体焦点，并补充人物印象状态。
 * - personaNode: 识别人格偏好、AI 侧情绪和表达策略。
 *
 * 后续可以在这里继续挂载 task intent、memory need、tool need 等 detector，
 * 但 detector 不应执行重型阅读、长推理或持久写入类任务。
 */
export async function instantPerceptionNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const startedAtMs = now()
  const startedAt = new Date(startedAtMs).toISOString()

  const [worldFocus, persona] = await Promise.all([
    runDetector('worldFocus', () => worldFocusNode(state)),
    runDetector('persona', () => personaNode(state))
  ])

  const merged: Partial<typeof MessagesState.State> = {}
  mergeDetectorPatch(merged, worldFocus.patch)
  mergeDetectorPatch(merged, persona.patch)

  const completedAtMs = now()
  const warnings = [worldFocus, persona]
    .filter((result) => result.status.status === 'rejected')
    .map((result) => `${result.name}: ${result.status.errorMessage || 'unknown error'}`)

  const instantPerception = {
    mode: 'parallel_dag' as const,
    startedAt,
    completedAt: new Date(completedAtMs).toISOString(),
    durationMs: completedAtMs - startedAtMs,
    detectors: {
      worldFocus: worldFocus.status,
      persona: persona.status
    },
    warnings
  }

  traceDecision('instantPerceptionNode', {
    title: '决策: instantPerceptionNode 并行感知完成',
    summary:
      `worldFocus=${worldFocus.status.status}/${worldFocus.status.durationMs}ms，` +
      `persona=${persona.status.status}/${persona.status.durationMs}ms`,
    data: instantPerception
  })

  traceArtifact('instantPerceptionNode', {
    title: '产物: instantPerceptionNode 感知快照',
    summary:
      `耗时 ${instantPerception.durationMs}ms，` +
      `输出 ${[...worldFocus.status.producedStateKeys, ...persona.status.producedStateKeys].join(', ') || 'none'}`
  })

  return {
    ...merged,
    instantPerception
  }
}
