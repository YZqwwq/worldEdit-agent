import { characterNarrativeReadingService } from '../../../../worldbuilding/characterNarrativeReadingService'
import { defineAgentTool } from '../../core/agentTool'
import {
  readCharacterNarrativeTaskBatchInputSchema,
  readCharacterNarrativeTaskBatchOutputSchema
} from './shared'

export const readCharacterNarrativeTaskBatchTool = defineAgentTool({
  name: 'read_character_narrative_task_batch',
  description:
    'Read the next ordered batch of text from a compiled character narrative reading task.',
  inputSchema: readCharacterNarrativeTaskBatchInputSchema,
  outputSchema: readCharacterNarrativeTaskBatchOutputSchema,
  metadata: {
    whenToUse: [
      '已经通过 create_character_narrative_reading_task 得到 reading task',
      '需要按 firstCursor 或 nextCursor 继续读取人物文本正文',
      '需要按 unit mission 的顺序阅读多个文件或文件树'
    ],
    whenNotToUse: [
      '还没有 reading task，应先 inspect catalog 再 create task',
      '上一次返回 hasMore=false，说明任务已读完，应开始综合输出',
      '只是查看目录，不需要正文'
    ],
    inputSummary:
      '传入 create_character_narrative_reading_task 返回的 task；cursor 可省略或传 firstCursor/nextCursor。',
    outputSummary:
      '返回当前阅读单元、单元 mission、本批 chunks、nextCursor、hasMoreInUnit、hasMore 和阅读动作提示。',
    usageContract: [
      '必须按 nextCursor 顺序读取，不要跳读。',
      '阅读每一批时必须围绕 currentUnit.mission 形成阶段理解。',
      '当 hasMoreInUnit=false 且 hasMore=true 时，进入下一个 unit 前先总结当前 unit。',
      '当 hasMore=false 时，停止读取并根据 task.mission 输出最终结论。',
      '不要重复读取同一个 cursor，除非上一轮工具失败。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true,
    contextRetention: 'evidence',
    uiStage: {
      label: '正在阅读人物文本',
      doneLabel: '人物文本批次读取完成',
      errorLabel: '人物文本批次读取失败'
    }
  },
  async execute(input) {
    return characterNarrativeReadingService.readTaskBatch(input)
  },
  successMessage(data) {
    return `Read narrative task ${data.taskId} unit ${data.unitIndex + 1}, chunks ${data.chunkIndexStart}-${data.chunkIndexEnd}/${data.totalUnitChunks}.`
  },
  buildReceipt(data) {
    return {
      kind: 'character_narrative_task_batch_read',
      summary:
        `阅读任务 ${data.taskId} 已读取一批：${data.currentUnit.title}，` +
        `chunk ${data.chunkIndexStart}-${data.chunkIndexEnd}/${data.totalUnitChunks}，` +
        `${data.hasMore ? `下一游标 ${data.nextCursor}` : '已读完'}。`,
      payload: {
        taskId: data.taskId,
        currentUnitId: data.currentUnit.unitId,
        currentUnitTitle: data.currentUnit.title,
        cursor: data.cursor,
        nextCursor: data.nextCursor,
        hasMore: data.hasMore,
        hasMoreInUnit: data.hasMoreInUnit,
        returnedCharacters: data.returnedCharacters,
        chunkIds: data.chunks.map((chunk) => chunk.chunkId)
      }
    }
  },
  nextSuggestions(data) {
    if (data.hasMore) {
      return [`Continue reading with read_character_narrative_task_batch using nextCursor=${data.nextCursor}.`]
    }
    return ['Stop reading and synthesize the final answer according to the reading task mission.']
  }
})
