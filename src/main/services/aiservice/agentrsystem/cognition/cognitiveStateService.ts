import type { TurnCognitiveState } from '@share/cache/AItype/states/turnWorkspace'
import type { CognitiveRevision, InitialCognition } from './finishResponseProtocol'
import type { TurnExecutionLedger } from '../execution/turnExecutionLifecycle'
import { MessagesState } from '../state/messageState'

const compact = (value: string, max = 420): string => {
  const text = value.trim().replace(/\s+/g, ' ')
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`
}

const resolveNullableText = (
  next: string | null | undefined,
  previous: string | undefined
): string | undefined =>
  next === undefined ? previous : next === null || !next.trim() ? undefined : next

export const buildCognitiveState = (input: {
  state: typeof MessagesState.State
  ledger: TurnExecutionLedger
  hasToolCalls: boolean
  ready: boolean
  responseText: string
  revision?: CognitiveRevision | null
  initialCognition?: InitialCognition | null
}): TurnCognitiveState => {
  const previous = input.state.cognitiveState ?? input.state.turnWorkspace?.draft.cognitiveState
  const evidence = (input.state.toolEvidenceContext ?? []).slice(-6)
  const understanding = compact(
    input.revision?.understanding ||
      input.initialCognition?.understanding ||
      previous?.understanding ||
      input.ledger.objective ||
      '理解当前输入'
  )
  const evidenceRefs = [
    ...(previous?.evidenceRefs ?? []),
    ...evidence.flatMap(
      (item) => item.sourceRefs?.map((ref) => `${ref.type}:${ref.id ?? ref.title ?? ''}`) ?? []
    )
  ].filter(Boolean)

  return {
    objective: input.ledger.objective,
    understanding,
    selfPosition:
      input.revision?.selfPosition || input.initialCognition?.selfPosition || previous?.selfPosition,
    personalMeaning: input.revision
      ? resolveNullableText(input.revision.personalMeaning, previous?.personalMeaning)
      : input.initialCognition
        ? resolveNullableText(input.initialCognition.personalMeaning, previous?.personalMeaning)
        : previous?.personalMeaning,
    provisionalStance: input.revision
      ? resolveNullableText(input.revision.provisionalStance, previous?.provisionalStance)
      : input.initialCognition
        ? resolveNullableText(input.initialCognition.provisionalStance, previous?.provisionalStance)
        : input.hasToolCalls
          ? previous?.provisionalStance
          : compact(input.responseText, 240),
    knowledgeGap: input.revision
      ? resolveNullableText(input.revision.knowledgeGap, previous?.knowledgeGap)
      : input.initialCognition
        ? resolveNullableText(input.initialCognition.knowledgeGap, previous?.knowledgeGap)
        : previous?.knowledgeGap,
    nextObservationGoal: input.revision
      ? resolveNullableText(input.revision.nextObservationGoal, previous?.nextObservationGoal)
      : input.initialCognition
        ? resolveNullableText(input.initialCognition.nextObservationGoal, previous?.nextObservationGoal)
        : previous?.nextObservationGoal,
    lastEvidenceImpact: input.revision?.evidenceImpact || previous?.lastEvidenceImpact,
    previousUnderstanding:
      input.revision && previous?.understanding !== understanding
        ? previous?.understanding
        : previous?.previousUnderstanding,
    evidenceRefs: [...new Set(evidenceRefs)].slice(-12),
    unresolvedQuestions: input.ledger.unresolvedItems.slice(-6),
    phase: input.ready
      ? 'ready'
      : input.revision
        ? 'revising'
        : input.hasToolCalls
          ? 'observing'
          : 'forming',
    revision: (previous?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString()
  }
}
