import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage
} from '@langchain/core/messages'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { bindToolsToModel, normalizeModelResponse } from '../agentrsystem/modelwithtool/modelwithtool'
import { getConfiguredQuickModelRuntime } from '../agentrsystem/modelwithtool/model'
import { contentToText } from '../messageoutput/transformRespones'
import {
  getCharacterEditorToolRegistry,
  getCharacterEditorTools
} from '../ai-utils/toolkits/characterEditorToolkit'
import { buildToolUsageSystemPrompt } from '../ai-utils/core/toolUsagePrompt'
import {
  parseAgentToolResultEnvelope,
  type AgentToolReceipt
} from '../ai-utils/core/agentTool'
import {
  characterEditorAppliedToolSchema,
  characterEditorHandlerOutputSchema,
  characterEditorDirectionSchema,
  characterEditorPendingContextSchema,
  characterEditingScopeSchema,
  delegateCharacterEditorTaskPayloadSchema
} from '../ai-utils/tools/character/shared'
import { worldbuildingService } from '../../worldbuilding/worldbuildingService'

type CharacterEditorExecutionPayload = z.infer<typeof delegateCharacterEditorTaskPayloadSchema>
type CharacterEditorHandlerOutput = z.infer<typeof characterEditorHandlerOutputSchema>
type CharacterEditorAppliedTool = z.infer<typeof characterEditorAppliedToolSchema>
type CharacterEditorPendingContext = z.infer<typeof characterEditorPendingContextSchema>
type CharacterEditingScope = z.infer<typeof characterEditingScopeSchema>
type CharacterEditorDirection = z.infer<typeof characterEditorDirectionSchema>
type SuccessfulDescriptionWrite = {
  entityId?: string
  characterName?: string
  description?: string
  receipt?: AgentToolReceipt
}

type CharacterEditorExecutionRuntime = {
  committedWrites: SuccessfulDescriptionWrite[]
  timeoutMs: number
}

const MAX_TOOL_ROUNDS = 6

type CharacterEditorAppliedTools = CharacterEditorAppliedTool[]

const CharacterEditorState = Annotation.Root({
  payload: Annotation<CharacterEditorExecutionPayload | undefined>({
    reducer: (_x, y) => y,
    default: () => undefined
  }),
  resolvedWorldId: Annotation<string | undefined>({
    reducer: (_x, y) => y,
    default: () => undefined
  }),
  resolvedWorldName: Annotation<string | undefined>({
    reducer: (_x, y) => y,
    default: () => undefined
  }),
  resolvedEntityId: Annotation<string | undefined>({
    reducer: (_x, y) => y,
    default: () => undefined
  }),
  resolvedCharacterName: Annotation<string | undefined>({
    reducer: (_x, y) => y,
    default: () => undefined
  }),
  handlerOutput: Annotation<CharacterEditorHandlerOutput | undefined>({
    reducer: (_x, y) => y,
    default: () => undefined
  })
})

const normalizeText = (value: unknown): string => String(value ?? '').trim().toLowerCase()

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const logCharacterEditorTrace = (input: {
  payload?: Partial<CharacterEditorExecutionPayload>
  stage: string
  message: string
  data?: Record<string, unknown>
}): void => {
  const taskId = input.payload?.taskId ?? 'unknown'
  const executionId = input.payload?.executionId ?? 'unknown'
  const prefix = `[character_editor task=${taskId} execution=${executionId} stage=${input.stage}]`
  const line =
    `${prefix} ${input.message}` +
    (input.data ? ` ${JSON.stringify(input.data)}` : '')

  try {
    const logPath = join(process.cwd(), 'src/main/services/log/logs/debug.log')
    appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`)
  } catch {
    // ignore local debug log failures
  }

  console.error(line)
}

const logAbortTrace = (input: {
  payload?: Partial<CharacterEditorExecutionPayload>
  stage: string
  error: unknown
  data?: Record<string, unknown>
}): void => {
  logCharacterEditorTrace({
    payload: input.payload,
    stage: `abort_${input.stage}`,
    message: 'Abort detected in character_editor.',
    data: {
      error: toErrorMessage(input.error),
      ...(input.data ?? {})
    }
  })
}

const isAbortLikeError = (error: unknown): boolean => normalizeText(toErrorMessage(error)) === 'abort'

const extractJsonObject = (text: string): string | null => {
  const trimmed = text.trim()
  if (!trimmed) return null

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) return fencedMatch[1].trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }
  return trimmed.slice(start, end + 1)
}

const normalizeAiMessage = (response: BaseMessage): AIMessage =>
  response instanceof AIMessage
    ? response
    : new AIMessage({
        content: response.content,
        additional_kwargs: response.additional_kwargs,
        response_metadata: response.response_metadata,
        id: response.id
      })

const buildPendingContext = (input: {
  phase: CharacterEditorPendingContext['phase']
  payload: CharacterEditorExecutionPayload
  targetCharacterName?: string
  targetWorldName?: string
  resolvedWorldId?: string
  resolvedEntityId?: string
  lastNeedsInputMessage: string
}): CharacterEditorPendingContext =>
  characterEditorPendingContextSchema.parse({
    phase: input.phase,
    originalUserRequest:
      input.payload.originalUserRequest?.trim() || input.payload.userRequest.trim(),
    targetCharacterName: input.targetCharacterName,
    targetWorldName: input.targetWorldName,
    resolvedWorldId: input.resolvedWorldId,
    resolvedEntityId: input.resolvedEntityId,
    editingScope: input.payload.editingScope,
    editingDirection: input.payload.editingDirection,
    expectedOutcome: input.payload.expectedOutcome,
    source: input.payload.source,
    lastNeedsInputMessage: input.lastNeedsInputMessage
  })

const buildNeedsInputOutput = (input: {
  summary: string
  message: string
  changedScopes: CharacterEditingScope[]
  payload: CharacterEditorExecutionPayload
  phase: CharacterEditorPendingContext['phase']
  targetCharacterName?: string
  targetWorldName?: string
  resolvedWorldId?: string
  resolvedEntityId?: string
  appliedTools?: CharacterEditorAppliedTools
}): CharacterEditorHandlerOutput =>
  characterEditorHandlerOutputSchema.parse({
    outcome: 'needs_input',
    summary: input.summary,
    message: input.message,
    details: {
      kind: 'needs_input',
      phase: input.phase,
      missingFields:
        input.phase === 'resolve_world'
          ? ['worldName']
          : input.phase === 'resolve_character'
            ? ['characterName']
            : undefined,
      suggestedPrompt: input.message,
      appliedTools: input.appliedTools ?? []
    },
    pendingContext: buildPendingContext({
      phase: input.phase,
      payload: input.payload,
      targetCharacterName: input.targetCharacterName,
      targetWorldName: input.targetWorldName,
      resolvedWorldId: input.resolvedWorldId,
      resolvedEntityId: input.resolvedEntityId,
      lastNeedsInputMessage: input.message
    })
  })

const buildFailureOutput = (
  summary: string,
  message: string,
  changedScopes: CharacterEditingScope[],
  appliedTools: CharacterEditorAppliedTools
): CharacterEditorHandlerOutput =>
  characterEditorHandlerOutputSchema.parse({
    outcome: 'failed',
    summary,
    message,
    details: {
      kind: 'failed',
      errorType: 'runtime_error',
      retryable: false,
      internalWarning:
        changedScopes.length > 0 ? `执行在以下范围内失败：${changedScopes.join(', ')}` : undefined,
      appliedTools
    }
  })

const buildCompletedAfterWrite = (input: {
  payload: CharacterEditorExecutionPayload
  appliedTools?: CharacterEditorAppliedTools
  write: SuccessfulDescriptionWrite
}): CharacterEditorHandlerOutput =>
  characterEditorHandlerOutputSchema.parse({
    outcome: 'completed',
    summary: '人物简介已更新，等待主 agent 确认下一步。',
    message:
      `人物「${input.write.characterName || input.payload.characterName || input.write.entityId || '目标角色'}」的简介已经更新。` +
      ' 你可以确认是否结束当前任务；如果还想继续润色或追加修改，也可以直接告诉我。',
    details: {
      kind: 'completed',
      changedScopes: ['profile'],
      appliedTools: input.appliedTools ?? [],
      suggestedFollowUp:
        input.write.receipt?.summary || '如有需要，可继续提出润色、扩写或定向修改要求。'
    }
  })

const buildCompletedAfterWriteFallback = (input: {
  payload: CharacterEditorExecutionPayload
  appliedTools?: CharacterEditorAppliedTools
  write: SuccessfulDescriptionWrite
  reason: string
}): CharacterEditorHandlerOutput =>
  characterEditorHandlerOutputSchema.parse({
    outcome: 'completed',
    summary: '人物简介已更新，等待主 agent 确认下一步。',
    message:
      `人物「${input.write.characterName || input.payload.characterName || input.write.entityId || '目标角色'}」的简介已经更新。` +
      ' 你可以确认是否结束当前任务；如果还想继续润色或追加修改，也可以直接告诉我。',
    details: {
      kind: 'completed',
      changedScopes: ['profile'],
      appliedTools: input.appliedTools ?? [],
      internalWarning:
        'description 写入已成功，但子 agent 在最终结构化收尾阶段遇到中止。' +
        ` 本轮已按完成处理。原因：${input.reason}`,
      suggestedFollowUp:
        input.write.receipt?.summary || '如有需要，可继续提出润色、扩写或定向修改要求。'
    }
  })

const toSuccessfulDescriptionWrite = (input: {
  payload: CharacterEditorExecutionPayload
  receipt: AgentToolReceipt
}): SuccessfulDescriptionWrite | undefined => {
  if (input.receipt.kind !== 'character_description_updated') {
    return undefined
  }

  const receiptPayload = input.receipt.payload ?? {}
  return {
    entityId:
      typeof receiptPayload.entityId === 'string' ? receiptPayload.entityId : input.payload.entityId,
    characterName: input.payload.characterName,
    description:
      typeof receiptPayload.description === 'string' ? receiptPayload.description : undefined,
    receipt: input.receipt
  }
}

const getLastCommittedWrite = (
  runtime: CharacterEditorExecutionRuntime
): SuccessfulDescriptionWrite | undefined => runtime.committedWrites.at(-1)

const getEffectiveEditingScopes = (
  _payload: CharacterEditorExecutionPayload
): CharacterEditingScope[] => {
  return ['profile']
}

const formatEditingDirectionLabel = (
  editingDirection?: CharacterEditorDirection
): string => {
  if (editingDirection === 'character_deeds') {
    return '人物事迹'
  }
  if (editingDirection === 'character_profile') {
    return '人物档案'
  }
  if (editingDirection === 'demographic_facts') {
    return '基础属性'
  }
  return '未指定'
}

const buildDirectionRules = (editingDirection?: CharacterEditorDirection): string[] => {
  const sharedRules = [
    '当前 character_editor 子 agent 的写入能力已被收紧：只能编辑 character_profile.description。',
    '唯一允许的写入工具是 upsert_character_description。',
    '不允许修改 title、summary、traits、abilities、tags、demographic、relation、portrait 等其他字段。',
    '如果用户请求的内容不是描述文本编辑，而是基础属性、关系、头像或其他结构化字段修改，必须返回 needs_input。'
  ]

  if (editingDirection === 'character_deeds') {
    return [
      ...sharedRules,
      '本轮 editingDirection=character_deeds，表示主 agent 希望你编辑人物事迹。',
      '人物事迹默认应写入 character_profile.data.description 字段。',
      '优先使用 upsert_character_description，并写入整理后的人物经历、事迹、转折、秘密或叙事内容。'
    ]
  }
  if (editingDirection === 'character_profile') {
    return [
      ...sharedRules,
      '本轮 editingDirection=character_profile，表示优先修改人物档案层。',
      '当前只允许修改 description 文本部分。'
    ]
  }
  if (editingDirection === 'demographic_facts') {
    return [
      ...sharedRules,
      '本轮 editingDirection=demographic_facts，表示优先修改基础属性层。',
      '但当前子 agent 不支持 demographic 写入，此类请求必须返回 needs_input。'
    ]
  }
  return [
    ...sharedRules,
    '本轮未提供 editingDirection，请只在用户请求明显属于人物描述文本编辑时继续执行。'
  ]
}

const buildPrompt = (payload: CharacterEditorExecutionPayload): string => {
  const effectiveScopes = getEffectiveEditingScopes(payload)
  const availableScopes = effectiveScopes.join(', ') || '未指定'
  const toolPrompt = buildToolUsageSystemPrompt(getCharacterEditorToolRegistry()) || ''
  const directionRules = buildDirectionRules(payload.editingDirection)

  return [
    '你是后台运行的 character_editor 子图中的编辑执行节点。',
    '当前 resolve_world / resolve_character 已经完成，你现在只需要针对已解析的人物执行本轮编辑。',
    '执行规则：',
    '1. 先使用 get_character_detail 读取当前人物详情，再决定是否写入。',
    '2. 只允许使用当前提供的人物工具，不要编造数据库字段或 entityId。',
    '3. 当前写入能力只允许修改 character_profile.description。',
    '4. 如果请求涉及 demographic、relation、portrait、title、summary、traits、abilities、tags 或其他非 description 字段，应返回 needs_input。',
    '5. 如果已经成功写入 description，请返回 completed。',
    '6. 最终只输出 JSON，不要输出额外解释。',
    ...directionRules,
    '',
    '任务载荷：',
    JSON.stringify(payload, null, 2),
    '',
    `当前建议 editingScope：${availableScopes}`,
    `当前 editingDirection：${formatEditingDirectionLabel(payload.editingDirection)}`,
    '',
    toolPrompt,
    '',
    '最终输出 JSON 格式：',
    JSON.stringify(
      {
        outcome: 'completed',
        summary: '一句话总结本轮执行结果',
        message: '给主 agent 的用户可见说明',
        details: {
          kind: 'completed',
          changedScopes: ['profile'],
          suggestedFollowUp: '如有需要，可提示用户下一步'
        }
      },
      null,
      2
    )
  ].join('\n')
}

const runCharacterToolLoop = async (
  payload: CharacterEditorExecutionPayload,
  runtime: CharacterEditorExecutionRuntime
): Promise<CharacterEditorHandlerOutput> => {
  const runtimeBundle = await getConfiguredQuickModelRuntime()
  const characterEditorTools = getCharacterEditorTools()
  const boundModel = bindToolsToModel(runtimeBundle, characterEditorTools)
  const effectiveScopes = getEffectiveEditingScopes(payload)
  const childAgentTimeoutMs = runtime.timeoutMs

  const messages: BaseMessage[] = [
    new SystemMessage(buildPrompt(payload)),
    new HumanMessage(`请处理这次人物编辑执行：${payload.userRequest}`)
  ]

  const appliedTools: CharacterEditorAppliedTools = []
  let successfulWrite: SuccessfulDescriptionWrite | undefined

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    logCharacterEditorTrace({
      payload,
      stage: 'round_start',
      message: 'Starting model round.',
      data: {
        round,
        messageCount: messages.length,
        committedWrites: runtime.committedWrites.length,
        hasSuccessfulWrite: Boolean(successfulWrite),
        timeoutMs: childAgentTimeoutMs
      }
    })
    logCharacterEditorTrace({
      payload,
      stage: 'invoke_with_timeout',
      message: 'Calling boundModel.invoke with AbortSignal.timeout.',
      data: {
        round,
        timeoutMs: childAgentTimeoutMs
      }
    })

    let response: BaseMessage
    try {
      console.log('错误检测1'+ Date.now())
      response = await boundModel.invoke(messages, {
        signal: AbortSignal.timeout(childAgentTimeoutMs)
      } as Record<string, unknown>)
    } catch (error) {
      if (isAbortLikeError(error)) {
        logAbortTrace({
          payload,
          stage: 'inner_model_invoke',
          error,
          data: {
            round,
            timeoutMs: childAgentTimeoutMs,
            committedWrites: runtime.committedWrites.length,
            hasSuccessfulWrite: Boolean(successfulWrite)
          }
        })
      }

      logCharacterEditorTrace({
        payload,
        stage: 'model_invoke_error',
        message: 'Model invocation threw before response was received.',
        data: {
          round,
          error: toErrorMessage(error),
          committedWrites: runtime.committedWrites.length,
          hasSuccessfulWrite: Boolean(successfulWrite)
        }
      })

      if (successfulWrite || getLastCommittedWrite(runtime)) {
        return buildCompletedAfterWriteFallback({
          payload,
          appliedTools,
          write: successfulWrite || getLastCommittedWrite(runtime)!,
          reason: toErrorMessage(error)
        })
      }
      throw error
    }

    const aiMessage = normalizeAiMessage(
      normalizeModelResponse(runtimeBundle, response as BaseMessage)
    )
    messages.push(aiMessage)

    const toolCalls = (aiMessage as AIMessage & { tool_calls?: any[] }).tool_calls ?? []
    logCharacterEditorTrace({
      payload,
      stage: 'model_response',
      message: 'Model response received.',
      data: {
        round,
        toolCalls: toolCalls.map((toolCall) => toolCall.name || 'unknown_tool'),
        contentPreview: contentToText(aiMessage.content).trim().slice(0, 160)
      }
    })

    if (toolCalls.length === 0) {
      const rawText = contentToText(aiMessage.content).trim()
      const jsonText = extractJsonObject(rawText)
      if (!jsonText) {
        logCharacterEditorTrace({
          payload,
          stage: 'final_output_missing_json',
          message: 'Final response did not contain parsable JSON.',
          data: {
            round,
            rawTextPreview: rawText.slice(0, 240),
            hasSuccessfulWrite: Boolean(successfulWrite)
          }
        })

        if (successfulWrite) {
          return buildCompletedAfterWriteFallback({
            payload,
            appliedTools,
            write: successfulWrite,
            reason: rawText || '最终结构化总结缺失'
          })
        }
        return buildFailureOutput(
          'character_editor 返回了无法解析的最终结果。',
          rawText || '人物编辑子 agent 没有返回可解析的结构化结果。',
          effectiveScopes,
          appliedTools
        )
      }

      let parsed: CharacterEditorHandlerOutput
      try {
        parsed = characterEditorHandlerOutputSchema.parse({
          ...JSON.parse(jsonText),
          appliedTools
        })
      } catch (error) {
        logCharacterEditorTrace({
          payload,
          stage: 'final_output_parse_error',
          message: 'Final JSON could not be parsed into handler output.',
          data: {
            round,
            error: toErrorMessage(error),
            hasSuccessfulWrite: Boolean(successfulWrite)
          }
        })

        if (successfulWrite) {
          return buildCompletedAfterWriteFallback({
            payload,
            appliedTools,
            write: successfulWrite,
            reason: error instanceof Error ? error.message : String(error)
          })
        }
        throw error
      }

      logCharacterEditorTrace({
        payload,
        stage: 'final_output_parsed',
        message: 'Final handler output parsed successfully.',
        data: {
          round,
          outcome: parsed.outcome,
          detailsKind: parsed.details.kind
        }
      })

      if (parsed.outcome === 'needs_input' && !parsed.pendingContext) {
        return buildNeedsInputOutput({
          summary: parsed.summary,
          message: parsed.message,
          changedScopes: getEffectiveEditingScopes(payload),
          payload,
          phase: 'apply_edit',
          targetCharacterName: payload.characterName,
          targetWorldName: payload.worldName,
          resolvedWorldId: payload.worldId,
          resolvedEntityId: payload.entityId,
          appliedTools
        })
      }

      return parsed
    }

    for (const toolCall of toolCalls) {
      const tool = characterEditorTools[toolCall.name as keyof typeof characterEditorTools]

      logCharacterEditorTrace({
        payload,
        stage: 'tool_call_start',
        message: 'Invoking tool from model response.',
        data: {
          round,
          toolName: toolCall.name || 'unknown_tool',
          toolCallId: toolCall.id || null
        }
      })

      if (!tool || !toolCall.id) {
        appliedTools.push({
          name: toolCall.name || 'unknown_tool',
          status: 'error'
        })
        messages.push(
          new ToolMessage({
            content: `Tool "${toolCall.name}" is not available in character_editor toolkit.`,
            tool_call_id: toolCall.id || `missing_${Date.now()}`,
            status: 'error'
          })
        )
        continue
      }

      try {
        const result = await tool.invoke(toolCall.args ?? {})
        const resultText = String(result)
        const envelope = parseAgentToolResultEnvelope(resultText)
        const status = envelope?.ok === true ? 'ok' : 'error'

        logCharacterEditorTrace({
          payload,
          stage: 'tool_call_result',
          message: 'Tool returned a result envelope.',
          data: {
            round,
            toolName: toolCall.name,
            status,
            hasEnvelope: Boolean(envelope),
            hasReceipt: Boolean(envelope?.receipt),
            completionSemantics: envelope?.meta.completionSemantics ?? null
          }
        })

        appliedTools.push({
          name: toolCall.name,
          status
        })
        if (envelope?.ok && envelope.receipt && envelope.meta.completionSemantics === 'definitive') {
          const committedWrite = toSuccessfulDescriptionWrite({
            payload,
            receipt: envelope.receipt
          })
          if (committedWrite) {
            successfulWrite = committedWrite
            runtime.committedWrites.push(committedWrite)
            logCharacterEditorTrace({
              payload,
              stage: 'committed_write_recorded',
              message: 'Recorded definitive write receipt.',
              data: {
                round,
                toolName: toolCall.name,
                receiptKind: envelope.receipt.kind,
                entityId: committedWrite.entityId ?? null,
                committedWrites: runtime.committedWrites.length
              }
            })
          }
        }
        messages.push(
          new ToolMessage({
            content: resultText,
            tool_call_id: toolCall.id,
            name: toolCall.name,
            status: status === 'error' ? 'error' : undefined
          })
        )
      } catch (error) {
        logCharacterEditorTrace({
          payload,
          stage: 'tool_call_error',
          message: 'Tool invocation threw an error.',
          data: {
            round,
            toolName: toolCall.name,
            error: toErrorMessage(error)
          }
        })

        appliedTools.push({
          name: toolCall.name,
          status: 'error'
        })
        messages.push(
          new ToolMessage({
            content: `Error executing tool "${toolCall.name}": ${error instanceof Error ? error.message : String(error)}`,
            tool_call_id: toolCall.id,
            name: toolCall.name,
            status: 'error'
          })
        )
      }
    }

    if (successfulWrite) {
      logCharacterEditorTrace({
        payload,
        stage: 'early_complete_after_write',
        message: 'Returning completed output immediately after definitive write.',
        data: {
          round,
          committedWrites: runtime.committedWrites.length,
          entityId: successfulWrite.entityId ?? null
        }
      })

      return buildCompletedAfterWrite({
        payload,
        appliedTools,
        write: successfulWrite
      })
    }
  }

  if (successfulWrite) {
    return buildCompletedAfterWriteFallback({
      payload,
      appliedTools,
      write: successfulWrite,
      reason: '超过最大工具调用轮数，但已完成 description 写入'
    })
  }

  return buildFailureOutput(
    'character_editor 超过最大工具调用轮数，已中止本轮执行。',
    '人物编辑子 agent 在本轮执行中超过最大工具调用轮数，已中止，请用户补充更明确的修改范围后再试。',
    effectiveScopes,
    appliedTools
  )
}

const loadExecutionInputNode = async (
  state: typeof CharacterEditorState.State
): Promise<Partial<typeof CharacterEditorState.State>> => {
  const payload = delegateCharacterEditorTaskPayloadSchema.parse(state.payload)
  return { payload }
}

const resolveWorldNode = async (
  state: typeof CharacterEditorState.State
): Promise<Partial<typeof CharacterEditorState.State>> => {
  const payload = delegateCharacterEditorTaskPayloadSchema.parse(state.payload)
  const changedScopes = getEffectiveEditingScopes(payload)
  const pending = payload.pendingContext

  const candidateWorldId = payload.worldId || pending?.resolvedWorldId
  const candidateWorldName = payload.worldName || pending?.targetWorldName
  const candidateCharacterName = payload.characterName || pending?.targetCharacterName

  if (candidateWorldId) {
    return {
      resolvedWorldId: candidateWorldId,
      resolvedWorldName: candidateWorldName
    }
  }

  if (!candidateWorldName) {
    return {
      handlerOutput: buildNeedsInputOutput({
        summary: '当前人物编辑任务缺少明确 world 名称。',
        message:
          '要继续编辑该人物，我需要你先提供明确的世界观名称。请告诉我这个角色属于哪个世界观。',
        changedScopes,
        payload,
        phase: 'resolve_world',
        targetCharacterName: candidateCharacterName
      })
    }
  }

  const worlds = await worldbuildingService.listWorlds()
  const exactMatches = worlds.filter(
    (world) => normalizeText(world.name) === normalizeText(candidateWorldName)
  )

  if (exactMatches.length === 1) {
    return {
      resolvedWorldId: exactMatches[0].id,
      resolvedWorldName: exactMatches[0].name
    }
  }

  if (exactMatches.length === 0) {
    return {
      handlerOutput: buildNeedsInputOutput({
        summary: `未找到名称为「${candidateWorldName}」的世界观。`,
        message:
          `我没有找到名称为「${candidateWorldName}」的世界观，请确认世界观名称后再继续。`,
        changedScopes,
        payload,
        phase: 'resolve_world',
        targetCharacterName: candidateCharacterName,
        targetWorldName: candidateWorldName
      })
    }
  }

  return {
    handlerOutput: buildNeedsInputOutput({
      summary: `世界观名称「${candidateWorldName}」对应多个候选。`,
      message:
        `世界观名称「${candidateWorldName}」对应多个候选，请提供更明确的世界观名称。`,
      changedScopes,
      payload,
      phase: 'resolve_world',
      targetCharacterName: candidateCharacterName,
      targetWorldName: candidateWorldName
    })
  }
}

const routeAfterResolveWorld = (
  state: typeof CharacterEditorState.State
): string | typeof END => (state.handlerOutput ? END : 'resolveCharacterNode')

const resolveCharacterNode = async (
  state: typeof CharacterEditorState.State
): Promise<Partial<typeof CharacterEditorState.State>> => {
  const payload = delegateCharacterEditorTaskPayloadSchema.parse(state.payload)
  const changedScopes = getEffectiveEditingScopes(payload)
  const pending = payload.pendingContext
  const worldId = state.resolvedWorldId
  const worldName = state.resolvedWorldName

  const candidateEntityId = payload.entityId || pending?.resolvedEntityId
  const candidateCharacterName = payload.characterName || pending?.targetCharacterName

  if (candidateEntityId) {
    const detail = await worldbuildingService.getEntityDetail(candidateEntityId)
    if (!detail || detail.entity.type !== 'character') {
      return {
        handlerOutput: buildNeedsInputOutput({
          summary: '提供的 entityId 不是有效的人物实体。',
          message:
            '当前提供的人物实体无效，请重新提供明确的人物名称或正确的角色实体信息。',
          changedScopes,
          payload,
          phase: 'resolve_character',
          targetCharacterName: candidateCharacterName,
          targetWorldName: worldName,
          resolvedWorldId: worldId
        })
      }
    }

    return {
      resolvedEntityId: detail.entity.id,
      resolvedCharacterName: detail.entity.name,
      resolvedWorldId: worldId || detail.entity.worldId
    }
  }

  if (!candidateCharacterName) {
    return {
      handlerOutput: buildNeedsInputOutput({
        summary: '当前人物编辑任务缺少明确人物名称。',
        message:
          '要继续编辑，我还需要明确的人物名称。请告诉我你要编辑哪个角色。',
        changedScopes,
        payload,
        phase: 'resolve_character',
        targetWorldName: worldName,
        resolvedWorldId: worldId
      })
    }
  }

  const matches = await worldbuildingService.searchCharacterEntities({
    worldId,
    name: candidateCharacterName
  })

  if (matches.length === 1) {
    return {
      resolvedEntityId: matches[0].entity.id,
      resolvedCharacterName: matches[0].entity.name
    }
  }

  if (matches.length === 0) {
    return {
      handlerOutput: buildNeedsInputOutput({
        summary: `在世界观「${worldName || worldId || ''}」中未找到人物「${candidateCharacterName}」。`,
        message:
          `我在世界观「${worldName || worldId || ''}」里没有找到名为「${candidateCharacterName}」的人物，请确认角色名后再继续。`,
        changedScopes,
        payload,
        phase: 'resolve_character',
        targetCharacterName: candidateCharacterName,
        targetWorldName: worldName,
        resolvedWorldId: worldId
      })
    }
  }

  return {
    handlerOutput: buildNeedsInputOutput({
      summary: `在世界观「${worldName || worldId || ''}」中找到了多个名为「${candidateCharacterName}」的人物候选。`,
      message:
        `在世界观「${worldName || worldId || ''}」中找到了多个名为「${candidateCharacterName}」的人物，请提供更具体的角色信息后再继续。`,
      changedScopes,
      payload,
      phase: 'resolve_character',
      targetCharacterName: candidateCharacterName,
      targetWorldName: worldName,
      resolvedWorldId: worldId
    })
  }
}

const routeAfterResolveCharacter = (
  state: typeof CharacterEditorState.State
): string | typeof END => (state.handlerOutput ? END : 'applyEditNode')

const createApplyEditNode =
  (runtime: CharacterEditorExecutionRuntime) =>
  async (
    state: typeof CharacterEditorState.State
  ): Promise<Partial<typeof CharacterEditorState.State>> => {
    const payload = delegateCharacterEditorTaskPayloadSchema.parse(state.payload)
    const finalPayload = delegateCharacterEditorTaskPayloadSchema.parse({
      ...payload,
      worldId: state.resolvedWorldId || payload.worldId,
      worldName: state.resolvedWorldName || payload.worldName,
      entityId: state.resolvedEntityId || payload.entityId,
      characterName: state.resolvedCharacterName || payload.characterName,
      pendingContext: undefined
    })

    const handlerOutput = await runCharacterToolLoop(finalPayload, runtime)
    return { handlerOutput }
  }

const createCharacterEditorGraph = (runtime: CharacterEditorExecutionRuntime) =>
  new StateGraph(CharacterEditorState)
    .addNode('loadExecutionInputNode', loadExecutionInputNode)
    .addNode('resolveWorldNode', resolveWorldNode)
    .addNode('resolveCharacterNode', resolveCharacterNode)
    .addNode('applyEditNode', createApplyEditNode(runtime))
    .addEdge(START, 'loadExecutionInputNode')
    .addEdge('loadExecutionInputNode', 'resolveWorldNode')
    .addConditionalEdges('resolveWorldNode', routeAfterResolveWorld, ['resolveCharacterNode', END])
    .addConditionalEdges('resolveCharacterNode', routeAfterResolveCharacter, ['applyEditNode', END])
    .addEdge('applyEditNode', END)
    .compile()

export async function runCharacterEditorExecution(
  rawPayload: unknown,
  options: { timeoutMs: number }
): Promise<CharacterEditorHandlerOutput> {
  const payload = delegateCharacterEditorTaskPayloadSchema.parse(rawPayload)
  const runtime: CharacterEditorExecutionRuntime = {
    committedWrites: [],
    timeoutMs: options.timeoutMs
  }
  const characterEditorGraph = createCharacterEditorGraph(runtime)

  logCharacterEditorTrace({
    payload,
    stage: 'execution_start',
    message: 'Starting character_editor execution.',
    data: {
      worldId: payload.worldId ?? null,
      entityId: payload.entityId ?? null,
      characterName: payload.characterName ?? null
    }
  })

  try {
    const result = await characterEditorGraph.invoke({ payload })

    const handlerOutput = result.handlerOutput
    if (!handlerOutput) {
      throw new Error('character_editor graph finished without handler output.')
    }

    logCharacterEditorTrace({
      payload,
      stage: 'execution_success',
      message: 'Graph returned handler output.',
      data: {
        outcome: handlerOutput.outcome,
        committedWrites: runtime.committedWrites.length
      }
    })

    return characterEditorHandlerOutputSchema.parse(handlerOutput)
  } catch (error) {
    logCharacterEditorTrace({
      payload,
      stage: 'execution_catch',
      message: 'Graph invocation threw an error.',
      data: {
        error: toErrorMessage(error),
        isAbortLike: isAbortLikeError(error),
        committedWrites: runtime.committedWrites.length
      }
    })

    if (isAbortLikeError(error)) {
      logAbortTrace({
        payload,
        stage: 'outer_graph_invoke',
        error,
        data: {
          committedWrites: runtime.committedWrites.length
        }
      })

      const committedWrite = getLastCommittedWrite(runtime)
      if (committedWrite) {
        logCharacterEditorTrace({
          payload,
          stage: 'execution_abort_recovered',
          message: 'Abort recovered using committed write.',
          data: {
            entityId: committedWrite.entityId ?? null,
            committedWrites: runtime.committedWrites.length
          }
        })

        return buildCompletedAfterWriteFallback({
          payload,
          write: committedWrite,
          reason: toErrorMessage(error)
        })
      }
    }

    if (isAbortLikeError(error)) {
      logAbortTrace({
        payload,
        stage: 'rethrow_to_dispatcher',
        error,
        data: {
          committedWrites: runtime.committedWrites.length
        }
      })
    }

    logCharacterEditorTrace({
      payload,
      stage: 'execution_rethrow',
      message: 'Rethrowing execution error to dispatcher.',
      data: {
        error: toErrorMessage(error),
        committedWrites: runtime.committedWrites.length
      }
    })

    throw error
  }
}
