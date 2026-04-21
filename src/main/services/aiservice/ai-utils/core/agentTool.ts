import { DynamicStructuredTool, tool } from '@langchain/core/tools'
import { z } from 'zod'

export type AgentToolRiskLevel = 'low' | 'medium' | 'high'
export type AgentToolCompletionSemantics = 'definitive' | 'eventual'

export type AgentToolReceipt = {
  kind: string
  summary: string
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
}

export type AgentToolResultEnvelope<TData> = {
  ok: boolean
  data: TData | null
  error: {
    code: string
    message: string
  } | null
  message: string
  nextSuggestions: string[]
  receipt: AgentToolReceipt | null
  meta: {
    toolName: string
    timestamp: string
    riskLevel: AgentToolRiskLevel
    readOnly: boolean
    idempotent: boolean
    completionSemantics: AgentToolCompletionSemantics
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
  execute: (input: z.infer<TInputSchema>) => Promise<z.infer<TOutputSchema>> | z.infer<TOutputSchema>
  successMessage?: (
    data: z.infer<TOutputSchema>,
    input: z.infer<TInputSchema>
  ) => string
  buildReceipt?: (
    data: z.infer<TOutputSchema>,
    input: z.infer<TInputSchema>
  ) => AgentToolReceipt | undefined
  nextSuggestions?: (
    data: z.infer<TOutputSchema>,
    input: z.infer<TInputSchema>
  ) => string[]
  failureSuggestions?: string[]
}

export type AgentTool<
  TInputSchema extends z.ZodTypeAny = z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny = z.ZodTypeAny
> = DynamicStructuredTool & {
  agentMetadata: Required<
    Pick<AgentToolMetadata, 'riskLevel' | 'readOnly' | 'idempotent' | 'completionSemantics'>
  > &
    Omit<AgentToolMetadata, 'riskLevel' | 'readOnly' | 'idempotent' | 'completionSemantics'>
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

const normalizeMetadata = (metadata: AgentToolMetadata): AgentTool['agentMetadata'] => ({
  ...metadata,
  riskLevel: metadata.riskLevel ?? 'low',
  readOnly: metadata.readOnly ?? false,
  idempotent: metadata.idempotent ?? false,
  completionSemantics: metadata.completionSemantics ?? 'definitive'
})

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

const buildToolDescription = (description: string, metadata: AgentTool['agentMetadata']): string => {
  const lines = [description]

  if (metadata.whenToUse.length > 0) {
    lines.push(`Use when: ${metadata.whenToUse.join(' | ')}`)
  }
  if (metadata.whenNotToUse?.length) {
    lines.push(`Do not use when: ${metadata.whenNotToUse.join(' | ')}`)
  }

  lines.push(`Input: ${metadata.inputSummary}`)
  lines.push(`Output: ${metadata.outputSummary}`)

  return lines.join('\n')
}

const serializeEnvelope = <TData>(payload: AgentToolResultEnvelope<TData>): string =>
  JSON.stringify(payload, null, 2)

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const normalizeReceipt = (value: unknown): AgentToolReceipt | null => {
  if (!isRecord(value)) {
    return null
  }

  const kind = typeof value.kind === 'string' ? value.kind.trim() : ''
  const summary = typeof value.summary === 'string' ? value.summary.trim() : ''
  const payload =
    isRecord(value.payload) ? value.payload : undefined

  if (!kind || !summary) {
    return null
  }

  return {
    kind,
    summary,
    payload
  }
}

const buildSuccessEnvelope = <TData>(
  toolName: string,
  metadata: AgentTool['agentMetadata'],
  data: TData,
  message: string,
  nextSuggestions: string[],
  receipt?: AgentToolReceipt
): AgentToolResultEnvelope<TData> => ({
  ok: true,
  data,
  error: null,
  message,
  nextSuggestions,
  receipt: receipt ?? null,
  meta: {
    toolName,
    timestamp: new Date().toISOString(),
    riskLevel: metadata.riskLevel,
    readOnly: metadata.readOnly,
    idempotent: metadata.idempotent,
    completionSemantics: metadata.completionSemantics
  }
})

const buildFailureEnvelope = (
  toolName: string,
  metadata: AgentTool['agentMetadata'],
  code: string,
  message: string,
  nextSuggestions: string[]
): AgentToolResultEnvelope<null> => ({
  ok: false,
  data: null,
  error: {
    code,
    message
  },
  message: `${toolName} failed.`,
  nextSuggestions,
  receipt: null,
  meta: {
    toolName,
    timestamp: new Date().toISOString(),
    riskLevel: metadata.riskLevel,
    readOnly: metadata.readOnly,
    idempotent: metadata.idempotent,
    completionSemantics: metadata.completionSemantics
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
  const completionSemantics =
    meta?.completionSemantics === 'eventual' ? 'eventual' : 'definitive'

  if (!toolName || !timestamp) {
    return null
  }

  const error =
    isRecord(parsed.error) &&
    typeof parsed.error.code === 'string' &&
    typeof parsed.error.message === 'string'
      ? {
          code: parsed.error.code,
          message: parsed.error.message
        }
      : null

  return {
    ok: parsed.ok,
    data: (parsed.data ?? null) as TData | null,
    error,
    message: typeof parsed.message === 'string' ? parsed.message : '',
    nextSuggestions: Array.isArray(parsed.nextSuggestions)
      ? parsed.nextSuggestions.filter((item): item is string => typeof item === 'string')
      : [],
    receipt: normalizeReceipt(parsed.receipt),
    meta: {
      toolName,
      timestamp,
      riskLevel,
      readOnly,
      idempotent,
      completionSemantics
    }
  }
}

export function defineAgentTool<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny
>(options: DefineAgentToolOptions<TInputSchema, TOutputSchema>): AgentTool<TInputSchema, TOutputSchema> {
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
          buildFailureEnvelope(
            options.name,
            metadata,
            'INPUT_VALIDATION_FAILED',
            parsedInput.error.message,
            ['Adjust the tool arguments to match the required schema before retrying.']
          )
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
            buildFailureEnvelope(
              options.name,
              metadata,
              'OUTPUT_VALIDATION_FAILED',
              parsedOutput.error.message,
              DEFAULT_FAILURE_SUGGESTIONS
            )
          )
        }

        const message =
          options.successMessage?.(parsedOutput.data, parsedInput.data) ??
          `${options.name} completed successfully.`
        const nextSuggestions = options.nextSuggestions?.(parsedOutput.data, parsedInput.data) ?? []
        const receipt = options.buildReceipt?.(parsedOutput.data, parsedInput.data)

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
            receipt
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

        return serializeEnvelope(
          buildFailureEnvelope(
            options.name,
            metadata,
            'TOOL_EXECUTION_FAILED',
            toErrorMessage(error),
            options.failureSuggestions ?? DEFAULT_FAILURE_SUGGESTIONS
          )
        )
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
