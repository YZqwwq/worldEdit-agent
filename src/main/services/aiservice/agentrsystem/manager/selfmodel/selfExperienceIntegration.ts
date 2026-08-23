import type { SelfExperienceDraft, SelfExperienceSnapshot, SelfModelItemUpdate } from '@share/cache/AItype/states/selfModel'
import type { SelfCoreRevisionDraft, SelfCoreSnapshot } from '@share/cache/AItype/states/selfCore'
import { createNarrativeThesisRevision } from './selfCoreEvolution'

const compact = (value: string | undefined): string | undefined => {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return normalized || undefined
}

export const buildSelfCoreRevisionFromExperience = (input: {
  core: SelfCoreSnapshot | null | undefined
  experience: SelfExperienceDraft | null | undefined
  experienceId: string
}): SelfCoreRevisionDraft | undefined => {
  const selfNarrative = compact(input.experience?.selfNarrative)
  if (!input.core || !input.experience || !selfNarrative || selfNarrative.length < 8) return undefined
  if (input.experience.confidence < 0.8) return undefined
  return createNarrativeThesisRevision(input.core, {
    statement: selfNarrative,
    sourceExperienceIds: [input.experienceId],
    confidence: input.experience.confidence,
    nowIso: input.experience.occurredAt
  }) ?? undefined
}

export const foldOpenSelfModelItems = (
  experiences: SelfExperienceSnapshot[],
  select: (experience: SelfExperienceSnapshot) => SelfModelItemUpdate[]
): string[] => {
  const states = new Map<string, SelfModelItemUpdate['status']>()
  for (const experience of experiences.slice().reverse()) {
    for (const update of select(experience)) {
      const content = update.content.replace(/\s+/g, ' ').trim()
      if (content) states.set(content, update.status)
    }
  }
  return [...states.entries()].filter(([, status]) => status === 'open').map(([content]) => content)
}
