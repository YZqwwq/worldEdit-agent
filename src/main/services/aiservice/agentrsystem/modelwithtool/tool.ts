import { tool } from '@langchain/core/tools'
import * as z from 'zod'
import { summarizeHistoryTool } from '../../ai-utils/promptutils/compress'

const add = tool(({ a, b }) => a + b, {
  name: 'add',
  description: 'Add two numbers. a: First number; b: Second number',
  schema: z.object({
    a: z.number(),
    b: z.number()
  })
})

export const tools = {
  [add.name]: add,
  [summarizeHistoryTool.name]: summarizeHistoryTool
}
