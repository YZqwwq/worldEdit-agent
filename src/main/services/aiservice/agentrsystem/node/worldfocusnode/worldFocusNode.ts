import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type {
  MemorySlotSnapshot,
  WorldFocusItem,
  WorldFocusItemRole,
  WorldFocusTaskType
} from '@share/cache/AItype/states/memorySlots'
import type {
  WorldEntityPayload,
  WorldEntityType,
  WorldPayload
} from '@share/cache/worldbuilding/worldbuilding'
import { characterImpressionService } from '../../../../worldbuilding/characterImpressionService'
import { characterNarrativeReadingService } from '../../../../worldbuilding/characterNarrativeReadingService'
import {
  worldEntityMentionIndexService,
  type WorldEntityMentionSearchCandidate
} from '../../../../worldbuilding/worldEntityMentionIndexService'
import { worldbuildingService } from '../../../../worldbuilding/worldbuildingService'
import {
  emitAgentStage,
  traceArtifact,
  traceDecision,
  traceError
} from '../../../../log/trace/agentTraceEmitter'
import { contentToText } from '../../../messageoutput/transformRespones'
import { createDefaultMemorySlots } from '../../manager/memory/memoryWritePolicy'
import { getQuickModel } from '../../modelwithtool/quick-base-model'
import {
  MessagesState,
  type WorldFocusContext,
  type WorldFocusImpressionContext
} from '../../state/messageState'
import {
  getEffectiveMemorySlots,
  withMemorySlotsDraft
} from '../../state/turnWorkspace'
import type {
  InstantPerceptionContext,
  RecentDialogueMessage
} from '../instantperceptionnode/instantPerceptionContext'

type ResolvedFocus = {
  world: WorldPayload
  entity: WorldEntityPayload
  confidence: number
  source: 'mention_index' | 'previous_focus'
  role: WorldFocusItemRole
  reason?: string
  matchedMentions?: string[]
  score?: number
}

type ResolvedFocusGroup = {
  focuses: ResolvedFocus[]
  confidence: number
  primaryFocusId?: string
  focusTask: {
    type: WorldFocusTaskType
    description: string
  }
}

type FocusCandidate = {
  candidateId: string
  source: 'mention_index' | 'previous_focus'
  isPreviousFocus: boolean
  worldId: string
  worldName: string
  entityId: string
  entityType: WorldEntityType
  entityName: string
  score?: number
  matchedMentions?: string[]
  matchedFields?: string[]
}

type FocusResolutionResult =
  | {
      type: 'resolved'
      focusGroup: ResolvedFocusGroup
      reason: string
    }
  | {
      type: 'ambiguous' | 'none'
      confidence: number
      reason: string
      candidates: FocusCandidate[]
    }

const worldFocusResolutionSchema = z.object({
  decision: z.object({
    type: z.enum(['resolved', 'ambiguous', 'none']),
    selectedCandidateIds: z.array(z.string().trim()).max(8).optional(),
    primaryCandidateId: z.string().trim().optional(),
    focusTask: z
      .object({
        type: z
          .enum([
            'single_analysis',
            'compare',
            'relationship',
            'dialogue',
            'joint_analysis',
            'batch_edit',
            'reference_edit',
            'unknown'
          ])
          .default('unknown'),
        description: z.string().trim().max(240).default('')
      })
      .optional(),
    candidateRoles: z
      .array(
        z.object({
          candidateId: z.string().trim(),
          role: z
            .enum(['primary', 'co_focus', 'reference', 'target', 'background'])
            .default('co_focus'),
          reason: z.string().trim().max(160).optional()
        })
      )
      .max(8)
      .optional(),
    confidence: z.number().finite().min(0).max(1),
    reason: z.string().trim().min(1).max(300)
  })
})

const extractJsonObject = (text: string): string | null => {
  const trimmed = text.trim()
  if (!trimmed) return null

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    return null
  }

  return trimmed.slice(start, end + 1)
}

const toFocusCandidate = (
  candidate: WorldEntityMentionSearchCandidate,
  previousFocus?: WorldFocusItem
): FocusCandidate => ({
  candidateId: `mention:${candidate.worldId}:${candidate.entityType}:${candidate.entityId}`,
  source: 'mention_index',
  isPreviousFocus:
    previousFocus?.worldId === candidate.worldId && previousFocus?.entityId === candidate.entityId,
  worldId: candidate.worldId,
  worldName: candidate.worldName,
  entityId: candidate.entityId,
  entityType: candidate.entityType,
  entityName: candidate.entityName,
  score: candidate.score,
  matchedMentions: candidate.matchedMentions,
  matchedFields: candidate.matchedFields
})

const createPreviousFocusCandidate = async (
  worlds: WorldPayload[],
  previousFocus: WorldFocusItem | undefined
): Promise<FocusCandidate | null> => {
  if (!previousFocus) return null

  const world = worlds.find((item) => item.id === previousFocus.worldId)
  if (!world) return null

  const detail = await worldbuildingService.getEntityDetail(previousFocus.entityId)
  if (
    !detail ||
    detail.entity.worldId !== world.id ||
    detail.entity.type !== previousFocus.focusType
  ) {
    return null
  }

  return {
    candidateId: `previous:${world.id}:${detail.entity.type}:${detail.entity.id}`,
    source: 'previous_focus',
    isPreviousFocus: true,
    worldId: world.id,
    worldName: world.name,
    entityId: detail.entity.id,
    entityType: detail.entity.type,
    entityName: detail.entity.name
  }
}

const mergeFocusCandidates = (
  mentionCandidates: FocusCandidate[],
  previousCandidate: FocusCandidate | null
): FocusCandidate[] => {
  const candidates = [...mentionCandidates]
  if (!previousCandidate) return candidates

  const existing = candidates.find(
    (candidate) =>
      candidate.worldId === previousCandidate.worldId &&
      candidate.entityId === previousCandidate.entityId
  )
  if (existing) {
    existing.isPreviousFocus = true
    return candidates
  }

  return [previousCandidate, ...candidates]
}

const buildFocusResolutionPrompt = (input: {
  currentUserText: string
  recentMessages: RecentDialogueMessage[]
  candidates: FocusCandidate[]
}): string => `你是“应用内世界观焦点组裁决器”，不是聊天助手。你只判断用户最新输入真正指向哪些候选人物，以及这些人物在本轮任务中的角色。

目标：
从候选列表中判断本轮是否能确定一个或多个人物焦点。

判断规则：
1. 候选由索引召回和历史焦点提供。索引分数只是检索特征，不是最终结论。
2. 不要用关键词或代词机械判断。必须结合用户最新输入、最近对话和候选信息判断真实指向。
3. previous_focus 候选只有在用户明显延续上一轮人物、追问该人物，或最近对话上下文足以承接时才可选择。
4. 如果用户只是泛泛讨论创作、现实作品、例子，或没有指向任何候选，返回 none。
5. 如果多个候选都合理，或上下文不足以区分，返回 ambiguous。
6. 如果用户同时指向多个人物，且这些人物身份都能确定，返回 resolved，并在 selectedCandidateIds 中列出多个人物。
7. “人物身份不明确”才是 ambiguous；“多个人物主次不明确”仍可 resolved，但 primaryCandidateId 可不填。
8. candidateRoles 用于描述人物在本轮任务里的角色：primary 主焦点，co_focus 共同焦点，reference 参考对象，target 被修改/分析目标，background 背景对象。

当前用户最新输入：
${input.currentUserText || '(empty)'}

最近对话预览：
${JSON.stringify(input.recentMessages, null, 2)}

候选人物：
${JSON.stringify(
  input.candidates.map((candidate) => ({
    candidateId: candidate.candidateId,
    source: candidate.source,
    isPreviousFocus: candidate.isPreviousFocus,
    worldName: candidate.worldName,
    entityType: candidate.entityType,
    entityName: candidate.entityName,
    score: candidate.score,
    matchedMentions: candidate.matchedMentions,
    matchedFields: candidate.matchedFields
  })),
  null,
  2
)}

只输出 JSON，不要 Markdown，不要解释。格式：
{
  "decision": {
    "type": "resolved | ambiguous | none",
    "selectedCandidateIds": ["resolved 时填写一个或多个候选 id"],
    "primaryCandidateId": "可选：主焦点候选 id",
    "candidateRoles": [
      {
        "candidateId": "候选 id",
        "role": "primary | co_focus | reference | target | background",
        "reason": "可选，简短说明"
      }
    ],
    "focusTask": {
      "type": "single_analysis | compare | relationship | dialogue | joint_analysis | batch_edit | reference_edit | unknown",
      "description": "简短描述本轮多人物/单人物任务"
    },
    "confidence": 0.0,
    "reason": "不超过120字，说明为什么"
  }
}`

const resolveFocusWithModel = async (input: {
  text: string
  recentMessages: RecentDialogueMessage[]
  candidates: FocusCandidate[]
}): Promise<z.infer<typeof worldFocusResolutionSchema>['decision']> => {
  if (input.candidates.length === 0) {
    return {
      type: 'none',
      confidence: 0,
      reason: '没有召回任何可用候选人物。'
    }
  }

  const quickModel = await getQuickModel()
  const response = await quickModel.invoke(
    [
      new SystemMessage('你只负责返回合法 JSON。'),
      new HumanMessage(
        buildFocusResolutionPrompt({
          currentUserText: input.text,
          recentMessages: input.recentMessages,
          candidates: input.candidates
        })
      )
    ],
    { signal: AbortSignal.timeout(8000) } as Record<string, unknown>
  )

  const jsonText = extractJsonObject(contentToText(response.content).trim())
  if (!jsonText) {
    throw new Error('World focus model did not return valid JSON content')
  }

  return worldFocusResolutionSchema.parse(JSON.parse(jsonText)).decision
}

const uniqueStrings = (values: Array<string | undefined>): string[] => [
  ...new Set(values.filter((value): value is string => Boolean(value?.trim())))
]

const roleForCandidate = (
  candidateId: string,
  decision: z.infer<typeof worldFocusResolutionSchema>['decision'],
  selectedCount: number
): { role: WorldFocusItemRole; reason?: string } => {
  const role = decision.candidateRoles?.find((item) => item.candidateId === candidateId)
  if (role) {
    return {
      role: role.role,
      reason: role.reason
    }
  }
  if (decision.primaryCandidateId === candidateId || selectedCount === 1) {
    return {
      role: 'primary'
    }
  }
  return {
    role: 'co_focus'
  }
}

const buildResolvedFocus = async (input: {
  candidate: FocusCandidate
  worlds: WorldPayload[]
  confidence: number
  role: WorldFocusItemRole
  reason?: string
}): Promise<ResolvedFocus | null> => {
  const world = input.worlds.find((item) => item.id === input.candidate.worldId)
  if (!world) return null

  const detail = await worldbuildingService.getEntityDetail(input.candidate.entityId)
  if (
    !detail ||
    detail.entity.worldId !== world.id ||
    detail.entity.type !== input.candidate.entityType
  ) {
    return null
  }

  return {
    world,
    entity: detail.entity,
    confidence: input.confidence,
    source: input.candidate.source,
    role: input.role,
    reason: input.reason,
    matchedMentions: input.candidate.matchedMentions,
    score: input.candidate.score
  }
}

const resolveFocus = async (
  text: string,
  recentMessages: RecentDialogueMessage[],
  slots: MemorySlotSnapshot
): Promise<FocusResolutionResult> => {
  if (!text.trim()) {
    return {
      type: 'none',
      confidence: 0,
      reason: '用户最新输入为空，无法识别世界观焦点。',
      candidates: []
    }
  }

  const worlds = await worldbuildingService.listWorlds()
  if (worlds.length === 0) {
    return {
      type: 'none',
      confidence: 0,
      reason: '当前没有可用世界观。',
      candidates: []
    }
  }
  const previousFocus =
    slots.world_focus.status === 'resolved'
      ? (slots.world_focus.focuses.find(
          (focus) => focus.entityId === slots.world_focus.primaryFocusId
        ) ??
        slots.world_focus.focuses.find(
          (focus) => focus.role === 'primary' || focus.role === 'target'
        ) ??
        slots.world_focus.focuses[0])
      : undefined

  const [mentionCandidates, previousCandidate] = await Promise.all([
    worldEntityMentionIndexService.search({
      query: text,
      entityType: 'character',
      limit: 8,
      previousFocus: {
        worldId: previousFocus?.worldId,
        entityId: previousFocus?.entityId
      }
    }),
    createPreviousFocusCandidate(worlds, previousFocus)
  ])

  const candidates = mergeFocusCandidates(
    mentionCandidates.map((candidate) => toFocusCandidate(candidate, previousFocus)),
    previousCandidate
  )

  const decision = await resolveFocusWithModel({
    text,
    recentMessages,
    candidates
  })

  const selectedCandidateIds = uniqueStrings([...(decision.selectedCandidateIds ?? [])])
  const selectedCandidates = selectedCandidateIds
    .map((candidateId) => candidates.find((candidate) => candidate.candidateId === candidateId))
    .filter((candidate): candidate is FocusCandidate => Boolean(candidate))

  if (
    decision.type !== 'resolved' ||
    selectedCandidates.length === 0 ||
    decision.confidence < 0.5
  ) {
    if (candidates.length > 0) {
      traceDecision('worldFocusNode', {
        title: '决策: worldFocusNode 未形成确定焦点',
        summary: `${decision.type}，confidence=${decision.confidence.toFixed(2)}，候选 ${candidates.length} 个`,
        data: {
          decision,
          candidates: candidates.slice(0, 5)
        }
      })
    }
    return {
      type: decision.type === 'resolved' ? 'ambiguous' : decision.type,
      confidence: decision.confidence,
      reason: decision.reason,
      candidates
    }
  }

  const resolvedFocuses = (
    await Promise.all(
      selectedCandidates.map((candidate) => {
        const role = roleForCandidate(candidate.candidateId, decision, selectedCandidates.length)
        return buildResolvedFocus({
          candidate,
          worlds,
          confidence: decision.confidence,
          role: role.role,
          reason: role.reason
        })
      })
    )
  ).filter((focus): focus is ResolvedFocus => Boolean(focus))

  if (resolvedFocuses.length === 0) {
    return {
      type: 'none',
      confidence: 0,
      reason: '模型选择的候选人物已不可用。',
      candidates
    }
  }

  const primaryCandidateId =
    decision.primaryCandidateId && selectedCandidateIds.includes(decision.primaryCandidateId)
      ? decision.primaryCandidateId
      : selectedCandidates.find((candidate) => {
          const role = roleForCandidate(candidate.candidateId, decision, selectedCandidates.length)
          return role.role === 'primary' || role.role === 'target'
        })?.candidateId
  const primaryEntityId =
    selectedCandidates.find((candidate) => candidate.candidateId === primaryCandidateId)
      ?.entityId ?? resolvedFocuses[0]?.entity.id

  return {
    type: 'resolved',
    reason: decision.reason,
    focusGroup: {
      focuses: resolvedFocuses,
      confidence: decision.confidence,
      primaryFocusId: primaryEntityId,
      focusTask: {
        type:
          decision.focusTask?.type ??
          (resolvedFocuses.length === 1 ? 'single_analysis' : 'unknown'),
        description: decision.focusTask?.description || decision.reason
      }
    }
  }
}

const parseTime = (value: string | undefined): number | null => {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

const buildCharacterImpressionContext = async (
  characterEntityId: string
): Promise<WorldFocusImpressionContext> => {
  const [existing, freshness] = await Promise.all([
    characterImpressionService.getImpression(characterEntityId),
    characterNarrativeReadingService.getFreshnessSnapshot(characterEntityId)
  ])

  const base = {
    latestNarrativeUpdatedAt: freshness.latestDocumentUpdatedAt,
    narrativeDocumentCount: freshness.totalDocuments,
    narrativeReadableCharacters: freshness.totalReadableCharacters
  }

  if (!existing) {
    return {
      ...base,
      status: 'missing',
      found: false,
      reason:
        freshness.totalDocuments > 0
          ? '该人物有叙事文本，但尚未保存主 agent 人物印象。'
          : '该人物尚未保存主 agent 人物印象，且当前没有可读取的人物叙事文本。'
    }
  }

  const impressionUpdatedAt = parseTime(existing.updatedAt)
  const latestNarrativeUpdatedAt = parseTime(freshness.latestDocumentUpdatedAt)
  const stale =
    Boolean(impressionUpdatedAt && latestNarrativeUpdatedAt) &&
    latestNarrativeUpdatedAt! > impressionUpdatedAt!

  if (stale) {
    return {
      ...base,
      status: 'stale',
      found: true,
      structuredText: existing.structuredText,
      updatedAt: existing.updatedAt,
      reason: '人物叙事文本更新时间晚于已保存人物印象，当前印象可能未覆盖最新文本。'
    }
  }

  return {
    ...base,
    status: 'available',
    found: true,
    structuredText: existing.structuredText,
    updatedAt: existing.updatedAt,
    reason: '已保存人物印象可用于本轮焦点上下文。'
  }
}

const toWorldFocusSlotItem = (focus: ResolvedFocus): WorldFocusItem => ({
  worldId: focus.world.id,
  worldName: focus.world.name,
  focusType: focus.entity.type as WorldEntityType,
  entityId: focus.entity.id,
  entityName: focus.entity.name,
  role: focus.role,
  source: focus.source,
  confidence: focus.confidence,
  reason: focus.reason
})

export async function worldFocusNode(
  state: typeof MessagesState.State,
  perceptionContext: InstantPerceptionContext
): Promise<Partial<typeof MessagesState.State>> {
  const text = perceptionContext.currentUserText
  if (!state.turnWorkspace) {
    throw new Error('worldFocusNode requires an initialized TurnWorkspace.')
  }
  const slots = getEffectiveMemorySlots(state.turnWorkspace)

  try {
    const resolution = await resolveFocus(text, perceptionContext.recentDialogue, slots)
    if (resolution.type !== 'resolved') {
      const nextSlots = {
        ...slots,
        world_focus: {
          ...createDefaultMemorySlots().world_focus,
          status: resolution.type,
          confidence: resolution.confidence,
          updatedAt: new Date().toISOString()
        }
      }

      traceArtifact('worldFocusNode', {
        title: '产物: worldFocusNode 未注入焦点上下文',
        summary: resolution.reason
      })

      return {
        turnWorkspace: withMemorySlotsDraft(state.turnWorkspace, nextSlots)
      }
    }

    const { focusGroup } = resolution
    const primaryFocus =
      focusGroup.focuses.find((focus) => focus.entity.id === focusGroup.primaryFocusId) ??
      focusGroup.focuses.find((focus) => focus.role === 'primary' || focus.role === 'target') ??
      focusGroup.focuses[0]

    emitAgentStage({
      stageId: 'world-focus-resolve',
      label: '正在聚焦世界观对象',
      status: 'running'
    })

    const focusItems = focusGroup.focuses.map(toWorldFocusSlotItem)
    const nextSlots = {
      ...slots,
      world_focus: {
        mode: focusItems.length > 1 ? ('multi' as const) : ('single' as const),
        primaryFocusId: primaryFocus.entity.id,
        focuses: focusItems,
        focusTask: focusGroup.focusTask,
        confidence: focusGroup.confidence,
        status: 'resolved' as const,
        updatedAt: new Date().toISOString()
      }
    }

    const contextFocuses = await Promise.all(
      focusGroup.focuses.map(async (focus) => {
        let impression: WorldFocusImpressionContext | undefined
        if (focus.entity.type === 'character') {
          emitAgentStage({
            stageId: `world-focus-impression-${focus.entity.id}`,
            label: '正在读取人物印象',
            status: 'running'
          })
          impression = await buildCharacterImpressionContext(focus.entity.id)
        }
        return {
          ...toWorldFocusSlotItem(focus),
          impression
        }
      })
    )
    const primaryContextFocus =
      contextFocuses.find((focus) => focus.entityId === primaryFocus.entity.id) ?? contextFocuses[0]
    const impression = primaryContextFocus?.impression

    if (primaryFocus.entity.type === 'character') {
      emitAgentStage({
        stageId: `world-focus-impression-${primaryFocus.entity.id}`,
        label: '人物印象已读取',
        status: 'done'
      })
    }

    const worldFocusContext: WorldFocusContext = {
      mode: focusGroup.focuses.length > 1 ? 'multi' : 'single',
      primaryFocusId: primaryFocus.entity.id,
      focuses: contextFocuses,
      confidence: focusGroup.confidence,
      focusTask: focusGroup.focusTask
    }

    traceDecision('worldFocusNode', {
      title: '决策: worldFocusNode 聚焦成功',
      summary: `${focusGroup.focuses.length > 1 ? '多焦点' : '单焦点'}：${contextFocuses
        .map((focus) => focus.entityName)
        .join('、')}`,
      data: {
        mode: worldFocusContext.mode,
        primaryFocusId: worldFocusContext.primaryFocusId,
        focusTask: worldFocusContext.focusTask,
        focuses: contextFocuses,
        confidence: focusGroup.confidence,
        hasImpression: Boolean(impression?.found),
        impressionStatus: impression?.status,
        latestNarrativeUpdatedAt: impression?.latestNarrativeUpdatedAt
      }
    })

    emitAgentStage({
      stageId: 'world-focus-resolve',
      label: '世界观焦点已就绪',
      status: 'done'
    })
    traceArtifact('worldFocusNode', {
      title: '产物: worldFocusNode 本轮聚焦上下文',
      summary: `${contextFocuses.map((focus) => focus.entityName).join('、')}${
        impression?.status ? `，主焦点人物印象状态：${impression.status}` : ''
      }`
    })

    return {
      worldFocusContext,
      turnWorkspace: withMemorySlotsDraft(state.turnWorkspace, nextSlots)
    }
  } catch (error) {
    const nextSlots = {
      ...slots,
      world_focus: {
        ...createDefaultMemorySlots().world_focus,
        updatedAt: new Date().toISOString()
      }
    }

    traceError('worldFocusNode', error, {
      title: '异常: worldFocusNode 聚焦失败',
      summary: error instanceof Error ? error.message : String(error)
    })
    emitAgentStage({
      stageId: 'world-focus-resolve',
      label: '世界观焦点识别失败',
      status: 'error',
      detail: error instanceof Error ? error.message : String(error)
    })
    return {
      turnWorkspace: withMemorySlotsDraft(state.turnWorkspace, nextSlots)
    }
  }
}
