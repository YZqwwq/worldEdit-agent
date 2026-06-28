import { characterNarrativeReadingService } from '../../../../worldbuilding/characterNarrativeReadingService'
import { defineAgentTool } from '../../core/agentTool'
import {
  getCharacterNarrativeReadingPlanInputSchema,
  getCharacterNarrativeReadingPlanOutputSchema
} from './shared'

export const getCharacterNarrativeReadingPlanTool = defineAgentTool({
  name: 'get_character_narrative_reading_plan',
  description:
    'Build a stable tree-aware reading plan for all narrative documents that belong to one character.',
  inputSchema: getCharacterNarrativeReadingPlanInputSchema,
  outputSchema: getCharacterNarrativeReadingPlanOutputSchema,
  metadata: {
    whenToUse: [
      '需要从人物的文本编辑文档建立人物印象、人物画像或阅读计划',
      '已经知道 character entityId，需要先看该人物叙事文档的目录结构',
      '需要确认人物文本是否为空、总量多大、后续应从哪个 cursor 开始阅读'
    ],
    whenNotToUse: [
      '目标不是人物实体',
      '只需要读取人物 profile/demographic 等结构化资料，应使用 get_character_detail 或世界观读取工具',
      '已经拿到阅读计划并正在按 cursor 继续阅读正文'
    ],
    inputSummary: '提供 characterEntityId。',
    outputSummary:
      '返回人物信息、按树状父子关系摊平后的 outline、总文档数、总可读字符数、推荐 batch 大小和 firstCursor。',
    usageContract: [
      '先调用本工具理解文本目录，再调用 read_character_narrative_batch 从 firstCursor 开始分批读取。',
      '读取顺序是稳定的父到子 DFS：先读上级文件，再读下级文件。',
      'outline 只用于规划，不包含完整正文。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true,
    contextRetention: 'evidence',
    uiStage: {
      label: '正在读取人物文本目录',
      doneLabel: '人物文本目录读取完成',
      errorLabel: '人物文本目录读取失败'
    }
  },
  async execute(input) {
    return characterNarrativeReadingService.getReadingPlan(input.characterEntityId)
  },
  successMessage(data) {
    return `Built narrative reading plan for ${data.character.name}: ${data.totalDocuments} document(s), ${data.totalReadableCharacters} readable character(s).`
  },
  buildReceipt(data) {
    return {
      kind: 'character_narrative_reading_plan_loaded',
      summary: `${data.character.name} 的叙事阅读计划已建立：${data.totalDocuments} 个文件，${data.totalReadableCharacters} 字。`,
      payload: {
        characterEntityId: data.character.entityId,
        characterName: data.character.name,
        totalDocuments: data.totalDocuments,
        totalReadableCharacters: data.totalReadableCharacters,
        firstCursor: data.firstCursor
      }
    }
  },
  nextSuggestions(data) {
    if (data.totalDocuments === 0) {
      return ['Tell the user this character has no narrative documents yet, or create documents before building an impression.']
    }
    return ['Call read_character_narrative_batch with firstCursor until hasMore is false, then synthesize and save the impression.']
  }
})
