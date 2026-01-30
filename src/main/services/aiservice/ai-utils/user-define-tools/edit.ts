import { tool } from '@langchain/core/tools'
import { z } from 'zod'

export const editTool = tool(async () => {
    return "Edit tool not implemented"
}, {
    name: "edit",
    description: "Edit tool",
    schema: z.object({})
})
