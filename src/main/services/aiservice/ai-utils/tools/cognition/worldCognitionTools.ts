import { z } from 'zod'
import { AgentToolError, defineAgentTool } from '../../core/agentTool'
import {
  AgentWorldCognitionError,
  AgentWorldCognitionService,
  MAIN_AGENT_COGNITION_OWNER_ID
} from '../../../../worldbuilding/agentWorldCognitionService'
import {
  cognitionDocumentRefSchema,
  cognitionNodeKindSchema,
  cognitionNodeStatusSchema,
  queryWorldCognitionInputSchema,
  saveWorldCognitionInputSchema
} from './worldCognitionToolContracts'

const cognitionNodeSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  parentId: z.string().nullable(),
  parentTitle: z.string().optional(),
  nodeKind: cognitionNodeKindSchema,
  title: z.string(),
  markdown: z.string(),
  documentRefs: z.array(cognitionDocumentRefSchema),
  revision: z.number().int().positive(),
  status: cognitionNodeStatusSchema,
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
})

const getCognitionService = async (): Promise<AgentWorldCognitionService> => {
  const { AppDataSource } = await import('../../../../../database')
  return new AgentWorldCognitionService(AppDataSource)
}

const toAgentToolError = (error: unknown): never => {
  if (!(error instanceof AgentWorldCognitionError)) throw error
  if (error.code === 'NODE_REVISION_CONFLICT' || error.code === 'DOCUMENT_REVISION_CONFLICT') {
    throw new AgentToolError({
      code: 'REVISION_CONFLICT',
      message: error.message,
      retryable: true,
      details: error.details,
      nextSuggestions: [
        'Query the cognition node or read the source document again, then retry with current revisions.'
      ]
    })
  }
  if (
    error.code === 'WORLD_NOT_FOUND' ||
    error.code === 'NODE_NOT_FOUND' ||
    error.code === 'PARENT_NOT_FOUND' ||
    error.code === 'DOCUMENT_NOT_FOUND'
  ) {
    throw new AgentToolError({
      code: 'NOT_FOUND',
      message: error.message,
      retryable: false,
      details: error.details
    })
  }
  throw new AgentToolError({
    code: 'INVALID_TOOL_INPUT',
    message: error.message,
    retryable: true,
    details: error.details
  })
}

export const queryWorldCognitionTool = defineAgentTool({
  name: 'query_world_cognition',
  description:
    'Query the main Agent’s reusable concept and dimension cognition for one world without loading the complete cognition space.',
  inputSchema: queryWorldCognitionInputSchema,
  outputSchema: z.object({
    worldId: z.string(),
    query: z.string(),
    spaceRevision: z.number().int().nonnegative(),
    matchCount: z.number().int().nonnegative(),
    matches: z.array(cognitionNodeSchema)
  }),
  metadata: {
    description: {
      purpose: '查询主 Agent 在指定世界中的可复用概念与维度认知。',
      whenToUse: [
        '用户提到可能曾经认识过的世界概念、简称、别名或惯称',
        '需要确定一个概念应优先读取哪些世界文档',
        '准备修正已有认知，需要先取得 nodeId 和当前 revision'
      ],
      whenNotToUse: [
        '已经知道准确 documentId，只需要读取当前事实',
        '从未认识过该概念且需要广泛发现，应先搜索世界文档',
        '只是在普通闲聊，不涉及当前世界内容'
      ],
      inputSummary: '提供 worldId、名称或称呼 query；limit 默认 5，最大 10。',
      outputSummary:
        '返回少量匹配的维度/概念 Markdown 卡片、来源文档 revision、认知 revision 和待验证状态。',
      usageContract: [
        '认知是 Agent 的导航与既有理解，不是世界事实真源。回答事实前应按 documentRefs 读取当前文档。',
        'needs_review 表示来源已经可疑，不应直接沿用其中结论。',
        '查询无结果时使用 search_world_documents，不要用相同参数反复查询。',
        '工具只查询当前主 Agent 在指定世界中的认知，不接受或切换 agentId。'
      ],
      examples: ['{"worldId":"world-id","query":"青岚"}']
    },
    display: {
      visibility: 'visible',
      stage: {
        label: '查询世界认知',
        runningLabel: '正在回想世界认知',
        doneLabel: '世界认知查询完成'
      }
    },
    execution: {
      level: 'safe',
      readOnly: true,
      idempotent: true,
      completionSemantics: 'definitive'
    },
    retention: { context: 'evidence' }
  },
  async execute(input) {
    try {
      const service = await getCognitionService()
      const result = await service.queryNodes({
        agentId: MAIN_AGENT_COGNITION_OWNER_ID,
        ...input
      })
      return {
        worldId: input.worldId,
        query: input.query,
        spaceRevision: result.spaceRevision,
        matchCount: result.matches.length,
        matches: result.matches
      }
    } catch (error) {
      return toAgentToolError(error)
    }
  },
  successMessage(data) {
    return `Found ${data.matchCount} cognition cards for "${data.query}".`
  },
  buildReceipt(data) {
    return {
      kind: 'world_cognition_queried',
      summary: `认知查询「${data.query}」命中 ${data.matchCount} 张卡片。`,
      payload: {
        worldId: data.worldId,
        query: data.query,
        nodeIds: data.matches.map((match) => match.id),
        spaceRevision: data.spaceRevision
      }
    }
  }
})

export const saveWorldCognitionTool = defineAgentTool({
  name: 'save_world_cognition',
  description:
    'Create or revise one Markdown dimension/concept card in the main Agent’s cognition for a world.',
  inputSchema: saveWorldCognitionInputSchema,
  outputSchema: z.object({
    created: z.boolean(),
    spaceRevision: z.number().int().positive(),
    node: cognitionNodeSchema
  }),
  metadata: {
    description: {
      purpose: '创建或修订主 Agent 在指定世界中的 Markdown 认知卡片。',
      whenToUse: [
        '已经阅读相关世界文档，并形成可在未来复用的名称、别称和文档入口映射',
        '需要建立 Agent 自己选择的新认知维度',
        '重新阅读证据后，需要修正已有卡片或恢复其有效状态'
      ],
      whenNotToUse: [
        '只有一次性猜测、联想或尚未确认的搜索候选',
        '没有阅读任何来源文档却准备创建概念卡片',
        '用户要求修改世界事实；此工具只修改 Agent 认知，不修改文档'
      ],
      inputSummary:
        '新建时提供 worldId、parentId、nodeKind、title、Markdown 和 documentRefs；更新时再提供 nodeId 与 expectedRevision。',
      outputSummary: '返回保存后的认知节点 ID、revision、状态和认知空间 revision。',
      usageContract: [
        '先创建维度节点，再把概念节点放到对应 parentId 下；维度由 Agent 自由命名，不套用固定枚举。',
        '概念卡片必须至少引用一篇已经读取的文档及其当前 revision。',
        'Markdown 保持短小，只保存稳定称呼、阅读入口和理解摘要，不复制大段文档事实。',
        '更新前先查询当前卡片，使用最新 expectedRevision，禁止盲目覆盖 revision 冲突。',
        '该工具不会创建世界实体、修改世界文档或写入人物印象。'
      ],
      examples: [
        '{"worldId":"world-id","parentId":null,"nodeKind":"dimension","title":"人物","markdown":"# 人物\\n\\n收录具有独立身份和行动能力的角色。","documentRefs":[]}',
        '{"worldId":"world-id","parentId":"dimension-id","nodeKind":"concept","title":"菲尔娜","markdown":"# 菲尔娜\\n\\n- 别称：菲、银发剑士","documentRefs":[{"documentId":"document-id","revision":3}]}'
      ]
    },
    display: {
      visibility: 'visible',
      stage: {
        label: '保存世界认知',
        runningLabel: '正在整理世界认知',
        doneLabel: '世界认知已保存',
        errorLabel: '世界认知保存失败'
      }
    },
    execution: {
      level: 'safe',
      readOnly: false,
      idempotent: false,
      completionSemantics: 'definitive'
    },
    retention: { context: 'ephemeral' }
  },
  async execute(input) {
    try {
      const service = await getCognitionService()
      return await service.saveNode({
        agentId: MAIN_AGENT_COGNITION_OWNER_ID,
        ...input
      })
    } catch (error) {
      return toAgentToolError(error)
    }
  },
  successMessage(data) {
    return `${data.created ? 'Created' : 'Updated'} cognition card "${data.node.title}" at revision ${data.node.revision}.`
  },
  buildModelResult(data) {
    return {
      created: data.created,
      spaceRevision: data.spaceRevision,
      node: {
        id: data.node.id,
        parentId: data.node.parentId,
        nodeKind: data.node.nodeKind,
        title: data.node.title,
        revision: data.node.revision,
        status: data.node.status,
        documentRefs: data.node.documentRefs
      }
    }
  },
  buildReceipt(data) {
    return {
      kind: data.created ? 'world_cognition_created' : 'world_cognition_updated',
      operation: data.created ? '建立世界认知' : '修正世界认知',
      subject: { type: 'agent_world_cognition', id: data.node.id, label: data.node.title },
      completion: 'complete',
      summary: `${data.node.nodeKind === 'dimension' ? '维度' : '概念'}认知「${data.node.title}」已保存。`,
      retryable: false,
      evidenceRef: `world-cognition:${data.node.id}:${data.node.revision}`,
      payload: {
        worldId: data.node.worldId,
        nodeId: data.node.id,
        revision: data.node.revision,
        spaceRevision: data.spaceRevision,
        status: data.node.status,
        documentIds: data.node.documentRefs.map((ref) => ref.documentId)
      }
    }
  }
})
