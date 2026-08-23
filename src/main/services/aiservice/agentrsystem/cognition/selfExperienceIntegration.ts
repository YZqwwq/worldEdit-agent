import type {
  ResponseOrientation,
  TurnCognitiveState
} from '@share/cache/AItype/states/turnWorkspace'
import type {
  SelfExperienceDraft,
  SelfExperienceSnapshot,
  SelfModelItemUpdate
} from '@share/cache/AItype/states/selfModel'
import type { MainAgentRuntimeEvent } from '@share/cache/AItype/states/taskLifecycleState'

const compact = (value: string | undefined): string | undefined => {
  const normalized = value?.replace(/\s+/g, ' ').trim()
  return normalized || undefined
}

export const buildSelfExperienceDraft = (input: {
  cognition?: TurnCognitiveState
  orientation?: ResponseOrientation
  runtimeEvent?: MainAgentRuntimeEvent
  occurredAt?: string
}): SelfExperienceDraft | undefined => {
  const cognition = input.cognition
  const orientation = input.orientation
  if (!cognition || !orientation) return undefined

  const intent = orientation.experienceIntent
  const personalMeaning = compact(orientation.personalMeaning ?? cognition.personalMeaning)
  const stance = compact(orientation.stance ?? cognition.provisionalStance)
  const isTaskResult = input.runtimeEvent?.kind === 'task_notification'
  const hasExplicitExperience = Boolean(
    compact(intent?.relationshipMeaning) ||
    compact(intent?.selfNarrative) ||
    intent?.commitmentUpdates.length ||
    intent?.concernUpdates.length
  )

  if (!isTaskResult && !personalMeaning && !stance && !hasExplicitExperience) {
    return undefined
  }

  return {
    kind: isTaskResult ? 'task_result' : 'dialogue',
    summary: compact(orientation.coreResponse)?.slice(0, 300) || cognition.understanding.slice(0, 300),
    understanding: cognition.understanding,
    selfPosition: orientation.selfPosition,
    personalMeaning,
    stance,
    relationshipMeaning: compact(intent?.relationshipMeaning),
    selfNarrative: compact(intent?.selfNarrative),
    commitmentUpdates: intent?.commitmentUpdates ?? [],
    concernUpdates: intent?.concernUpdates ?? [],
    evidenceRefs: [...new Set(cognition.evidenceRefs)],
    confidence: intent?.confidence ?? (cognition.evidenceRefs.length > 0 ? 0.75 : 0.6),
    occurredAt: input.occurredAt ?? new Date().toISOString()
  }
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
  return [...states.entries()]
    .filter(([, status]) => status === 'open')
    .map(([content]) => content)
}
