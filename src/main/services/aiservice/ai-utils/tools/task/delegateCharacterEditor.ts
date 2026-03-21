import { worldbuildingService } from '../../../../worldbuilding/worldbuildingService'
import { subAgentDispatcherService } from '../../../../task/subAgentDispatcherService'
import { taskExecutionService } from '../../../../task/taskExecutionService'
import { taskService } from '../../../../task/taskService'
import { defineAgentTool } from '../../core/agentTool'
import {
  delegateCharacterEditorInputSchema,
  delegateCharacterEditorOutputSchema,
  delegateCharacterEditorTaskPayloadSchema
} from '../character/shared'

const buildTaskSummary = (input: {
  characterName: string
  userRequest: string
  expectedOutcome?: string
}): string => {
  const requestSummary = input.userRequest.trim().slice(0, 180)
  const expected = input.expectedOutcome?.trim()
  return expected
    ? `编辑人物「${input.characterName}」：${expected}`
    : `编辑人物「${input.characterName}」：${requestSummary}`
}

export const delegateCharacterEditorTool = defineAgentTool({
  name: 'delegate_character_editor',
  description:
    'Delegate a character editing task to the specialized character editor sub-agent protocol.',
  inputSchema: delegateCharacterEditorInputSchema,
  outputSchema: delegateCharacterEditorOutputSchema,
  metadata: {
    whenToUse: [
      '用户提出了需要持续处理的人物编辑任务',
      '主 agent 已确认目标实体是 character，且不应直接执行复杂人物编辑',
      '需要启动人物编辑子 agent 协议而不是直接改数据库'
    ],
    whenNotToUse: [
      '目标对象不是 character',
      '只是简单查询人物信息，无需建立人物编辑任务',
      '系统尚未准备好处理新的 active task'
    ],
    inputSummary:
      '提供 worldId、entityId、userRequest；可选提供 editingScope、expectedOutcome、source。',
    outputSummary:
      '返回 accepted、taskId、executionId、executorKind、status、entity、summary、nextAction，表示人物编辑任务已被登记并进入委派协议。',
    examples: [
      '当用户要求补全某个角色的介绍、经历或基础属性时，调用 delegate_character_editor 建立人物编辑任务。'
    ],
    riskLevel: 'medium',
    readOnly: false,
    idempotent: false
  },
  async execute(input) {
    const detail = await worldbuildingService.getEntityDetail(input.entityId)
    if (!detail) {
      throw new Error(`Character not found: ${input.entityId}`)
    }
    if (detail.entity.worldId !== input.worldId) {
      throw new Error(
        `Entity ${input.entityId} does not belong to world ${input.worldId}`
      )
    }
    if (detail.entity.type !== 'character') {
      throw new Error(`Entity ${input.entityId} is not a character`)
    }

    const activeTask = await taskService.getActiveTask()
    const task =
      activeTask ??
      (await taskService.createTask({
        title: `编辑人物：${detail.entity.name}`,
        goal: input.expectedOutcome?.trim() || input.userRequest.trim(),
        summary: buildTaskSummary({
          characterName: detail.entity.name,
          userRequest: input.userRequest,
          expectedOutcome: input.expectedOutcome
        }),
        executorKind: 'character_editor'
      }))

    if (task.executorKind !== 'character_editor') {
      throw new Error(
        `Active task #${task.id} is bound to ${task.executorKind}, not character_editor`
      )
    }

    const queuedRun = await taskExecutionService.queueRun({
      taskId: task.id,
      executorKind: 'character_editor',
      inputPayload: {}
    })

    const finalPayload = delegateCharacterEditorTaskPayloadSchema.parse({
      taskId: task.id,
      executionId: queuedRun.id,
      worldId: input.worldId,
      entityId: input.entityId,
      userRequest: input.userRequest,
      editingScope: input.editingScope,
      expectedOutcome: input.expectedOutcome,
      source: input.source
    })

    await taskExecutionService.updateRunInputPayload(queuedRun.id, finalPayload)
    await taskService.setTaskStatus(task.id, { status: 'running' })
    void subAgentDispatcherService.dispatchExecution(queuedRun.id).catch((error) => {
      console.error('Failed to dispatch character editor execution:', error)
    })

    return delegateCharacterEditorOutputSchema.parse({
      accepted: true,
      taskId: task.id,
      executionId: queuedRun.id,
      executorKind: 'character_editor',
      status: 'running',
      entity: {
        id: detail.entity.id,
        worldId: detail.entity.worldId,
        type: 'character',
        name: detail.entity.name
      },
      summary: `人物编辑任务已进入后台执行链：${finalPayload.userRequest.slice(0, 160)}`,
      nextAction: 'await_subagent_result'
    })
  },
  successMessage(data) {
    return `Character editing delegation accepted for task #${data.taskId}.`
  },
  nextSuggestions() {
    return [
      'Inform the user that the character editing task has been registered.',
      'Do not claim the character has already been edited until the character editor sub-agent reports back.'
    ]
  },
  failureSuggestions: [
    'Confirm the target entityId and worldId first.',
    'Use character-specific query tools to inspect the target before retrying delegation.',
    'If another active task exists, resolve or close it before delegating a new character editing task.'
  ]
})
