import { DynamicStructuredTool, tool } from '@langchain/core/tools'
import { z } from 'zod'

export type AgentToolRiskLevel = 'low' | 'medium' | 'high'
export type AgentToolCompletionSemantics = 'definitive' | 'eventual'
export type AgentToolCompletionState =
  | 'accepted'
  | 'running'
  | 'awaiting_input'
  | 'completed'
  | 'failed'
export type AgentToolContextRetention = 'evidence' | 'ephemeral' | 'none'

export type AgentToolErrorCode =
  | 'INVALID_TOOL_INPUT'
  | 'INVALID_TOOL_OUTPUT'
  | 'TOOL_NOT_AVAILABLE'
  | 'CALL_LIMIT_REACHED'
  | 'NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'PERMISSION_DENIED'
  | 'CONFIRMATION_REQUIRED'
  | 'CONFIRMATION_EXPIRED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'TEMPORARY_UNAVAILABLE'
  | 'INTERNAL_ERROR'

export type AgentToolErrorPayload = {
  code: AgentToolErrorCode
  message: string
  retryable: boolean
  details?: Record<string, unknown>
  nextSuggestions?: string[]
}

export class AgentToolError extends Error {
  readonly code: AgentToolErrorCode
  readonly retryable: boolean
  readonly details?: Record<string, unknown>
  readonly nextSuggestions: string[]

  constructor(payload: AgentToolErrorPayload) {
    super(payload.message)
    this.name = 'AgentToolError'
    this.code = payload.code
    this.retryable = payload.retryable
    this.details = payload.details
    this.nextSuggestions = payload.nextSuggestions ?? []
  }
}

export type AgentToolUiStage = {
  label: string
  runningLabel?: string
  doneLabel?: string
  errorLabel?: string
}

export type AgentToolReceipt = {
  kind: string
  operation?: string
  subject?: {
    type: string
    id?: string
    label?: string
  }
  completion?: 'complete' | 'partial' | 'failed'
  summary: string
  retryable?: boolean
  evidenceRef?: string
  payload?: Record<string, unknown>
}

export interface AgentToolMetadata {
  whenToUse: string[]
  whenNotToUse?: string[]
  inputSummary: string
  outputSummary: string
  usageContract?: string[]
  examples?: string[]
  riskLevel?: AgentToolRiskLevel
  readOnly?: boolean
  idempotent?: boolean
  completionSemantics?: AgentToolCompletionSemantics
  contextRetention?: AgentToolContextRetention
  uiStage?: AgentToolUiStage
}

export type AgentToolResultEnvelope<TData> = {
  ok: boolean
  data: TData | null
  modelResult: unknown
  error: {
    code: AgentToolErrorCode
    message: string
    retryable: boolean
    details?: Record<string, unknown>
  } | null
  message: string
  nextSuggestions: string[]
  receipt: AgentToolReceipt | null
  completion: {
    semantics: AgentToolCompletionSemantics
    state: AgentToolCompletionState
    final: boolean
  }
  meta: {
    toolName: string
    timestamp: string
    riskLevel: AgentToolRiskLevel
    readOnly: boolean
    idempotent: boolean
    completionSemantics: AgentToolCompletionSemantics
    contextRetention: AgentToolContextRetention
  }
}

type DefineAgentToolOptions<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny
> = {
  name: string
  description: string
  inputSchema: TInputSchema
  outputSchema: TOutputSchema
  metadata: AgentToolMetadata
  execute: (
    input: z.infer<TInputSchema>
  ) => Promise<z.infer<TOutputSchema>> | z.infer<TOutputSchema>
  successMessage?: (data: z.infer<TOutputSchema>, input: z.infer<TInputSchema>) => string
  buildReceipt?: (
    data: z.infer<TOutputSchema>,
    input: z.infer<TInputSchema>
  ) => AgentToolReceipt | undefined
  buildModelResult?: (data: z.infer<TOutputSchema>, input: z.infer<TInputSchema>) => unknown
  resolveCompletionState?: (
    data: z.infer<TOutputSchema>,
    input: z.infer<TInputSchema>
  ) => AgentToolCompletionState
  nextSuggestions?: (data: z.infer<TOutputSchema>, input: z.infer<TInputSchema>) => string[]
  failureSuggestions?: string[]
}

export type AgentTool<
  TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny = z.ZodTypeAny
> = DynamicStructuredTool & {
  agentMetadata: Required<
    Pick<
      AgentToolMetadata,
      'riskLevel' | 'readOnly' | 'idempotent' | 'completionSemantics' | 'contextRetention'
    >
  > &
    Omit<
      AgentToolMetadata,
      'riskLevel' | 'readOnly' | 'idempotent' | 'completionSemantics' | 'contextRetention'
    >
  baseDescription: string
  inputSchema: TInputSchema
  outputSchema: TOutputSchema
}

const DEFAULT_FAILURE_SUGGESTIONS = [
  'Check whether the current request matches this tool before retrying.',
  'If the tool keeps failing, explain the limitation to the user instead of guessing.'
]

const logAgentToolTrace = (input: {
  toolName: string
  stage: string
  message: string
  data?: Record<string, unknown>
}): void => {
  void input
}

const normalizeMetadata = (metadata: AgentToolMetadata): AgentTool['agentMetadata'] => {
  const readOnly = metadata.readOnly ?? false
  return {
    ...metadata,
    riskLevel: metadata.riskLevel ?? 'low',
    readOnly,
    idempotent: metadata.idempotent ?? false,
    completionSemantics: metadata.completionSemantics ?? 'definitive',
    contextRetention: metadata.contextRetention ?? (readOnly ? 'evidence' : 'ephemeral')
  }
}

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

const buildToolDescription = (
  description: string,
  metadata: AgentTool['agentMetadata']
): string => {
  const lines = [description]

  if (metadata.whenToUse.length > 0) {
    lines.push(`Use when: ${metadata.whenToUse.join(' | ')}`)
  }
  if (metadata.whenNotToUse?.length) {
    lines.push(`Do not use when: ${metadata.whenNotToUse.join(' | ')}`)
  }

  lines.push(`Input: ${metadata.inputSummary}`)
  lines.push(`Output: ${metadata.outputSummary}`)
  if (metadata.usageContract?.length) {
    lines.push(`Rules: ${metadata.usageContract.join(' | ')}`)
  }
  if (metadata.examples?.length) {
    lines.push(`Examples: ${metadata.examples.join(' | ')}`)
  }
  lines.push(`Completion semantics: ${metadata.completionSemantics}`)
  if (metadata.completionSemantics === 'eventual') {
    lines.push(
      'Completion rule: a successful call may only accept or advance work; do not claim the task is finished unless completion.state is completed.'
    )
  }
  lines.push(`Context retention: ${metadata.contextRetention}`)

  return lines.join('\n')
}

const serializeEnvelope = <TData>(payload: AgentToolResultEnvelope<TData>): string =>
  JSON.stringify(payload, null, 2)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const normalizeErrorDetails = (error: Record<string, unknown>): Record<string, unknown> => {
  const ignoredKeys = new Set(['name', 'message', 'stack', 'code', 'retryable', 'nextSuggestions'])
  const normalized = Object.fromEntries(
    Object.entries(error).filter(
      ([key, value]) =>
        key !== 'details' &&
        !ignoredKeys.has(key) &&
        value !== undefined &&
        typeof value !== 'function'
    )
  )
  return isRecord(error.details) ? { ...normalized, ...error.details } : normalized
}

const classifyToolError = (
  error: unknown,
  fallbackSuggestions: string[]
): AgentToolErrorPayload => {
  if (error instanceof AgentToolError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      details: error.details,
      nextSuggestions:
        error.nextSuggestions.length > 0 ? error.nextSuggestions : fallbackSuggestions
    }
  }

  if (isRecord(error) && typeof error.code === 'string') {
    const details = normalizeErrorDetails(error)
    if (error.code === 'DOCUMENT_REVISION_CONFLICT') {
      return {
        code: 'REVISION_CONFLICT',
        message: toErrorMessage(error),
        retryable: true,
        details,
        nextSuggestions: [
          '重新读取目标文档获取最新 revision 和正文。',
          '基于最新版本重新生成修改后再提交。'
        ]
      }
    }

    const knownCodes: Partial<Record<string, AgentToolErrorCode>> = {
      INVALID_TOOL_INPUT: 'INVALID_TOOL_INPUT',
      NOT_FOUND: 'NOT_FOUND',
      PERMISSION_DENIED: 'PERMISSION_DENIED',
      CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
      CONFIRMATION_EXPIRED: 'CONFIRMATION_EXPIRED',
      RATE_LIMITED: 'RATE_LIMITED',
      TIMEOUT: 'TIMEOUT',
      TEMPORARY_UNAVAILABLE: 'TEMPORARY_UNAVAILABLE'
    }
    const mappedCode = knownCodes[error.code]
    if (mappedCode) {
      return {
        code: mappedCode,
        message: toErrorMessage(error),
        retryable:
          typeof error.retryable === 'boolean'
            ? error.retryable
            : mappedCode === 'INVALID_TOOL_INPUT' ||
              mappedCode === 'TIMEOUT' ||
              mappedCode === 'RATE_LIMITED' ||
              mappedCode === 'TEMPORARY_UNAVAILABLE',
        details,
        nextSuggestions: fallbackSuggestions
      }
    }
  }

  return {
    code: 'INTERNAL_ERROR',
    message: toErrorMessage(error),
    retryable: false,
    nextSuggestions: fallbackSuggestions
  }
}

const normalizeReceipt = (value: unknown): AgentToolReceipt | null => {
  if (!isRecord(value)) {
    return null
  }

  const kind = typeof value.kind === 'string' ? value.kind.trim() : ''
  const operation = typeof value.operation === 'string' ? value.operation.trim() : undefined
  const summary = typeof value.summary === 'string' ? value.summary.trim() : ''
  const subjectValue = isRecord(value.subject) ? value.subject : undefined
  const subjectType = typeof subjectValue?.type === 'string' ? subjectValue.type.trim() : ''
  const subject = subjectType
    ? {
        type: subjectType,
        id: typeof subjectValue?.id === 'string' ? subjectValue.id : undefined,
        label: typeof subjectValue?.label === 'string' ? subjectValue.label : undefined
      }
    : undefined
  const completion =
    value.completion === 'complete' ||
    value.completion === 'partial' ||
    value.completion === 'failed'
      ? value.completion
      : undefined
  const retryable = typeof value.retryable === 'boolean' ? value.retryable : undefined
  const evidenceRef = typeof value.evidenceRef === 'string' ? value.evidenceRef : undefined
  const payload = isRecord(value.payload) ? value.payload : undefined

  if (!kind || !summary) {
    return null
  }

  return {
    kind,
    operation,
    subject,
    completion,
    summary,
    retryable,
    evidenceRef,
    payload
  }
}

const buildSuccessEnvelope = <TData>(
  toolName: string,
  metadata: AgentTool['agentMetadata'],
  data: TData,
  message: string,
  nextSuggestions: string[],
  receipt: AgentToolReceipt | undefined,
  modelResult: unknown,
  completionState: AgentToolCompletionState
): AgentToolResultEnvelope<TData> => ({
  ok: true,
  data,
  modelResult,
  error: null,
  message,
  nextSuggestions,
  receipt: receipt ?? null,
  completion: {
    semantics: metadata.completionSemantics,
    state: completionState,
    final: completionState === 'completed' || completionState === 'failed'
  },
  meta: {
    toolName,
    timestamp: new Date().toISOString(),
    riskLevel: metadata.riskLevel,
    readOnly: metadata.readOnly,
    idempotent: metadata.idempotent,
    completionSemantics: metadata.completionSemantics,
    contextRetention: metadata.contextRetention
  }
})

const buildFailureEnvelope = (
  toolName: string,
  metadata: AgentTool['agentMetadata'],
  error: AgentToolErrorPayload
): AgentToolResultEnvelope<null> => ({
  ok: false,
  data: null,
  modelResult: {
    ok: false,
    toolName,
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      details: error.details
    },
    nextSuggestions: error.nextSuggestions ?? []
  },
  error: {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    details: error.details
  },
  message: `${toolName} failed.`,
  nextSuggestions: error.nextSuggestions ?? [],
  receipt: null,
  completion: {
    semantics: metadata.completionSemantics,
    state: 'failed',
    final: true
  },
  meta: {
    toolName,
    timestamp: new Date().toISOString(),
    riskLevel: metadata.riskLevel,
    readOnly: metadata.readOnly,
    idempotent: metadata.idempotent,
    completionSemantics: metadata.completionSemantics,
    contextRetention: metadata.contextRetention
  }
})

export function parseAgentToolResultEnvelope<TData = unknown>(
  input: unknown
): AgentToolResultEnvelope<TData> | null {
  const parsed =
    typeof input === 'string'
      ? (() => {
          try {
            return JSON.parse(input)
          } catch {
            return null
          }
        })()
      : input

  if (!isRecord(parsed)) {
    return null
  }

  if (typeof parsed.ok !== 'boolean') {
    return null
  }

  const meta = isRecord(parsed.meta) ? parsed.meta : null
  const toolName = typeof meta?.toolName === 'string' ? meta.toolName.trim() : ''
  const timestamp = typeof meta?.timestamp === 'string' ? meta.timestamp.trim() : ''
  const riskLevel =
    meta?.riskLevel === 'low' || meta?.riskLevel === 'medium' || meta?.riskLevel === 'high'
      ? meta.riskLevel
      : 'low'
  const readOnly = typeof meta?.readOnly === 'boolean' ? meta.readOnly : false
  const idempotent = typeof meta?.idempotent === 'boolean' ? meta.idempotent : false
  const completionSemantics = meta?.completionSemantics === 'eventual' ? 'eventual' : 'definitive'
  const contextRetention =
    meta?.contextRetention === 'evidence' ||
    meta?.contextRetention === 'ephemeral' ||
    meta?.contextRetention === 'none'
      ? meta.contextRetention
      : 'ephemeral'
  const completionValue = isRecord(parsed.completion) ? parsed.completion : null
  const completionState: AgentToolCompletionState =
    completionValue?.state === 'accepted' ||
    completionValue?.state === 'running' ||
    completionValue?.state === 'awaiting_input' ||
    completionValue?.state === 'completed' ||
    completionValue?.state === 'failed'
      ? completionValue.state
      : parsed.ok
        ? completionSemantics === 'eventual'
          ? 'accepted'
          : 'completed'
        : 'failed'

  if (!toolName || !timestamp) {
    return null
  }

  const error =
    isRecord(parsed.error) &&
    typeof parsed.error.code === 'string' &&
    typeof parsed.error.message === 'string'
      ? {
          code: parsed.error.code as AgentToolErrorCode,
          message: parsed.error.message,
          retryable: typeof parsed.error.retryable === 'boolean' ? parsed.error.retryable : false,
          details: isRecord(parsed.error.details) ? parsed.error.details : undefined
        }
      : null

  return {
    ok: parsed.ok,
    data: (parsed.data ?? null) as TData | null,
    modelResult: parsed.modelResult ?? parsed.data ?? null,
    error,
    message: typeof parsed.message === 'string' ? parsed.message : '',
    nextSuggestions: Array.isArray(parsed.nextSuggestions)
      ? parsed.nextSuggestions.filter((item): item is string => typeof item === 'string')
      : [],
    receipt: normalizeReceipt(parsed.receipt),
    completion: {
      semantics: completionSemantics,
      state: completionState,
      final: completionState === 'completed' || completionState === 'failed'
    },
    meta: {
      toolName,
      timestamp,
      riskLevel,
      readOnly,
      idempotent,
      completionSemantics,
      contextRetention
    }
  }
}

const serializeAgentToolModelValue = (value: unknown): string => {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export const buildAgentToolModelMessage = (
  toolName: string,
  envelope: AgentToolResultEnvelope<unknown> | null,
  fallbackResult: unknown
): string => {
  if (!envelope) {
    return serializeAgentToolModelValue({
      toolName,
      message: 'Tool returned a non-standard result.',
      result: fallbackResult
    })
  }

  return serializeAgentToolModelValue({
    ok: envelope.ok,
    toolName,
    message: envelope.ok ? undefined : envelope.message,
    error: envelope.error,
    receipt: envelope.receipt,
    result: envelope.modelResult,
    nextSuggestions: envelope.nextSuggestions,
    completion: envelope.completion
  })
}

export function defineAgentTool<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny
>(
  options: DefineAgentToolOptions<TInputSchema, TOutputSchema>
): AgentTool<TInputSchema, TOutputSchema> {
  const metadata = normalizeMetadata(options.metadata)

  const wrappedTool = tool(
    async (rawInput) => {
      logAgentToolTrace({
        toolName: options.name,
        stage: 'invoke_start',
        message: 'Tool wrapper invoked.',
        data: {
          hasRawInput: rawInput != null
        }
      })

      const parsedInput = options.inputSchema.safeParse(rawInput ?? {})
      if (!parsedInput.success) {
        logAgentToolTrace({
          toolName: options.name,
          stage: 'input_validation_failed',
          message: 'Tool input validation failed.',
          data: {
            error: parsedInput.error.message
          }
        })

        return serializeEnvelope(
          buildFailureEnvelope(options.name, metadata, {
            code: 'INVALID_TOOL_INPUT',
            message: parsedInput.error.message,
            retryable: true,
            details: { issues: parsedInput.error.issues },
            nextSuggestions: [
              'Adjust the tool arguments to match the required schema before retrying.'
            ]
          })
        )
      }

      try {
        logAgentToolTrace({
          toolName: options.name,
          stage: 'execute_start',
          message: 'Entering tool execute().'
        })

        const rawOutput = await options.execute(parsedInput.data)
        logAgentToolTrace({
          toolName: options.name,
          stage: 'execute_success',
          message: 'Tool execute() completed successfully.'
        })

        const parsedOutput = options.outputSchema.safeParse(rawOutput)

        if (!parsedOutput.success) {
          logAgentToolTrace({
            toolName: options.name,
            stage: 'output_validation_failed',
            message: 'Tool output validation failed.',
            data: {
              error: parsedOutput.error.message
            }
          })

          return serializeEnvelope(
            buildFailureEnvelope(options.name, metadata, {
              code: 'INVALID_TOOL_OUTPUT',
              message: parsedOutput.error.message,
              retryable: false,
              details: { issues: parsedOutput.error.issues },
              nextSuggestions: DEFAULT_FAILURE_SUGGESTIONS
            })
          )
        }

        const message =
          options.successMessage?.(parsedOutput.data, parsedInput.data) ??
          `${options.name} completed successfully.`
        const nextSuggestions = options.nextSuggestions?.(parsedOutput.data, parsedInput.data) ?? []
        const receipt = options.buildReceipt?.(parsedOutput.data, parsedInput.data)
        const modelResult = options.buildModelResult
          ? options.buildModelResult(parsedOutput.data, parsedInput.data)
          : metadata.readOnly
            ? parsedOutput.data
            : {
                ok: true,
                toolName: options.name,
                message,
                receipt: receipt ?? null,
                nextSuggestions
              }
        const completionState = options.resolveCompletionState
          ? options.resolveCompletionState(parsedOutput.data, parsedInput.data)
          : metadata.completionSemantics === 'eventual'
            ? 'accepted'
            : 'completed'

        if (metadata.completionSemantics === 'definitive' && completionState !== 'completed') {
          return serializeEnvelope(
            buildFailureEnvelope(options.name, metadata, {
              code: 'INVALID_TOOL_OUTPUT',
              message: `Definitive tool "${options.name}" must resolve as completed.`,
              retryable: false,
              details: { completionState },
              nextSuggestions: DEFAULT_FAILURE_SUGGESTIONS
            })
          )
        }

        logAgentToolTrace({
          toolName: options.name,
          stage: 'envelope_success',
          message: 'Building success envelope for tool result.',
          data: {
            hasReceipt: Boolean(receipt),
            receiptKind: receipt?.kind ?? null,
            completionSemantics: metadata.completionSemantics
          }
        })

        return serializeEnvelope(
          buildSuccessEnvelope(
            options.name,
            metadata,
            parsedOutput.data,
            message,
            nextSuggestions,
            receipt,
            modelResult,
            completionState
          )
        )
      } catch (error) {
        logAgentToolTrace({
          toolName: options.name,
          stage: 'execute_error',
          message: 'Tool execute() threw an error.',
          data: {
            error: toErrorMessage(error)
          }
        })

        const classifiedError = classifyToolError(
          error,
          options.failureSuggestions ?? DEFAULT_FAILURE_SUGGESTIONS
        )
        return serializeEnvelope(buildFailureEnvelope(options.name, metadata, classifiedError))
      }
    },
    {
      name: options.name,
      description: buildToolDescription(options.description, metadata),
      schema: options.inputSchema
    }
  )

  return Object.assign(wrappedTool, {
    agentMetadata: metadata,
    baseDescription: options.description,
    inputSchema: options.inputSchema,
    outputSchema: options.outputSchema
  })
}

export function isAgentTool(value: unknown): value is AgentTool {
  return Boolean(
    value &&
      typeof value === 'object' &&
      'agentMetadata' in value &&
      'inputSchema' in value &&
      'outputSchema' in value
  )
}
