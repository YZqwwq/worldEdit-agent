import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { ActiveTaskSnapshot } from '@share/cache/AItype/states/taskLifecycleState'
import { contentToText } from '../../../messageoutput/transformRespones'
import { toErrorMessage } from '../../../../../../share/utils/error/error'
import { getQuickModel } from '../../../agentrsystem/modelwithtool/quick-base-model'
import { traceDecision } from '../../../../log/trace/agentTraceEmitter'
import { characterEditorPendingContextSchema } from '../../../ai-utils/tools/character/shared'

const OBVIOUS_TASK_CANCEL_PATTERNS = [
  /取消/,
  /不用了/,
  /先这样/,
  /停止/,
  /算了/,
  /不做了/,
  /结束这个任务/,
  /不用继续/,
  /cancel/i
]

const TASK_STATUS_QUERY_PATTERNS = [
  /进度/,
  /怎么样/,
  /到哪/,
  /卡在哪/,
  /还差什么/,
  /需要什么/,
  /缺什么/,
  /什么情况/,
  /为什么/,
  /status/i,
  /what.*need/i
]

const NON_CONTINUATION_PATTERNS = [
  /^好(的)?$/i,
  /^收到$/i,
  /^谢谢(你)?$/i,
  /^thanks?$/i,
  /^ok$/i,
  /^okay$/i,
  /^嗯+$/i,
  /^啊+$/i,
  /^哦+$/i,
  /^？+$/,
  /^\?+$/
]

const awaitingUserInputDecisionSchema = z.object({
  decision: z.object({
    type: z.enum(['continue_task', 'cancel_task', 'ask_status', 'clarify']),
    confidence: z.number().min(0).max(1),
    reason: z.string().trim().min(1).max(300)
  })
})

type AwaitingUserInputDecisionResult = z.infer<typeof awaitingUserInputDecisionSchema>

export type AwaitingUserInputDecisionType = AwaitingUserInputDecisionResult['decision']['type']

export type AwaitingUserInputDecision = {
  type: AwaitingUserInputDecisionType
  confidence: number
  reason: string
  source: 'rule' | 'quick_model' | 'fallback'
}

type AwaitingUserInputNeed = {
  missingFields: string[]
  waitingSummary: string
  guidanceMessage: string
  lastPrompt?: string
}

const extractJsonObject = (text: string): string | null => {
  const trimmed = text.trim()
  if (!trimmed) return null

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) return fencedMatch[1].trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return trimmed.slice(start, end + 1)
}

const matchesAnyPattern = (text: string, patterns: RegExp[]): boolean =>
  patterns.some((pattern) => pattern.test(text))

const parseCharacterEditorNeed = (
  pendingContext: Record<string, unknown>
): AwaitingUserInputNeed | null => {
  const parsed = characterEditorPendingContextSchema.safeParse(pendingContext)
  if (!parsed.success) {
    return null
  }

  const context = parsed.data
  const lastPrompt = context.lastNeedsInputMessage?.trim() || undefined

  if (context.phase === 'resolve_world') {
    return {
      missingFields: ['worldName'],
      waitingSummary: '当前还缺少明确的世界观名称。',
      guidanceMessage:
        lastPrompt ||
        '我现在需要你提供这个角色所属的世界观名称，拿到世界名后才能继续续跑。',
      lastPrompt
    }
  }

  if (context.phase === 'resolve_character') {
    return {
      missingFields: ['characterName'],
      waitingSummary: '当前还缺少明确的角色名称或更具体的角色信息。',
      guidanceMessage:
        lastPrompt ||
        '我现在需要你提供明确的角色名称，或者补充足够区分同名角色的信息，拿到后才能继续续跑。',
      lastPrompt
    }
  }

  return {
    missingFields: [],
    waitingSummary: '当前还需要更多修改信息，任务才能继续。',
    guidanceMessage:
      lastPrompt || '我现在还需要更明确的补充信息，拿到后才能继续当前任务。',
    lastPrompt
  }
}

const describeAwaitingNeed = (
  activeTask: Pick<ActiveTaskSnapshot, 'executorKind' | 'title'>,
  pendingContext: Record<string, unknown>
): AwaitingUserInputNeed => {
  if (activeTask.executorKind === 'character_editor') {
    const characterNeed = parseCharacterEditorNeed(pendingContext)
    if (characterNeed) {
      return characterNeed
    }
  }

  const lastPrompt =
    typeof pendingContext.lastNeedsInputMessage === 'string'
      ? pendingContext.lastNeedsInputMessage.trim()
      : ''

  return {
    missingFields: [],
    waitingSummary: `任务「${activeTask.title}」当前仍在等待补充信息。`,
    guidanceMessage: lastPrompt || `任务「${activeTask.title}」还需要更多信息才能继续。`,
    lastPrompt: lastPrompt || undefined
  }
}

const inferByRule = (userInput: string): AwaitingUserInputDecision | null => {
  const trimmed = userInput.trim()
  if (!trimmed) {
    return {
      type: 'clarify',
      confidence: 0.98,
      reason: '空输入不能安全续跑任务。',
      source: 'rule'
    }
  }

  if (matchesAnyPattern(trimmed, OBVIOUS_TASK_CANCEL_PATTERNS)) {
    return {
      type: 'cancel_task',
      confidence: 0.95,
      reason: '命中了显式取消表达。',
      source: 'rule'
    }
  }

  if (matchesAnyPattern(trimmed, TASK_STATUS_QUERY_PATTERNS)) {
    return {
      type: 'ask_status',
      confidence: 0.9,
      reason: '命中了任务进度或缺失信息查询表达。',
      source: 'rule'
    }
  }

  if (matchesAnyPattern(trimmed, NON_CONTINUATION_PATTERNS)) {
    return {
      type: 'clarify',
      confidence: 0.88,
      reason: '命中了闲聊或空泛反馈表达，不应直接续跑。',
      source: 'rule'
    }
  }

  return null
}

const buildPrompt = (input: {
  userInput: string
  activeTask: Pick<ActiveTaskSnapshot, 'id' | 'title' | 'status' | 'executorKind'>
  pendingContext: Record<string, unknown>
  need: AwaitingUserInputNeed
}): string => `你是主代理在 awaiting_user_input 状态下的安全分流节点。

目标：
判断用户最新输入是否可以安全进入 continuation 续跑链路。

当前任务：
${JSON.stringify(input.activeTask, null, 2)}

当前 pendingContext：
${JSON.stringify(input.pendingContext, null, 2)}

当前等待信息摘要：
${JSON.stringify(input.need, null, 2)}

用户最新输入：
${input.userInput}

可选决策：
- continue_task
- cancel_task
- ask_status
- clarify

强规则：
1. 只有在用户输入直接提供了当前缺失信息、纠正信息、或能安全写回 continuation payload 时，才能返回 continue_task。
2. 如果用户是在问进度、问为什么卡住、问还缺什么、问现在在等什么，返回 ask_status。
3. 如果用户明显想停止、放弃、取消当前任务，返回 cancel_task。
4. 如果用户只是闲聊、模糊反馈、语义不清、或你不确定能否安全续跑，返回 clarify。
5. 不确定时，必须保守返回 clarify，不能返回 continue_task。

只输出 JSON：
{
  "decision": {
    "type": "clarify",
    "confidence": 0.82,
    "reason": "一句简短原因"
  }
}`

const inferWithModel = async (input: {
  userInput: string
  activeTask: Pick<ActiveTaskSnapshot, 'id' | 'title' | 'status' | 'executorKind'>
  pendingContext: Record<string, unknown>
  need: AwaitingUserInputNeed
}): Promise<AwaitingUserInputDecision> => {
  const model = await getQuickModel()
  const response = await model.invoke(
    [
      new SystemMessage('你只负责输出合法 JSON。'),
      new HumanMessage(buildPrompt(input))
    ],
    { signal: AbortSignal.timeout(8000) } as Record<string, unknown>
  )
  const text = contentToText(response.content)
  const jsonText = extractJsonObject(text)
  if (!jsonText) {
    throw new Error('Awaiting-user-input model did not return valid JSON')
  }

  const parsed = awaitingUserInputDecisionSchema.parse(JSON.parse(jsonText))
  return {
    type: parsed.decision.type,
    confidence: parsed.decision.confidence,
    reason: parsed.decision.reason,
    source: 'quick_model'
  }
}

const inferFallback = (): AwaitingUserInputDecision => ({
  type: 'clarify',
  confidence: 0.2,
  reason: '分类失败时保守回退为不续跑。',
  source: 'fallback'
})

export const matchesObviousTaskCancellation = (text: string): boolean =>
  matchesAnyPattern(text.trim(), OBVIOUS_TASK_CANCEL_PATTERNS)

export const buildAwaitingUserInputStatusMessage = (input: {
  activeTask: Pick<ActiveTaskSnapshot, 'title' | 'executorKind'>
  pendingContext: Record<string, unknown>
}): string => {
  const need = describeAwaitingNeed(input.activeTask, input.pendingContext)
  return (
    `任务「${input.activeTask.title}」目前还没有继续执行。${need.waitingSummary}` +
    ` ${need.guidanceMessage}`
  )
}

export const buildAwaitingUserInputClarifyMessage = (input: {
  activeTask: Pick<ActiveTaskSnapshot, 'title' | 'executorKind'>
  pendingContext: Record<string, unknown>
}): string => {
  const need = describeAwaitingNeed(input.activeTask, input.pendingContext)
  const hint =
    need.missingFields.length > 0
      ? `当前建议优先补充：${need.missingFields.join('、')}。`
      : '如果你想继续，请直接补充当前缺失的信息。'

  return (
    `我先不继续续跑任务「${input.activeTask.title}」，因为这条消息还不像可直接写入的补充信息。` +
    ` ${need.guidanceMessage} ${hint} 如果你是想取消当前任务，也可以直接明确说“取消任务”。`
  )
}

class AwaitingUserInputNode {
  async resolve(input: {
    userInput: string
    activeTask: Pick<ActiveTaskSnapshot, 'id' | 'title' | 'status' | 'executorKind'>
    pendingContext: Record<string, unknown>
  }): Promise<AwaitingUserInputDecision> {
    const ruleDecision = inferByRule(input.userInput)
    if (ruleDecision) {
      traceDecision('awaitingUserInputNode', {
        summary: `规则识别为 ${ruleDecision.type}`,
        data: {
          stage: 'awaiting_user_input_decision',
          source: ruleDecision.source,
          decision: ruleDecision
        }
      })
      return ruleDecision
    }

    const need = describeAwaitingNeed(input.activeTask, input.pendingContext)

    try {
      const inferred = await inferWithModel({
        ...input,
        need
      })
      traceDecision('awaitingUserInputNode', {
        summary: `quick model 识别为 ${inferred.type}`,
        data: {
          stage: 'awaiting_user_input_decision',
          source: inferred.source,
          decision: inferred
        }
      })
      return inferred
    } catch (error) {
      const fallback = inferFallback()
      traceDecision('awaitingUserInputNode', {
        summary: `quick model 失败，回退为 ${fallback.type}`,
        data: {
          stage: 'awaiting_user_input_decision',
          source: fallback.source,
          reason: toErrorMessage(error),
          decision: fallback
        }
      })
      return fallback
    }
  }
}

export const awaitingUserInputNode = new AwaitingUserInputNode()
