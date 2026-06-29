import { characterNarrativeReadingService } from '../../../../worldbuilding/characterNarrativeReadingService'
import { defineAgentTool } from '../../core/agentTool'
import {
  createCharacterNarrativeReadingTaskInputSchema,
  createCharacterNarrativeReadingTaskOutputSchema
} from './shared'

export const createCharacterNarrativeReadingTaskTool = defineAgentTool({
  name: 'create_character_narrative_reading_task',
  description:
    'Compile a strict, purpose-driven reading task from the character narrative catalog selections.',
  inputSchema: createCharacterNarrativeReadingTaskInputSchema,
  outputSchema: createCharacterNarrativeReadingTaskOutputSchema,
  metadata: {
    whenToUse: [
      '已经查看过人物文本目录，需要把阅读目的和阅读范围编译成可执行 JSON',
      '用户要求全量阅读人物文本并形成概念、印象或分析',
      '用户要求选择性阅读一个或多个文件/文件树，并且每个选择都需要独立阅读目的'
    ],
    whenNotToUse: [
      '还没有查看目录，不知道 documentId 或 rootDocumentId',
      '已经有有效 reading task，应该继续按 cursor 读取',
      '只是想看目录，不准备读取正文'
    ],
    inputSummary:
      '提供 characterEntityId、总 mission、mode；selective 模式必须提供 selections，每个 document/document_tree 都必须有 mission。',
    outputSummary:
      '返回标准 reading task，包括 units、每个 unit 的 mission、展开后的 documentIds、字符量、firstCursor 和阅读协议。',
    usageContract: [
      '本工具不读取正文，只生成可执行 reading task。',
      'full 模式会被编译为一个 full unit，mission 通常是形成对人物的整体概念。',
      'selective 模式必须使用 inspect_character_narrative_catalog 返回的 documentId/rootDocumentId。',
      '后续必须调用 read_character_narrative_task_batch，并从 firstCursor 开始按 nextCursor 顺序阅读。',
      '不要在 reading task 建立前声称已经阅读了文本。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true,
    contextRetention: 'evidence',
    uiStage: {
      label: '正在创建人物文本阅读任务',
      doneLabel: '人物文本阅读任务已创建',
      errorLabel: '人物文本阅读任务创建失败'
    }
  },
  async execute(input) {
    const task = await characterNarrativeReadingService.createReadingTask(input)
    return { task }
  },
  successMessage(data) {
    return `Created narrative reading task ${data.task.taskId}: ${data.task.units.length} unit(s), ${data.task.totalReadableCharacters} readable character(s).`
  },
  buildReceipt(data) {
    return {
      kind: 'character_narrative_reading_task_created',
      summary:
        `人物文本阅读任务已创建：${data.task.units.length} 个阅读单元，` +
        `${data.task.totalReadableCharacters} 字，firstCursor=${data.task.firstCursor}。`,
      payload: {
        taskId: data.task.taskId,
        characterEntityId: data.task.character.entityId,
        mode: data.task.mode,
        mission: data.task.mission,
        firstCursor: data.task.firstCursor,
        unitCount: data.task.units.length,
        totalReadableCharacters: data.task.totalReadableCharacters
      }
    }
  },
  nextSuggestions(data) {
    if (data.task.totalReadableCharacters === 0) {
      return ['Explain that the selected narrative documents contain no readable text.']
    }
    return [`Read the task with read_character_narrative_task_batch using cursor=${data.task.firstCursor}.`]
  }
})
