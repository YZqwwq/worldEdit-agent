import { z } from 'zod'
import { worldbuildingService } from '../../../../worldbuilding/worldbuildingService'
import { defineAgentTool } from '../../core/agentTool'

const listWorldsInputSchema = z.object({})

const listWorldsOutputSchema = z.object({
  count: z.number().int().min(0),
  worlds: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      summary: z.string(),
      status: z.string(),
      schemaVersion: z.number().int(),
      updatedAt: z.string(),
      createdAt: z.string()
    })
  )
})

export const listWorldsTool = defineAgentTool({
  name: 'list_worlds',
  description:
    'List all available worldbuilding projects in the local database.',
  inputSchema: listWorldsInputSchema,
  outputSchema: listWorldsOutputSchema,
  metadata: {
    whenToUse: [
      '用户询问当前有哪些世界观项目',
      '在创建或编辑实体前，需要先确认可操作的 worldId',
      '需要基于真实本地数据了解当前世界观范围'
    ],
    whenNotToUse: ['问题与世界观项目列表无关', '已经明确拿到了目标 worldId 且无需再次确认'],
    inputSummary: '无参数。',
    outputSummary:
      '返回 count 和 worlds 数组。每个 world 包含 id、name、summary、status、schemaVersion、updatedAt、createdAt。',
    examples: ['先调用 list_worlds，再决定后续对哪个世界进行查询或写入。'],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true
  },
  async execute() {
    const worlds = await worldbuildingService.listWorlds()

    return {
      count: worlds.length,
      worlds: worlds.map((world) => ({
        id: world.id,
        name: world.name,
        summary: world.summary || '',
        status: world.status,
        schemaVersion: world.schemaVersion,
        updatedAt: world.updatedAt || '',
        createdAt: world.createdAt || ''
      }))
    }
  },
  successMessage(data) {
    return `Found ${data.count} worldbuilding project(s).`
  },
  nextSuggestions(data) {
    if (data.count === 0) {
      return ['No worlds exist yet. Ask the user whether they want to create one.']
    }
    return ['Use a world id from the result before querying entities or writing worldbuilding data.']
  }
})
