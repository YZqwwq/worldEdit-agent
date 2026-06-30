import { characterNarrativeReadingService } from '../../../../worldbuilding/characterNarrativeReadingService'
import { defineAgentTool } from '../../core/agentTool'
import {
  createCharacterNarrativeReadingTaskInputSchema,
  createCharacterNarrativeReadingTaskOutputSchema
} from './shared'

export const createCharacterNarrativeReadingTaskTool = defineAgentTool({
  name: 'create_character_narrative_reading_task',
  description:
    'Compile a strict, purpose-driven reading task for building or refreshing the agent impression of a character.',
  inputSchema: createCharacterNarrativeReadingTaskInputSchema,
  outputSchema: createCharacterNarrativeReadingTaskOutputSchema,
  metadata: {
    whenToUse: [
      '已经查看过人物文本目录，需要把印象形成目的和阅读范围编译成可执行 JSON',
      '用户要求全量阅读人物文本并形成概念、印象或分析',
      '用户要求选择性阅读一个或多个文件/文件树，并且每个选择都需要独立阅读目的',
      '需要重新形成或刷新人物印象，且必须明确本轮阅读 mission、范围和顺序'
    ],
    whenNotToUse: [
      '还没有查看目录，不知道 documentId 或 rootDocumentId',
      '已经有有效 reading task，应该继续按 cursor 读取',
      '只是想看目录，不准备读取正文',
      '已有印象足以回答当前问题，不需要创建新的阅读任务'
    ],
    inputSummary:
      '提供 characterEntityId、总 mission、mode；selective 模式必须提供 selections，每个 document/document_tree 都必须有 mission。',
    outputSummary:
      '返回标准 reading task，包括 units、每个 unit 的 mission、展开后的 documentIds、字符量、firstCursor 和阅读协议。',
    usageContract: [
      '本工具不读取正文，只生成可执行 reading task；它是重新形成印象前的硬性计划步骤。',
      'full 模式会被编译为一个 full unit，mission 通常是形成对人物的整体概念；适合没有印象、旧印象范围不足或用户要求完整重读。',
      'selective 模式必须使用 inspect_character_narrative_catalog 返回的 documentId/rootDocumentId。',
      'selective 模式适合用户指定主题、章节、文件树，或只需要刷新人物某一方面印象。',
      '每个 selection 的 mission 都必须说明“为什么读这一部分”，而不是只写文件名。',
      '后续必须调用 read_character_narrative_task_batch，并从 firstCursor 开始按 nextCursor 顺序阅读。',
      '不要在 reading task 建立前声称已经阅读了文本；不要在 hasMore=false 前保存最终印象。'
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
