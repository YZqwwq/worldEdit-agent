import type {
  ReasoningChannelMode,
  ReasoningProtocolPreference
} from '@share/cache/AItype/states/reasoningChannel'
import type { AgentLoopDirective } from '@share/cache/AItype/states/turnLifecycle'
import type { TurnWorkspace } from '@share/cache/AItype/states/turnWorkspace'

export const DEFAULT_MAX_MODEL_STEPS = 12
export const DEFAULT_MAX_CONSECUTIVE_EMPTY_RESPONSES = 2

export type AgentLoopTerminationCode = 'model_step_limit' | 'consecutive_empty_responses'

const LOOP_TERMINATION_NOTICES: Record<AgentLoopTerminationCode, string> = {
  model_step_limit:
    '这轮处理经过了较多次思考和工具调用，但仍未能形成可靠结论，因此已经停止。已经完成并持久化的操作会保留；你可以补充要求后重试。',
  consecutive_empty_responses:
    '模型连续没有返回有效内容，这轮处理已经停止。已经完成并持久化的操作会保留；你可以重试这条消息。'
}

export class AgentLoopTerminationError extends Error {
  readonly code: AgentLoopTerminationCode
  readonly userNotice: string
  turnWorkspace?: TurnWorkspace

  constructor(code: AgentLoopTerminationCode, detail: string) {
    super(detail)
    this.name = 'AgentLoopTerminationError'
    this.code = code
    this.userNotice = LOOP_TERMINATION_NOTICES[code]
  }
}

export const isAgentLoopTerminationError = (error: unknown): error is AgentLoopTerminationError =>
  error instanceof AgentLoopTerminationError ||
  (Boolean(error) &&
    typeof error === 'object' &&
    (error as { name?: unknown }).name === 'AgentLoopTerminationError' &&
    ['model_step_limit', 'consecutive_empty_responses'].includes(
      String((error as { code?: unknown }).code ?? '')
    ) &&
    typeof (error as { userNotice?: unknown }).userNotice === 'string')

export type ReasoningResponseShape = {
  reasoning: string
  content: string
  toolCallCount: number
}

export type ReasoningLoopDecision = {
  mode?: ReasoningChannelMode
  directive: AgentLoopDirective
  nativeReasoningText: string
  internalDraft: string
  consecutiveEmptyResponses: number
  isEmpty: boolean
}

export const buildNativeReasoningText = (
  mode: ReasoningChannelMode | undefined,
  response: Pick<ReasoningResponseShape, 'reasoning'>
): string => (mode === 'native' ? response.reasoning.trim() : '')

export const buildInternalDraft = (
  mode: ReasoningChannelMode | undefined,
  response: Pick<ReasoningResponseShape, 'content'>
): string => (mode === 'emulated' ? response.content.trim() : '')

export const assertModelStepAvailable = (
  completedSteps: number,
  maxSteps = DEFAULT_MAX_MODEL_STEPS
): void => {
  if (completedSteps >= maxSteps) {
    throw new AgentLoopTerminationError(
      'model_step_limit',
      `Agent model-step limit reached (${maxSteps}) before a final response was produced.`
    )
  }
}

const resolveMode = (
  lockedMode: ReasoningChannelMode | undefined,
  preference: ReasoningProtocolPreference,
  response: ReasoningResponseShape
): ReasoningChannelMode | undefined => {
  if (lockedMode) return lockedMode
  if (preference !== 'auto') return preference

  // An entirely empty response cannot reveal a provider's channel protocol.
  if (!response.reasoning && !response.content) return undefined
  return response.reasoning ? 'native' : 'emulated'
}

export const decideReasoningLoop = (input: {
  lockedMode?: ReasoningChannelMode
  preference?: ReasoningProtocolPreference
  response: ReasoningResponseShape
  previousConsecutiveEmptyResponses?: number
  maxConsecutiveEmptyResponses?: number
}): ReasoningLoopDecision => {
  const preference = input.preference ?? 'auto'
  const { response } = input
  const isEmpty =
    response.toolCallCount === 0 && !response.reasoning.trim() && !response.content.trim()
  const consecutiveEmptyResponses = isEmpty ? (input.previousConsecutiveEmptyResponses ?? 0) + 1 : 0
  const maxEmpty = input.maxConsecutiveEmptyResponses ?? DEFAULT_MAX_CONSECUTIVE_EMPTY_RESPONSES

  if (consecutiveEmptyResponses >= maxEmpty) {
    throw new AgentLoopTerminationError(
      'consecutive_empty_responses',
      `Agent received ${consecutiveEmptyResponses} consecutive empty model responses and stopped the turn.`
    )
  }

  const mode = resolveMode(input.lockedMode, preference, response)
  // Keep provider channels explicit. Native reasoning is a private reasoning
  // channel; emulated content is an internal draft consumed by expressionNode.
  const nativeReasoningText = buildNativeReasoningText(mode, response)
  const internalDraft = buildInternalDraft(mode, response)

  let directive: AgentLoopDirective
  if (response.toolCallCount > 0) directive = 'execute_tools'
  else if (mode === 'native' && response.content.trim()) directive = 'compose_final'
  else if (mode === 'emulated' && internalDraft) directive = 'compose_final'
  else directive = 'deliberate'

  return { mode, directive, nativeReasoningText, internalDraft, consecutiveEmptyResponses, isEmpty }
}
