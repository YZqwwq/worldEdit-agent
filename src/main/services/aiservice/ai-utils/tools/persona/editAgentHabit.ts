import { z } from 'zod'
import { agentHabitStore } from '../../../agentrsystem/manager/personal/agentHabitStore'
import { defineAgentTool } from '../../core/agentTool'

const habitScopeSchema = z.enum(['thinking', 'communication', 'tool_use'])
const habitKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/)

const editAgentHabitInputSchema = z
  .object({
    operation: z
      .enum(['set', 'remove'])
      .describe('set=新增或替换一项长期习惯；remove=用户明确要求忘记已有习惯。'),
    habitKey: habitKeySchema.describe(
      '稳定、简短的英文语义键，例如 card_delivery、response_length、ask_before_editing。'
    ),
    scope: habitScopeSchema
      .optional()
      .describe(
        'set 时提供习惯主要影响的范围：thinking=思考，communication=交流，tool_use=工具使用；remove 时省略。'
      ),
    instruction: z
      .string()
      .trim()
      .max(800)
      .optional()
      .describe('set 时写入清晰、可长期执行的自然语言习惯；remove 时省略。'),
    userRequestEvidence: z
      .string()
      .trim()
      .min(1)
      .max(800)
      .describe('当前用户明确要求形成或忘记长期习惯的原话。')
  })
  .superRefine((input, context) => {
    if (input.operation === 'set' && !input.instruction?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['instruction'],
        message: 'set operation requires instruction.'
      })
    }
    if (input.operation === 'set' && !input.scope) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scope'],
        message: 'set operation requires scope.'
      })
    }
  })

const habitSchema = z.object({
  key: z.string(),
  scope: habitScopeSchema,
  instruction: z.string(),
  userRequestEvidence: z.string(),
  createdAt: z.string(),
  updatedAt: z.string()
})

const editAgentHabitOutputSchema = z.object({
  operation: z.enum(['set', 'remove']),
  changed: z.boolean(),
  revision: z.number().int().nonnegative(),
  habit: habitSchema.nullable()
})

export const editAgentHabitTool = defineAgentTool({
  name: 'edit_agent_habit',
  description:
    '在用户明确要求改变未来长期行为方式时，设置、替换或忘记一项 Agent 自己的持久习惯。适用于“以后请……”“今后不要再……”“记住以后……”等明确长期要求，不用于推测偏好或处理仅限本轮的要求。',
  inputSchema: editAgentHabitInputSchema,
  outputSchema: editAgentHabitOutputSchema,
  metadata: {
    description: {
      purpose: "Create, update, or remove a persistent agent habit at the user's explicit request.",
      whenToUse: [
        '用户明确要求以后持续采用某种思考、交流或工具使用方式',
        '用户明确要求不要再采用某种长期行为方式',
        '用户明确要求忘记、撤销或替换此前形成的习惯'
      ],
      whenNotToUse: [
        '用户只对当前一次回复提出格式或行为要求',
        '只是从用户语气、点击行为或单次选择中推测偏好',
        'Agent 自己觉得某种方式可能更好，但用户没有要求形成长期习惯',
        '修改稳定身份、价值观、事实记忆或工具权限；这些不属于习惯'
      ],
      inputSummary:
        '提供 set/remove、稳定 habitKey、影响范围、长期执行规则，并保留当前用户的明确原话作为来源。',
      outputSummary: '返回习惯是否发生变化、最新 revision 和当前习惯内容。',
      usageContract: [
        '只有当前用户消息明确表达长期、持续或以后都这样做的意图时才能调用。',
        'userRequestEvidence 必须来自当前用户原话，不能由 Agent 自己编造或概括成更强的授权。',
        '一次性要求直接在本轮遵守，不写入长期习惯。',
        'set 应把用户要求整理成简洁可执行的习惯；同一主题使用相同 habitKey 以完成替换。',
        '用户要求忘记某项习惯时使用 remove，不要用相反习惯模拟删除。'
      ],
      examples: [
        '“以后不要用卡片回答我” → set card_delivery，写入默认直接在聊天中完整回答。',
        '“以后长分析都放卡片里” → set card_delivery，替换同一主题习惯。',
        '“忘掉我之前关于卡片的要求” → remove card_delivery。'
      ],
      userDirectiveEvidenceField: 'userRequestEvidence'
    },
    display: {
      visibility: 'hidden',
      stage: {
        label: '正在调整长期习惯',
        doneLabel: '长期习惯已更新',
        errorLabel: '长期习惯更新失败'
      }
    },
    execution: {
      level: 'notice',
      readOnly: false,
      idempotent: true,
      completionSemantics: 'definitive'
    },
    retention: { context: 'evidence' }
  },
  async execute(input) {
    if (input.operation === 'remove') {
      const result = await agentHabitStore.remove(input.habitKey)
      return {
        operation: input.operation,
        changed: result.changed,
        revision: result.revision,
        habit: result.removed
      }
    }

    const result = await agentHabitStore.set({
      key: input.habitKey,
      scope: input.scope!,
      instruction: input.instruction!,
      userRequestEvidence: input.userRequestEvidence
    })
    return {
      operation: input.operation,
      changed: result.changed,
      revision: result.revision,
      habit: result.habit
    }
  },
  successMessage(data) {
    if (!data.changed) return 'The requested long-term habit was already in that state.'
    return data.operation === 'remove'
      ? `Removed long-term habit "${data.habit?.key ?? 'unknown'}".`
      : `Saved long-term habit "${data.habit?.key ?? 'unknown'}".`
  },
  buildModelResult(data) {
    return {
      operation: data.operation,
      changed: data.changed,
      revision: data.revision,
      habitKey: data.habit?.key ?? null,
      instruction: data.habit?.instruction ?? null,
      persisted: true
    }
  },
  buildReceipt(data) {
    return {
      kind: data.operation === 'remove' ? 'agent_habit_removed' : 'agent_habit_set',
      summary: data.habit
        ? `${data.habit.key}: ${data.habit.instruction}`
        : '长期习惯没有发生变化。',
      payload: {
        revision: data.revision,
        habitKey: data.habit?.key ?? null,
        scope: data.habit?.scope ?? null,
        changed: data.changed
      }
    }
  },
  nextSuggestions(data) {
    return data.changed
      ? ['The habit is already persisted. Apply it naturally now and in future turns.']
      : ['Do not call the habit editor again unless the user gives a different long-term request.']
  }
})
