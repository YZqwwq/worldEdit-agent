import { AppDataSource } from '../../../../database'
import { ToolUsageStatsRecord } from '../../../../../share/entity/database/ToolUsageStatsRecord'
import type { ToolCapabilityLayer } from './toolRegistryTypes'

export type ToolUsageStatsItem = {
  toolName: string
  capabilityLayer: string
  usageCount: number
  lastUsedAtIso: string
}

const getRepository = () => {
  if (!AppDataSource.isInitialized) {
    return null
  }
  return AppDataSource.getRepository(ToolUsageStatsRecord)
}

export const toolUsageStatsService = {
  async recordToolUse(input: {
    toolName: string
    capabilityLayer: ToolCapabilityLayer
  }): Promise<void> {
    const toolName = input.toolName.trim()
    if (!toolName) return

    const repository = getRepository()
    if (!repository) return

    const existing = await repository.findOne({ where: { toolName } })
    const lastUsedAtIso = new Date().toISOString()

    if (!existing) {
      await repository.save(
        repository.create({
          toolName,
          capabilityLayer: input.capabilityLayer,
          usageCount: 1,
          lastUsedAtIso
        })
      )
      return
    }

    existing.capabilityLayer = input.capabilityLayer
    existing.usageCount = Math.max(0, existing.usageCount || 0) + 1
    existing.lastUsedAtIso = lastUsedAtIso
    await repository.save(existing)
  },

  async listTopExtensionTools(limit = 3): Promise<ToolUsageStatsItem[]> {
    const repository = getRepository()
    if (!repository) return []

    const records = await repository.find({
      where: { capabilityLayer: 'extension' },
      order: {
        usageCount: 'DESC',
        lastUsedAtIso: 'DESC',
        toolName: 'ASC'
      },
      take: Math.max(0, limit)
    })

    return records.map((record) => ({
      toolName: record.toolName,
      capabilityLayer: record.capabilityLayer,
      usageCount: record.usageCount,
      lastUsedAtIso: record.lastUsedAtIso
    }))
  }
}
