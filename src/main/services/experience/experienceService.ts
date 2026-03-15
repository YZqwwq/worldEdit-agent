import { AppDataSource } from '../../database'
import { ExperienceRecord } from '../../../share/entity/database/ExperienceRecord'
import type { ExperienceRecallItem } from '@share/cache/AItype/states/taskLifecycleState'

type CreateExperienceInput = {
  sourceTaskId?: number | null
  title: string
  problemPattern?: string
  executionStrategy?: string
  verificationStrategy?: string
  outcome?: string
  pitfalls?: string
  tags?: string[]
}

const toRecallItem = (record: ExperienceRecord): ExperienceRecallItem => ({
  id: record.id,
  title: record.title,
  problemPattern: record.problemPattern,
  executionStrategy: record.executionStrategy,
  verificationStrategy: record.verificationStrategy,
  outcome: record.outcome,
  pitfalls: record.pitfalls
})

class ExperienceService {
  private get repo() {
    return AppDataSource.getRepository(ExperienceRecord)
  }

  async createExperience(input: CreateExperienceInput): Promise<ExperienceRecord> {
    const record = this.repo.create({
      sourceTaskId: input.sourceTaskId ?? null,
      title: input.title.trim(),
      problemPattern: input.problemPattern?.trim() || '',
      executionStrategy: input.executionStrategy?.trim() || '',
      verificationStrategy: input.verificationStrategy?.trim() || '',
      outcome: input.outcome?.trim() || '',
      pitfalls: input.pitfalls?.trim() || '',
      tagsJson: JSON.stringify(input.tags ?? [])
    })
    return this.repo.save(record)
  }

  async findRelevantExperiences(query: { title: string; goal?: string }, limit = 3): Promise<ExperienceRecallItem[]> {
    const terms = [query.title, query.goal]
      .map((value) => value?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value))

    const records = await this.repo.find({
      order: { updatedAt: 'DESC' },
      take: Math.max(limit * 3, limit)
    })

    const scored = records
      .map((record) => {
        const haystack = [
          record.title,
          record.problemPattern,
          record.executionStrategy,
          record.outcome,
          record.pitfalls
        ]
          .join('\n')
          .toLowerCase()

        const score = terms.reduce((acc, term) => acc + (haystack.includes(term) ? 1 : 0), 0)
        return {
          record,
          score
        }
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.record.updatedAt.getTime() - a.record.updatedAt.getTime())
      .slice(0, limit)

    return scored.map((item) => ({
      ...toRecallItem(item.record),
      relevanceScore: item.score
    }))
  }
}

export const experienceService = new ExperienceService()
