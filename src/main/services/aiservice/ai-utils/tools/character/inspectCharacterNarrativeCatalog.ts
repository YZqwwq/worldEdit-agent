import { characterNarrativeReadingService } from '../../../../worldbuilding/characterNarrativeReadingRuntime'
import { defineAgentTool } from '../../core/agentTool'
import {
  inspectCharacterNarrativeCatalogInputSchema,
  inspectCharacterNarrativeCatalogOutputSchema
} from './shared'

export const inspectCharacterNarrativeCatalogTool = defineAgentTool({
  name: 'inspect_character_narrative_catalog',
  description:
    'Inspect the tree-shaped narrative document catalog before deciding how to build or refresh the agent impression of a character.',
  inputSchema: inspectCharacterNarrativeCatalogInputSchema,
  outputSchema: inspectCharacterNarrativeCatalogOutputSchema,
  metadata: {
    whenToUse: [
      '需要建立或重新形成人物印象，并确认世界认知是否已经提供可靠文档范围',
      '需要查看人物文本目录、文件树、每个文件或子树的文本量',
      '需要为 create_character_narrative_reading_task 准备 documentId 或 rootDocumentId',
      '已有印象缺失、过旧、证据范围不足，或用户要求基于指定文本重新分析人物'
    ],
    whenNotToUse: [
      '已经有有效的 reading task，应该继续调用 read_character_narrative_task_batch',
      '只需要读取人物结构化 profile/demographic 信息，应使用人物详情工具',
      '已有印象已经足够覆盖当前问题，且用户没有要求重新阅读或更新印象',
      '用户没有要求基于人物文本阅读做分析、总结或印象刷新'
    ],
    inputSummary: '提供 characterEntityId；可选 includePreview/previewChars 让目录项附带短预览。',
    outputSummary:
      '返回人物认知范围状态，以及该范围内的全量阅读选项、document/document_tree、路径和文本量。',
    usageContract: [
      '本工具只查看目录，不读取完整正文。',
      '目录只包含有效人物认知卡片引用的文档，不再把整个世界文档树当作人物文本。',
      'cognitionScope 不是 available 时，不要创建阅读任务；先使用世界文档搜索、树浏览和精确阅读确认范围，再保存或修正世界认知。',
      '选择性阅读时，后续必须使用返回的 documentId 或 rootDocumentId 创建 reading task，不要只靠标题。',
      '如果用户需要整体认识人物、人物没有已保存印象、或旧印象证据不足，在 fullReadOption.available=true 时优先考虑认知范围内全量阅读。',
      '如果用户只关心部分主题、指定章节、某类事件或某个关系，从 selectableItems 中选择 document 或 document_tree。',
      '如果用户要求“重新认识/重新评价/更新印象”，应先检查目录，再根据问题决定 full 或 selective。'
    ],
    executionLevel: 'safe',
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
    return `Inspected cognition-scoped narrative catalog for ${data.character.name}: scope=${data.cognitionScope.status}, ${data.totalDocuments} document(s), ${data.totalReadableCharacters} readable character(s).`
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
        selectableItemCount: data.selectableItems.length,
        cognitionScopeStatus: data.cognitionScope.status,
        cognitionNodeId: data.cognitionScope.cognitionNodeId
      }
    }
  },
  nextSuggestions(data) {
    if (data.cognitionScope.status !== 'available') {
      return [
        'Use world document search, tree browsing, and exact reading to establish or repair this character cognition before creating a reading task.'
      ]
    }
    if (data.totalDocuments === 0) {
      return ['Explain that the cognition scope contains no readable documents.']
    }
    return [
      'Create a reading task with create_character_narrative_reading_task before reading full text.'
    ]
  }
})
