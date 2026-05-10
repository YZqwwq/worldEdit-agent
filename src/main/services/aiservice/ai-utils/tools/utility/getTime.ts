import * as z from 'zod'
import { defineAgentTool } from '../../core/agentTool'
import { getDetailTime } from '../../../../../utils/getDetailTime'

const getTimeInputSchema = z.object({})

const getTimeOutputSchema = z.object({
  currentTime: z.string()
})

export const getTimeTool = defineAgentTool({
  name: 'get_time',
  description: 'Get the current local time.',
  inputSchema: getTimeInputSchema,
  outputSchema: getTimeOutputSchema,
  metadata: {
    whenToUse: ['用户询问当前时间', '需要用系统当前时间作为回复锚点'],
    whenNotToUse: ['问题不依赖当前时间', '需要的是时区换算或日期范围而不是当前时刻'],
    inputSummary: '不需要输入参数。',
    outputSummary: '返回 currentTime，格式为 YYYY-M-D HH:mm:ss。',
    riskLevel: 'low',
    readOnly: true,
    idempotent: false,
    completionSemantics: 'definitive'
  },
  execute() {
    return {
      currentTime: getDetailTime(new Date(), {
        includeWeekday: false,
        includeTimezone: false
      })
    }
  },
  successMessage(data) {
    return `Current local time is ${data.currentTime}.`
  }
})
