import { z } from 'zod'
import { worldbuildingService } from '../../../../worldbuilding/worldbuildingService'
import { defineAgentTool } from '../../core/agentTool'
import { worldbuildingSchemaCatalogPayloadSchema } from './shared'

const getWorldSchemaCatalogInputSchema = z.object({})

const getWorldSchemaCatalogOutputSchema = z.object({
  catalog: worldbuildingSchemaCatalogPayloadSchema,
  counts: z.object({
    entityDefinitions: z.number().int().min(0),
    componentDefinitions: z.number().int().min(0),
    relationDefinitions: z.number().int().min(0)
  })
})

export const getWorldSchemaCatalogTool = defineAgentTool({
  name: 'get_world_schema_catalog',
  description:
    'Get the current worldbuilding schema catalog, including allowed entity types, component types, relation types, and field definitions.',
  inputSchema: getWorldSchemaCatalogInputSchema,
  outputSchema: getWorldSchemaCatalogOutputSchema,
  metadata: {
    whenToUse: [
      '在创建世界观实体、组件或关系前，需要确认系统允许的建模结构',
      '需要知道某种实体可以挂哪些组件',
      '需要知道关系类型允许连接哪些实体类型'
    ],
    whenNotToUse: ['问题只是在查询某个世界的现有数据', '已经明确知道目标字段和关系定义且无需再次确认'],
    inputSummary: '无参数。',
    outputSummary:
      '返回 schema catalog，包含 entityDefinitions、componentDefinitions、relationDefinitions 及其字段定义。',
    examples: [
      '先调用 get_world_schema_catalog，再决定如何创建人物组件或建立实体关系。'
    ],
    riskLevel: 'low',
    readOnly: true,
    idempotent: true
  },
  async execute() {
    const catalog = worldbuildingService.getSchemaCatalog()

    return {
      catalog,
      counts: {
        entityDefinitions: catalog.entityDefinitions.length,
        componentDefinitions: catalog.componentDefinitions.length,
        relationDefinitions: catalog.relationDefinitions.length
      }
    }
  },
  successMessage(data) {
    return `Loaded schema catalog with ${data.counts.entityDefinitions} entity definitions, ${data.counts.componentDefinitions} component definitions, and ${data.counts.relationDefinitions} relation definitions.`
  },
  nextSuggestions() {
    return [
      'Use the catalog definitions to choose valid entity types, component types, fields, and relations before writing data.'
    ]
  }
})
