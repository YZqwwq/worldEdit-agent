import { characterNarrativeReadingService } from '../../../../worldbuilding/characterNarrativeReadingService'
import { defineAgentTool } from '../../core/agentTool'
import {
  readCharacterNarrativeBatchInputSchema,
  readCharacterNarrativeBatchOutputSchema
} from './shared'

export const readCharacterNarrativeBatchTool = defineAgentTool({
  name: 'read_character_narrative_batch',
  description:
    'Read one cursor-based batch of cleaned text from a character narrative tree.',
  inputSchema: readCharacterNarrativeBatchInputSchema,
  outputSchema: readCharacterNarrativeBatchOutputSchema,
  metadata: {
    whenToUse: [
      '已经有 characterEntityId，需要按批读取人物文本编辑页中的叙事正文',
      '正在为人物建立印象，需要继续从上次 nextCursor 阅读',
      '后台任务恢复时，只知道停在某个 cursor，需要继续读取后续文本'
    ],
    whenNotToUse: [
      '还没有确认目标人物，应先解析人物 entityId',
      '还没有阅读计划且不知道文本规模，应先调用 get_character_narrative_reading_plan',
      '已经 hasMore=false，应停止继续读取并开始归纳或写入'
    ],
    inputSummary:
      '提供 characterEntityId；cursor 可省略或使用阅读计划返回的 firstCursor；maxChars 控制本批返回正文上限，默认约 12000，最大 24000。',
    outputSummary:
      '返回本批 chunks、nextCursor、hasMore、总 chunk 数和本批字符数。chunk 内含 documentId、标题路径、深度、chunk 序号和清洗后的正文。',
    usageContract: [
      '必须把返回的正文纳入当前人物印象草稿，再根据 hasMore 决定是否继续读取。',
      '如果 hasMore=true，下一次调用必须使用 nextCursor。',
      '如果 hasMore=false，不要再次读取同一人物正文，应进入总结或写入。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true,
    contextRetention: 'evidence',
    uiStage: {
      label: '正在阅读人物文本',
      doneLabel: '人物文本阅读完成',
      errorLabel: '人物文本阅读失败'
    }
  },
  async execute(input) {
    return characterNarrativeReadingService.readBatch(input)
  },
  successMessage(data) {
    return `Read character narrative batch ${data.cursor}->${data.nextCursor ?? 'end'} with ${data.chunks.length} chunk(s) and ${data.returnedCharacters} character(s).`
  },
  buildReceipt(data) {
    return {
      kind: 'character_narrative_batch_read',
      summary: `${data.character.name} 的叙事文本已读取一批：chunk ${data.batchIndexStart}-${data.batchIndexEnd}/${data.totalChunks}，${data.hasMore ? `下一游标 ${data.nextCursor}` : '已读完'}。`,
      payload: {
        characterEntityId: data.character.entityId,
        characterName: data.character.name,
        cursor: data.cursor,
        nextCursor: data.nextCursor,
        hasMore: data.hasMore,
        totalChunks: data.totalChunks,
        returnedCharacters: data.returnedCharacters,
        chunkIds: data.chunks.map((chunk) => chunk.chunkId)
      }
    }
  },
  nextSuggestions(data) {
    if (data.hasMore) {
      return [`Continue with read_character_narrative_batch using nextCursor=${data.nextCursor}.`]
    }
    return ['Synthesize the full character impression, then call upsert_character_impression once.']
  }
})
