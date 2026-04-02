import * as z from 'zod'
import { defineAgentTool } from '../../core/agentTool'
import { taskContinuationService } from '../../../../task/taskContinuationService'
import { continueActiveChildAgentOutputSchema } from './shared'

const continueActiveChildAgentInputSchema = z.object({
  userReply: z.string().trim().min(1).max(4000)
})

export const continueActiveChildAgentTool = defineAgentTool({
  name: 'continue_active_child_agent',
  description:
    'Resume the current active child-agent task when the user has supplied the missing information requested by the sub-agent.',
  inputSchema: continueActiveChildAgentInputSchema,
  outputSchema: continueActiveChildAgentOutputSchema,
  metadata: {
    whenToUse: [
      '当前 active task 正处于 awaiting_user_input',
      '用户正在补充子 agent 之前请求的缺失参数',
      '需要把用户补参转成下一条 execution 继续后台子 agent'
    ],
    whenNotToUse: [
      '当前没有 active task',
      '当前任务并未等待用户补参',
      '用户是在发起一个全新任务，而不是补充旧任务'
    ],
    inputSummary: '提供 userReply，也就是用户刚刚补充的缺失信息原文。',
    outputSummary:
      '返回 accepted、taskId、executionId、executorKind、status、summary、nextAction，表示当前 active 子 agent 已被续跑。',
    examples: [
      '当人物编辑子 agent 缺少 worldName，用户补充“方舟终章”后，调用本工具继续后台执行。'
    ],
    riskLevel: 'medium',
    readOnly: false,
    idempotent: false
  },
  async execute(input) {
    const result = await taskContinuationService.continueActiveTask(input.userReply)
    return continueActiveChildAgentOutputSchema.parse({
      accepted: true,
      taskId: result.taskId,
      executionId: result.executionId,
      executorKind: result.executorKind,
      status: 'running',
      summary: `已接收补充信息并续跑 ${result.executorKind} 子 agent：${input.userReply.trim().slice(0, 160)}`,
      nextAction: 'await_subagent_result'
    })
  },
  successMessage(data) {
    return `Active child-agent task #${data.taskId} has been resumed.`
  },
  nextSuggestions() {
    return [
      'Tell the user that the missing information has been accepted and the child-agent is continuing in the background.',
      'Do not claim the task is complete until the child-agent reports back again.'
    ]
  },
  failureSuggestions: [
    'Check whether the current active task is really waiting for user input.',
    'If the user is starting a new request, do not use this tool and let the main agent handle it normally.'
  ]
})
