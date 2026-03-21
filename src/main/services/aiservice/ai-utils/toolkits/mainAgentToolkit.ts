import * as z from 'zod'
import { defineAgentTool } from '../core/agentTool'
import { delegateCharacterEditorTool } from '../tools/task/delegateCharacterEditor'
import { getEntityDetailTool } from '../tools/world/getEntityDetail'
import { getWorldSchemaCatalogTool } from '../tools/world/getWorldSchemaCatalog'
import { listCharactersTool } from '../tools/world/listCharacters'
import { listEntitiesTool } from '../tools/world/listEntities'
import { listWorldsTool } from '../tools/world/listWorlds'

const addTool = defineAgentTool({
  name: 'add',
  description: 'Add two numbers.',
  inputSchema: z.object({
    a: z.number(),
    b: z.number()
  }),
  outputSchema: z.object({
    sum: z.number()
  }),
  metadata: {
    whenToUse: ['用户明确需要做简单加法计算'],
    whenNotToUse: ['问题不是简单加法', '需要复杂推理或外部数据而不是算术'],
    inputSummary: '提供 a 和 b 两个数字。',
    outputSummary: '返回 sum 字段。',
    riskLevel: 'low',
    readOnly: true,
    idempotent: true
  },
  execute({ a, b }) {
    return {
      sum: a + b
    }
  },
  successMessage(data, input) {
    return `Computed ${input.a} + ${input.b} = ${data.sum}.`
  }
})

export const mainAgentTools = {
  [addTool.name]: addTool,
  [delegateCharacterEditorTool.name]: delegateCharacterEditorTool,
  [getEntityDetailTool.name]: getEntityDetailTool,
  [getWorldSchemaCatalogTool.name]: getWorldSchemaCatalogTool,
  [listCharactersTool.name]: listCharactersTool,
  [listEntitiesTool.name]: listEntitiesTool,
  [listWorldsTool.name]: listWorldsTool
}
