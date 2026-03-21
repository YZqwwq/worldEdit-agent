import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage
} from '@langchain/core/messages'
import { z } from 'zod'
import { bindToolsToModel } from '../aiservice/agentrsystem/modelwithtool/modelwithtool'
import { getConfiguredQuickModel } from '../aiservice/agentrsystem/modelwithtool/model'
import { contentToText } from '../aiservice/messageoutput/transformRespones'
import { characterEditorTools } from '../aiservice/ai-utils/toolkits/characterEditorToolkit'
import { buildToolUsageSystemPrompt } from '../aiservice/ai-utils/core/toolUsagePrompt'
import {
  characterEditorHandlerOutputSchema,
  characterEditingScopeSchema,
  delegateCharacterEditorTaskPayloadSchema
} from '../aiservice/ai-utils/tools/character/shared'

type CharacterEditorExecutionPayload = z.infer<typeof delegateCharacterEditorTaskPayloadSchema>
type CharacterEditorHandlerOutput = z.infer<typeof characterEditorHandlerOutputSchema>
type CharacterEditingScope = z.infer<typeof characterEditingScopeSchema>

const MAX_TOOL_ROUNDS = 6

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

const buildPrompt = (payload: CharacterEditorExecutionPayload): string => {
  const availableScopes = payload.editingScope?.join(', ') || '未指定'
  const toolPrompt = buildToolUsageSystemPrompt(characterEditorTools) || ''

  return [
    '你是后台运行的 character_editor 执行器。',
    '你的职责是根据用户的人物编辑需求，使用人物专用工具完成一次可交付的编辑回合。',
    '执行规则：',
    '1. 先使用 get_character_detail 读取当前人物详情，再决定是否写入。',
    '2. 只允许使用当前提供的人物工具，不要编造数据库字段或 entityId。',
    '3. 如果请求涉及 relation 或需要引用实体，但当前工具不足以安全完成，应返回 needs_input。',
    '4. 如果已经成功写入 profile 或 demographic，请返回 completed。',
    '5. 最终只输出 JSON，不要输出额外解释。',
    '',
    '任务载荷：',
    JSON.stringify(
      {
        taskId: payload.taskId,
        executionId: payload.executionId,
        worldId: payload.worldId,
        entityId: payload.entityId,
        userRequest: payload.userRequest,
        editingScope: payload.editingScope ?? [],
        expectedOutcome: payload.expectedOutcome ?? '',
        source: payload.source ?? 'chat'
      },
      null,
      2
    ),
    '',
    `当前建议 editingScope：${availableScopes}`,
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

export async function runCharacterEditorExecution(
  rawPayload: unknown
): Promise<CharacterEditorHandlerOutput> {
  const payload = delegateCharacterEditorTaskPayloadSchema.parse(rawPayload)
  const model = await getConfiguredQuickModel()
  const boundModel = bindToolsToModel(model, characterEditorTools)

  const messages: BaseMessage[] = [
    new SystemMessage(buildPrompt(payload)),
    new HumanMessage(`请处理这次人物编辑执行：${payload.userRequest}`)
  ]

  const appliedTools: CharacterEditorHandlerOutput['appliedTools'] = []

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await boundModel.invoke(messages, {
      signal: AbortSignal.timeout(30000)
    } as Record<string, unknown>)
    const aiMessage = normalizeAiMessage(response as BaseMessage)
    messages.push(aiMessage)

    const toolCalls = (aiMessage as AIMessage & { tool_calls?: any[] }).tool_calls ?? []
    if (toolCalls.length === 0) {
      const rawText = contentToText(aiMessage.content).trim()
      const jsonText = extractJsonObject(rawText)
      if (!jsonText) {
        return buildFailureOutput(
          'character_editor 返回了无法解析的最终结果。',
          rawText || '人物编辑子 agent 没有返回可解析的结构化结果。',
          payload.editingScope ?? [],
          appliedTools
        )
      }

      const parsed = characterEditorHandlerOutputSchema.parse({
        ...JSON.parse(jsonText),
        appliedTools
      })
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
        const status = parseToolExecutionStatus(String(result))
        appliedTools.push({
          name: toolCall.name,
          status
        })
        messages.push(
          new ToolMessage({
            content: String(result),
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

  return buildFailureOutput(
    'character_editor 超过最大工具调用轮数，已中止本轮执行。',
    '人物编辑子 agent 在本轮执行中超过最大工具调用轮数，已中止，请用户补充更明确的修改范围后再试。',
    payload.editingScope ?? [],
    appliedTools
  )
}
