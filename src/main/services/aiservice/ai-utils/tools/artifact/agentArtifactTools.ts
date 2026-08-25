import { z } from 'zod'
import { agentArtifactService } from '../../../artifacts/agentArtifactService'
import { defineAgentTool } from '../../core/agentTool'

const artifactKindSchema = z.enum(['agent_opinion', 'analysis', 'proposal'])

const artifactPayloadSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  turnId: z.number().int(),
  sessionId: z.string(),
  toolCallId: z.string(),
  worldId: z.string().optional(),
  entityId: z.string().optional(),
  documentId: z.string().optional(),
  kind: artifactKindSchema,
  title: z.string(),
  summary: z.string(),
  body: z.string(),
  bodyFormat: z.literal('markdown'),
  status: z.enum(['draft', 'committed', 'reverted']),
  createdAt: z.string(),
  updatedAt: z.string()
})

export const publishAgentArtifactTool = defineAgentTool({
  name: 'publish_agent_artifact',
  description:
    'Create and persist a clickable Markdown artifact containing an Agent viewpoint, analysis, or proposal.',
  inputSchema: z.object({
    kind: artifactKindSchema.default('agent_opinion'),
    title: z.string().trim().min(1).max(120),
    summary: z.string().trim().max(500).optional(),
    body: z.string().trim().min(1).max(60000)
  }),
  outputSchema: z.object({ artifact: artifactPayloadSchema }),
  metadata: {
    whenToUse: [
      '你形成了需要较多篇幅展开、适合独立阅读的见解、资讯、分析、解释、方案或创作，并愿意用卡片交给用户',
      '需要将完整观点、系统分析或方案保存为可点击、可回看的独立内容',
      '需要为人物、设定或当前文档建立关联的 Agent 观点产物'
    ],
    whenNotToUse: [
      '内容没有独立保存或回看价值',
      '用户明确要求直接把完整文本发在聊天中',
      '需要修改正式世界观文档；这时应使用文档编辑工具'
    ],
    inputSummary:
      '只提供标题、完整 Markdown 正文和可选摘要；当前世界、人物和文档由 Runtime 自动关联。',
    outputSummary: '返回已保存产物的 ID、标题和摘要，界面会将其展示为可点击产物。',
    usageContract: [
      'body 必须是主 Agent 自己认可的最终观点，工具不会替你重新创作或改写。',
      '接近或超过一百字只是感受独立篇幅的参考，不是调用阈值；是否发布由内容、用户意图和你自己的表达意愿决定。',
      '日常交流、情绪回应与关系互动不要仅因篇幅稍长而发布成卡片。',
      'Runtime 会自动关联当前世界、实体和文档；不要要求用户提供内部 ID。',
      '同一观点不要在同一 Turn 重复发布。'
    ],
    executionLevel: 'notice',
    readOnly: false,
    idempotent: true,
    completionSemantics: 'definitive',
    contextRetention: 'evidence',
    uiStage: {
      label: '正在整理观点',
      doneLabel: '观点文档已整理',
      errorLabel: '观点文档整理失败'
    }
  },
  async execute(input) {
    return { artifact: await agentArtifactService.publish(input) }
  },
  successMessage(data) {
    return `Published Agent artifact "${data.artifact.title}".`
  },
  buildModelResult(data) {
    return {
      artifactId: data.artifact.id,
      kind: data.artifact.kind,
      title: data.artifact.title,
      summary: data.artifact.summary,
      stored: true
    }
  },
  buildReceipt(data) {
    return {
      kind: 'agent_artifact_published',
      operation: 'publish_agent_artifact',
      subject: {
        type: 'agent_artifact',
        id: data.artifact.id,
        label: data.artifact.title
      },
      summary: `观点文档《${data.artifact.title}》已保存。`,
      payload: {
        artifactId: data.artifact.id,
        artifactKind: data.artifact.kind,
        summary: data.artifact.summary
      }
    }
  },
  nextSuggestions() {
    return ['The artifact is persisted and available through the returned reference.']
  }
})

export const readAgentArtifactTool = defineAgentTool({
  name: 'read_agent_artifact',
  description: 'Read a previously published Agent viewpoint or analysis by its artifact ID.',
  inputSchema: z.object({ artifactId: z.string().uuid() }),
  outputSchema: z.object({ artifact: artifactPayloadSchema.nullable() }),
  metadata: {
    whenToUse: [
      '用户继续讨论之前的观点文档，需要取回完整论证',
      '当前上下文只有产物标题和摘要，不足以准确回答具体内容'
    ],
    whenNotToUse: ['刚刚发布且完整工具参数仍在本轮上下文中', '只需要标题或摘要即可回答'],
    inputSummary: '提供消息中已有的 artifactId。',
    outputSummary: '返回观点产物完整 Markdown 正文及其关联信息。',
    usageContract: ['不要猜测 artifactId；只使用上下文中明确出现的 ID。'],
    executionLevel: 'safe',
    readOnly: true,
    idempotent: true,
    completionSemantics: 'definitive',
    contextRetention: 'evidence',
    uiStage: {
      label: '正在回看观点',
      doneLabel: '观点已读取',
      errorLabel: '观点读取失败'
    }
  },
  async execute(input) {
    return { artifact: await agentArtifactService.getById(input.artifactId, true) }
  },
  successMessage(data) {
    return data.artifact
      ? `Read Agent artifact "${data.artifact.title}".`
      : 'Agent artifact was not found.'
  }
})
