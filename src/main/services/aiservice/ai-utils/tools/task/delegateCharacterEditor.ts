import { defineAgentTool } from '../../core/agentTool'
import { taskContinuationService } from '../../../taskContinuationService'
import {
  delegateCharacterEditorInputSchema,
  delegateCharacterEditorOutputSchema
} from '../character/shared'

export const delegateCharacterEditorTool = defineAgentTool({
  name: 'delegate_character_editor',
  description:
    'Delegate a character editing task to the specialized character editor sub-agent protocol.',
  inputSchema: delegateCharacterEditorInputSchema,
  outputSchema: delegateCharacterEditorOutputSchema,
  metadata: {
    whenToUse: [
      '用户提出了需要持续处理的人物描述文本编辑任务',
      '主 agent 已确认目标实体是 character，且不应直接执行复杂人物编辑',
      '需要启动人物编辑子 agent 协议而不是直接改数据库'
    ],
    whenNotToUse: [
      '目标对象不是 character',
      '只是简单查询人物信息，无需建立人物编辑任务',
      '用户要求修改年龄、性别、关系、头像等非 description 字段',
      '系统尚未准备好处理新的 active task'
    ],
    inputSummary:
      '提供 entityId 或 characterName；可选提供 worldId 或 worldName；必须提供 userRequest；可选提供 editingScope、editingDirection、expectedOutcome、source。当前子 agent 会把写入能力限制在 character_profile.description。若你已经知道 entityId/worldId/worldName，请一并传入，不要只传 characterName。',
    outputSummary:
      '返回 accepted、taskId、executionId、executorKind、status、target、summary、nextAction，表示人物描述编辑任务已被登记并进入委派协议；若目标尚未完全解析，后台子 agent 会通过 pendingContext 续跑。',
    usageContract: [
      '如果当前上下文已经明确知道目标人物的 entityId，调用时必须优先传 entityId',
      '如果尚未知道 entityId，但已经知道人物所属 worldId 或 worldName，必须连同 characterName 一起传入，避免子 agent 重复追问世界观',
      '只有在目标人物或所属世界观确实无法从已有上下文唯一定位时，才允许只传 characterName 或等待子 agent 继续补参',
      '不要在 tool 成功前口头声称任务已经创建；tool 返回 accepted 后，再告诉用户任务已登记并进入后台执行'
    ],
    examples: [
      '如果上一轮已经通过 list_characters 或 get_entity_detail 确认了 entityId/worldId，本轮委派时应直接传 entityId + worldId，而不是只传 characterName。',
      '当用户要求补全某个角色的人物事迹时，可传 characterName + worldName + editingDirection=character_deeds，让子 agent 优先更新 character_profile.description。'
    ],
    riskLevel: 'medium',
    readOnly: false,
    idempotent: false
  },
  async execute(input) {
    return taskContinuationService.startCharacterEditorTask(input)
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
    'If another active task exists, continue or close it before delegating a new character editing task.'
  ]
})
