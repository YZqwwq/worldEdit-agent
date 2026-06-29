import { characterNarrativeReadingService } from '../../../../worldbuilding/characterNarrativeReadingService'
import { defineAgentTool } from '../../core/agentTool'
import {
  inspectCharacterNarrativeCatalogInputSchema,
  inspectCharacterNarrativeCatalogOutputSchema
} from './shared'

export const inspectCharacterNarrativeCatalogTool = defineAgentTool({
  name: 'inspect_character_narrative_catalog',
  description:
    'Inspect the tree-shaped narrative document catalog for a character before deciding what to read.',
  inputSchema: inspectCharacterNarrativeCatalogInputSchema,
  outputSchema: inspectCharacterNarrativeCatalogOutputSchema,
  metadata: {
    whenToUse: [
      '需要阅读人物文本，但还没有决定全量阅读还是选择性阅读',
      '需要查看人物文本目录、文件树、每个文件或子树的文本量',
      '需要为 create_character_narrative_reading_task 准备 documentId 或 rootDocumentId'
    ],
    whenNotToUse: [
      '已经有有效的 reading task，应该继续调用 read_character_narrative_task_batch',
      '只需要读取人物结构化 profile/demographic 信息，应使用人物详情工具',
      '用户没有要求基于人物文本阅读做分析或总结'
    ],
    inputSummary:
      '提供 characterEntityId；可选 includePreview/previewChars 让目录项附带短预览。',
    outputSummary:
      '返回全量阅读选项、可选择的 document/document_tree 项、路径、子树文本量和选择规则。',
    usageContract: [
      '本工具只查看目录，不读取完整正文。',
      '选择性阅读时，后续必须使用返回的 documentId 或 rootDocumentId 创建 reading task，不要只靠标题。',
      '如果用户需要整体认识人物，优先考虑 fullReadOption。',
      '如果用户只关心部分主题，从 selectableItems 中选择 document 或 document_tree。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true,
    contextRetention: 'evidence',
    uiStage: {
      label: '正在查看人物文本目录',
      doneLabel: '人物文本目录查看完成',
      errorLabel: '人物文本目录查看失败'
    }
  },
  async execute(input) {
    return characterNarrativeReadingService.inspectCatalog(input)
  },
  successMessage(data) {
    return `Inspected narrative catalog for ${data.character.name}: ${data.totalDocuments} document(s), ${data.totalReadableCharacters} readable character(s).`
  },
  buildReceipt(data) {
    return {
      kind: 'character_narrative_catalog_inspected',
      summary: `${data.character.name} 的人物文本目录已读取：${data.totalDocuments} 个文件，${data.totalReadableCharacters} 字。`,
      payload: {
        characterEntityId: data.character.entityId,
        characterName: data.character.name,
        totalDocuments: data.totalDocuments,
        totalReadableCharacters: data.totalReadableCharacters,
        selectableItemCount: data.selectableItems.length
      }
    }
  },
  nextSuggestions(data) {
    if (data.totalDocuments === 0) {
      return ['Tell the user this character has no narrative documents to read.']
    }
    return ['Create a reading task with create_character_narrative_reading_task before reading full text.']
  }
})
