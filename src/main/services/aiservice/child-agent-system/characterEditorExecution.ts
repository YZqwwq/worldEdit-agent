import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage
} from '@langchain/core/messages'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import { z } from 'zod'
import { bindToolsToModel } from '../agentrsystem/modelwithtool/modelwithtool'
import { getConfiguredQuickModel } from '../agentrsystem/modelwithtool/model'
import { contentToText } from '../messageoutput/transformRespones'
import { characterEditorTools } from '../ai-utils/toolkits/characterEditorToolkit'
import { buildToolUsageSystemPrompt } from '../ai-utils/core/toolUsagePrompt'
import {
  characterEditorHandlerOutputSchema,
  characterEditorDirectionSchema,
  characterEditorPendingContextSchema,
  characterEditingScopeSchema,
  delegateCharacterEditorTaskPayloadSchema
} from '../ai-utils/tools/character/shared'
import { worldbuildingService } from '../../worldbuilding/worldbuildingService'
import { modelConfigService } from '../../modelconfig/modelConfigService'

type CharacterEditorExecutionPayload = z.infer<typeof delegateCharacterEditorTaskPayloadSchema>
type CharacterEditorHandlerOutput = z.infer<typeof characterEditorHandlerOutputSchema>
type CharacterEditorPendingContext = z.infer<typeof characterEditorPendingContextSchema>
type CharacterEditingScope = z.infer<typeof characterEditingScopeSchema>
type CharacterEditorDirection = z.infer<typeof characterEditorDirectionSchema>
type SuccessfulDescriptionWrite = {
  entityId?: string
  characterName?: string
  description?: string
}

const MAX_TOOL_ROUNDS = 6

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

const parseToolExecutionStatus = (raw: string): 'ok' | 'error' => {
  try {
    const parsed = JSON.parse(raw)
    return parsed?.ok === true ? 'ok' : 'error'
  } catch {
    return 'error'
  }
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
  userFacingMessage: string
  changedScopes: CharacterEditingScope[]
  payload: CharacterEditorExecutionPayload
  phase: CharacterEditorPendingContext['phase']
  targetCharacterName?: string
  targetWorldName?: string
  resolvedWorldId?: string
  resolvedEntityId?: string
  appliedTools?: CharacterEditorHandlerOutput['appliedTools']
}): CharacterEditorHandlerOutput =>
  characterEditorHandlerOutputSchema.parse({
    outcome: 'needs_input',
    summary: input.summary,
    userFacingMessage: input.userFacingMessage,
    changedScopes: input.changedScopes,
    appliedTools: input.appliedTools ?? [],
    pendingContext: buildPendingContext({
      phase: input.phase,
      payload: input.payload,
      targetCharacterName: input.targetCharacterName,
      targetWorldName: input.targetWorldName,
      resolvedWorldId: input.resolvedWorldId,
      resolvedEntityId: input.resolvedEntityId,
      lastNeedsInputMessage: input.userFacingMessage
    })
  })

const buildFailureOutput = (
  summary: string,
  userFacingMessage: string,
  changedScopes: CharacterEditingScope[],
  appliedTools: CharacterEditorHandlerOutput['appliedTools']
): CharacterEditorHandlerOutput =>
  characterEditorHandlerOutputSchema.parse({
    outcome: 'failed',
    summary,
    userFacingMessage,
    changedScopes,
    appliedTools
  })

const buildCompletedAfterWriteFallback = (input: {
  payload: CharacterEditorExecutionPayload
  appliedTools: CharacterEditorHandlerOutput['appliedTools']
  write: SuccessfulDescriptionWrite
  reason: string
}): CharacterEditorHandlerOutput =>
  characterEditorHandlerOutputSchema.parse({
    outcome: 'completed',
    summary: '人物简介已写入，但子 agent 的收尾确认被中断。',
    userFacingMessage:
      `人物「${input.write.characterName || input.payload.characterName || input.write.entityId || '目标角色'}」的简介已经写入 description 字段。` +
      ' 但子 agent 在收尾确认时被中止，因此本轮我按“已写入完成，但总结异常”处理。请先检查当前简介内容；如果需要，我可以继续润色或追加修改。',
    changedScopes: ['profile'],
    appliedTools: input.appliedTools,
    suggestedFollowUp: `收尾中断原因：${input.reason}`
  })

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
  const toolPrompt = buildToolUsageSystemPrompt(characterEditorTools) || ''
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
        userFacingMessage: '给主 agent 的用户可见说明',
        changedScopes: ['profile'],
        suggestedFollowUp: '如有需要，可提示用户下一步'
      },
      null,
      2
    )
  ].join('\n')
}

const runCharacterToolLoop = async (
  payload: CharacterEditorExecutionPayload
): Promise<CharacterEditorHandlerOutput> => {
  const model = await getConfiguredQuickModel()
  const boundModel = bindToolsToModel(model, characterEditorTools)
  const effectiveScopes = getEffectiveEditingScopes(payload)
  const childAgentTimeoutMs = await modelConfigService.getChildAgentTimeoutMs()

  const messages: BaseMessage[] = [
    new SystemMessage(buildPrompt(payload)),
    new HumanMessage(`请处理这次人物编辑执行：${payload.userRequest}`)
  ]

  const appliedTools: CharacterEditorHandlerOutput['appliedTools'] = []
  let successfulWrite: SuccessfulDescriptionWrite | undefined

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    let response: BaseMessage
    try {
      response = await boundModel.invoke(messages, {
        signal: AbortSignal.timeout(childAgentTimeoutMs)
      } as Record<string, unknown>)
    } catch (error) {
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

    const aiMessage = normalizeAiMessage(response as BaseMessage)
    messages.push(aiMessage)

    const toolCalls = (aiMessage as AIMessage & { tool_calls?: any[] }).tool_calls ?? []
    if (toolCalls.length === 0) {
      const rawText = contentToText(aiMessage.content).trim()
      const jsonText = extractJsonObject(rawText)
      if (!jsonText) {
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

      if (parsed.outcome === 'needs_input' && !parsed.pendingContext) {
        return buildNeedsInputOutput({
          summary: parsed.summary,
          userFacingMessage: parsed.userFacingMessage,
          changedScopes: parsed.changedScopes,
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
        const status = parseToolExecutionStatus(resultText)
        appliedTools.push({
          name: toolCall.name,
          status
        })
        if (toolCall.name === 'upsert_character_description' && status === 'ok') {
          const args =
            toolCall.args && typeof toolCall.args === 'object' && !Array.isArray(toolCall.args)
              ? (toolCall.args as Record<string, unknown>)
              : {}
          successfulWrite = {
            entityId:
              typeof args.entityId === 'string' ? args.entityId : payload.entityId,
            characterName: payload.characterName,
            description:
              typeof args.description === 'string' ? args.description : undefined
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
        userFacingMessage:
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
        userFacingMessage:
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
      userFacingMessage:
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
          userFacingMessage:
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
        userFacingMessage:
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
        userFacingMessage:
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
      userFacingMessage:
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

const applyEditNode = async (
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

  const handlerOutput = await runCharacterToolLoop(finalPayload)
  return { handlerOutput }
}

const characterEditorGraph = new StateGraph(CharacterEditorState)
  .addNode('loadExecutionInputNode', loadExecutionInputNode)
  .addNode('resolveWorldNode', resolveWorldNode)
  .addNode('resolveCharacterNode', resolveCharacterNode)
  .addNode('applyEditNode', applyEditNode)
  .addEdge(START, 'loadExecutionInputNode')
  .addEdge('loadExecutionInputNode', 'resolveWorldNode')
  .addConditionalEdges('resolveWorldNode', routeAfterResolveWorld, ['resolveCharacterNode', END])
  .addConditionalEdges('resolveCharacterNode', routeAfterResolveCharacter, ['applyEditNode', END])
  .addEdge('applyEditNode', END)
  .compile()

export async function runCharacterEditorExecution(
  rawPayload: unknown
): Promise<CharacterEditorHandlerOutput> {
  const payload = delegateCharacterEditorTaskPayloadSchema.parse(rawPayload)
  const result = await characterEditorGraph.invoke({ payload })

  const handlerOutput = result.handlerOutput
  if (!handlerOutput) {
    throw new Error('character_editor graph finished without handler output.')
  }

  return characterEditorHandlerOutputSchema.parse(handlerOutput)
}
