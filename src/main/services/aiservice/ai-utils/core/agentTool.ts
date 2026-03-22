import { DynamicStructuredTool, tool } from '@langchain/core/tools'
import { z } from 'zod'

export type AgentToolRiskLevel = 'low' | 'medium' | 'high'

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
}

type AgentToolResultEnvelope<TData> = {
  ok: boolean
  data: TData | null
  error: {
    code: string
    message: string
  } | null
  message: string
  nextSuggestions: string[]
  meta: {
    toolName: string
    timestamp: string
    riskLevel: AgentToolRiskLevel
    readOnly: boolean
    idempotent: boolean
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
  agentMetadata: Required<Pick<AgentToolMetadata, 'riskLevel' | 'readOnly' | 'idempotent'>> &
    Omit<AgentToolMetadata, 'riskLevel' | 'readOnly' | 'idempotent'>
  baseDescription: string
  inputSchema: TInputSchema
  outputSchema: TOutputSchema
}

const DEFAULT_FAILURE_SUGGESTIONS = [
  'Check whether the current request matches this tool before retrying.',
  'If the tool keeps failing, explain the limitation to the user instead of guessing.'
]

const normalizeMetadata = (metadata: AgentToolMetadata): AgentTool['agentMetadata'] => ({
  ...metadata,
  riskLevel: metadata.riskLevel ?? 'low',
  readOnly: metadata.readOnly ?? false,
  idempotent: metadata.idempotent ?? false
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

const buildSuccessEnvelope = <TData>(
  toolName: string,
  metadata: AgentTool['agentMetadata'],
  data: TData,
  message: string,
  nextSuggestions: string[]
): AgentToolResultEnvelope<TData> => ({
  ok: true,
  data,
  error: null,
  message,
  nextSuggestions,
  meta: {
    toolName,
    timestamp: new Date().toISOString(),
    riskLevel: metadata.riskLevel,
    readOnly: metadata.readOnly,
    idempotent: metadata.idempotent
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
  meta: {
    toolName,
    timestamp: new Date().toISOString(),
    riskLevel: metadata.riskLevel,
    readOnly: metadata.readOnly,
    idempotent: metadata.idempotent
  }
})

export function defineAgentTool<
  TInputSchema extends z.ZodTypeAny,
  TOutputSchema extends z.ZodTypeAny
>(options: DefineAgentToolOptions<TInputSchema, TOutputSchema>): AgentTool<TInputSchema, TOutputSchema> {
  const metadata = normalizeMetadata(options.metadata)

  const wrappedTool = tool(
    async (rawInput) => {
      const parsedInput = options.inputSchema.safeParse(rawInput ?? {})
      if (!parsedInput.success) {
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
        const rawOutput = await options.execute(parsedInput.data)
        const parsedOutput = options.outputSchema.safeParse(rawOutput)

        if (!parsedOutput.success) {
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

        return serializeEnvelope(
          buildSuccessEnvelope(
            options.name,
            metadata,
            parsedOutput.data,
            message,
            nextSuggestions
          )
        )
      } catch (error) {
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
