import { worldbuildingService } from '../../../../worldbuilding/worldbuildingService'
import { subAgentDispatcherService } from '../../../../task/subAgentDispatcherService'
import { taskExecutionService } from '../../../../task/taskExecutionService'
import { taskService } from '../../../../task/taskService'
import { defineAgentTool } from '../../core/agentTool'
import type { WorldEntityDetailPayload } from '@share/cache/worldbuilding/worldbuilding'
import {
  delegateCharacterEditorInputSchema,
  delegateCharacterEditorOutputSchema,
  delegateCharacterEditorTaskPayloadSchema
} from '../character/shared'

const buildTaskSummary = (input: {
  characterName: string
  userRequest: string
  editingDirection?: 'character_deeds' | 'character_profile' | 'demographic_facts'
  expectedOutcome?: string
}): string => {
  const requestSummary = input.userRequest.trim().slice(0, 180)
  const expected = input.expectedOutcome?.trim()
  const directionLabel =
    input.editingDirection === 'character_deeds'
      ? '人物事迹'
      : input.editingDirection === 'demographic_facts'
        ? '基础属性'
        : input.editingDirection === 'character_profile'
          ? '人物档案'
          : ''
  return expected
    ? `编辑人物「${input.characterName}」${directionLabel ? `（${directionLabel}）` : ''}：${expected}`
    : `编辑人物「${input.characterName}」${directionLabel ? `（${directionLabel}）` : ''}：${requestSummary}`
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

const inferEditingScopeFromDirection = (
  editingDirection?: 'character_deeds' | 'character_profile' | 'demographic_facts'
): Array<'profile' | 'demographic'> | undefined => {
  if (editingDirection === 'character_deeds' || editingDirection === 'character_profile') {
    return ['profile']
  }
  if (editingDirection === 'demographic_facts') {
    return ['demographic']
  }
  return undefined
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
      '提供 entityId 或 characterName；可选提供 worldId 或 worldName；必须提供 userRequest；可选提供 editingScope、editingDirection、expectedOutcome、source。',
    outputSummary:
      '返回 accepted、taskId、executionId、executorKind、status、target、summary、nextAction，表示人物编辑任务已被登记并进入委派协议；若目标尚未完全解析，后台子 agent 会通过 pendingContext 续跑。',
    examples: [
      '当用户要求补全某个角色的人物事迹时，可传 characterName + worldName + editingDirection=character_deeds，让子 agent 优先更新 character_profile.description。'
    ],
    riskLevel: 'medium',
    readOnly: false,
    idempotent: false
  },
  async execute(input) {
    let detail: WorldEntityDetailPayload | null = null
    if (input.entityId) {
      detail = await worldbuildingService.getEntityDetail(input.entityId)
      if (!detail) {
        throw new Error(`Character not found: ${input.entityId}`)
      }
      if (input.worldId && detail.entity.worldId !== input.worldId) {
        throw new Error(
          `Entity ${input.entityId} does not belong to world ${input.worldId}`
        )
      }
      if (detail.entity.type !== 'character') {
        throw new Error(`Entity ${input.entityId} is not a character`)
      }
    }

    const activeTask = await taskService.getActiveTask()
    const task =
      activeTask ??
      (await taskService.createTask({
        title: `编辑人物：${input.characterName || detail?.entity.name || '待解析人物'}`,
        goal: input.expectedOutcome?.trim() || input.userRequest.trim(),
        summary: buildTaskSummary({
          characterName: input.characterName || detail?.entity.name || '待解析人物',
          userRequest: input.userRequest,
          editingDirection: input.editingDirection,
          expectedOutcome: input.expectedOutcome
        }),
        executorKind: 'character_editor'
      }))

    if (task.executorKind !== 'character_editor') {
      throw new Error(
        `Active task #${task.id} is bound to ${task.executorKind}, not character_editor`
      )
    }

    const pendingContext = await taskService.getPendingContext(task.id)
    const mergedCharacterName =
      input.characterName ||
      detail?.entity.name ||
      (isNonEmptyString(pendingContext.targetCharacterName)
        ? pendingContext.targetCharacterName
        : undefined)
    const mergedWorldName =
      input.worldName ||
      (isNonEmptyString(pendingContext.targetWorldName) ? pendingContext.targetWorldName : undefined)
    const mergedWorldId =
      input.worldId ||
      detail?.entity.worldId ||
      (isNonEmptyString(pendingContext.resolvedWorldId) ? pendingContext.resolvedWorldId : undefined)
    const mergedEntityId =
      input.entityId ||
      detail?.entity.id ||
      (isNonEmptyString(pendingContext.resolvedEntityId) ? pendingContext.resolvedEntityId : undefined)
    const mergedOriginalUserRequest =
      (isNonEmptyString(pendingContext.originalUserRequest)
        ? pendingContext.originalUserRequest
        : undefined) || input.userRequest
    const mergedEditingDirection =
      input.editingDirection ||
      (isNonEmptyString(pendingContext.editingDirection)
        ? (pendingContext.editingDirection as
            | 'character_deeds'
            | 'character_profile'
            | 'demographic_facts')
        : undefined)
    const mergedEditingScope =
      input.editingScope ||
      pendingContext.editingScope ||
      inferEditingScopeFromDirection(mergedEditingDirection)

    if (!mergedCharacterName && !mergedEntityId) {
      throw new Error(
        'character_editor requires either entityId or characterName, unless an active task already carries pendingContext.'
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
      worldId: mergedWorldId,
      worldName: mergedWorldName,
      entityId: mergedEntityId,
      characterName: mergedCharacterName,
      userRequest: input.userRequest,
      originalUserRequest: mergedOriginalUserRequest,
      editingScope: mergedEditingScope,
      editingDirection: mergedEditingDirection,
      expectedOutcome: input.expectedOutcome,
      source: input.source,
      pendingContext: Object.keys(pendingContext).length > 0 ? pendingContext : undefined
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
      target: {
        entityId: mergedEntityId,
        characterName: mergedCharacterName,
        worldId: mergedWorldId,
        worldName: mergedWorldName
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
