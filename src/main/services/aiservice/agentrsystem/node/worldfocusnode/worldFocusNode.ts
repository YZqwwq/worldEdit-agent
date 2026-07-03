import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
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
import { memorySlotService } from '../../manager/memory/memorySlotService'
import { getQuickModel } from '../../modelwithtool/quick-base-model'
import { MessagesState, type WorldFocusContext } from '../../state/messageState'

type ResolvedFocus = {
  world: WorldPayload
  entity: WorldEntityPayload
  confidence: number
  source: 'mention_index' | 'previous_focus'
  matchedMentions?: string[]
  score?: number
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
      focus: ResolvedFocus
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
    selectedCandidateId: z.string().trim().optional(),
    confidence: z.number().finite().min(0).max(1),
    reason: z.string().trim().min(1).max(300)
  })
})

const getCurrentUserText = (state: typeof MessagesState.State): string => {
  const message = state.messages
    .slice()
    .reverse()
    .find((item) => item instanceof HumanMessage && !item.additional_kwargs?.isHistory)
  return message ? contentToText(message.content).trim() : ''
}

type RecentMessagePreview = {
  role: 'user' | 'assistant'
  text: string
}

const compact = (value: string, max = 420): string => {
  const normalized = String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

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

const buildRecentMessagePreview = (
  state: typeof MessagesState.State,
  limit = 6
): RecentMessagePreview[] =>
  state.messages
    .filter((message) => message instanceof HumanMessage || message instanceof AIMessage)
    .filter((message) => !message.additional_kwargs?.isHistory)
    .slice(-limit)
    .map(
      (message): RecentMessagePreview => ({
        role: message instanceof HumanMessage ? 'user' : 'assistant',
        text: compact(contentToText(message.content), 360)
      })
    )
    .filter((item) => item.text.length > 0)

const toFocusCandidate = (
  candidate: WorldEntityMentionSearchCandidate,
  previousFocus?: { worldId?: string; entityId?: string }
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
  previousFocus: {
    status?: string
    worldId?: string
    entityId?: string
    focusType?: WorldEntityType
  }
): Promise<FocusCandidate | null> => {
  if (
    previousFocus.status !== 'resolved' ||
    !previousFocus.worldId ||
    !previousFocus.entityId ||
    !previousFocus.focusType
  ) {
    return null
  }

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
  recentMessages: RecentMessagePreview[]
  candidates: FocusCandidate[]
}): string => `你是“应用内世界观焦点裁决器”，不是聊天助手。你只判断用户最新输入真正指向哪个候选人物。

目标：
从候选列表中判断本轮是否能确定一个应用内人物焦点。

判断规则：
1. 候选由索引召回和历史焦点提供。索引分数只是检索特征，不是最终结论。
2. 不要用关键词或代词机械判断。必须结合用户最新输入、最近对话和候选信息判断真实指向。
3. previous_focus 候选只有在用户明显延续上一轮人物、追问该人物，或最近对话上下文足以承接时才可选择。
4. 如果用户只是泛泛讨论创作、现实作品、例子，或没有指向任何候选，返回 none。
5. 如果多个候选都合理，或上下文不足以区分，返回 ambiguous。
6. 只有确实能定位到一个候选人物时才返回 resolved。

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
    "selectedCandidateId": "仅 resolved 时填写候选 id",
    "confidence": 0.0,
    "reason": "不超过120字，说明为什么"
  }
}`

const resolveFocusWithModel = async (input: {
  text: string
  recentMessages: RecentMessagePreview[]
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

const resolveFocus = async (
  text: string,
  recentMessages: RecentMessagePreview[]
): Promise<FocusResolutionResult> => {
  if (!text.trim()) {
    return {
      type: 'none',
      confidence: 0,
      reason: '用户最新输入为空，无法识别世界观焦点。',
      candidates: []
    }
  }

  const [worlds, slots] = await Promise.all([
    worldbuildingService.listWorlds(),
    memorySlotService.getSnapshot()
  ])
  if (worlds.length === 0) {
    return {
      type: 'none',
      confidence: 0,
      reason: '当前没有可用世界观。',
      candidates: []
    }
  }

  const [mentionCandidates, previousCandidate] = await Promise.all([
    worldEntityMentionIndexService.search({
      query: text,
      entityType: 'character',
      limit: 8,
      previousFocus: {
        worldId: slots.world_focus.worldId,
        entityId: slots.world_focus.entityId
      }
    }),
    createPreviousFocusCandidate(worlds, slots.world_focus)
  ])

  const candidates = mergeFocusCandidates(
    mentionCandidates.map((candidate) => toFocusCandidate(candidate, slots.world_focus)),
    previousCandidate
  )

  const decision = await resolveFocusWithModel({
    text,
    recentMessages,
    candidates
  })

  const selected = candidates.find(
    (candidate) => candidate.candidateId === decision.selectedCandidateId
  )
  if (decision.type !== 'resolved' || !selected || decision.confidence < 0.5) {
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

  const world = worlds.find((item) => item.id === selected.worldId)
  if (!world) {
    return {
      type: 'none',
      confidence: 0,
      reason: '模型选择的候选所属世界观不存在。',
      candidates
    }
  }
  const detail = await worldbuildingService.getEntityDetail(selected.entityId)
  if (!detail || detail.entity.worldId !== world.id || detail.entity.type !== selected.entityType) {
    return {
      type: 'none',
      confidence: 0,
      reason: '模型选择的候选人物已不可用。',
      candidates
    }
  }

  return {
    type: 'resolved',
    reason: decision.reason,
    focus: {
      world,
      entity: detail.entity,
      confidence: decision.confidence,
      source: selected.source,
      matchedMentions: selected.matchedMentions,
      score: selected.score
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
): Promise<WorldFocusContext['impression']> => {
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

export async function worldFocusNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const text = getCurrentUserText(state)

  try {
    const resolution = await resolveFocus(text, buildRecentMessagePreview(state))
    if (resolution.type !== 'resolved') {
      await memorySlotService.replaceWorldFocus({
        status: resolution.type,
        confidence: resolution.confidence
      })

      traceArtifact('worldFocusNode', {
        title: '产物: worldFocusNode 未注入焦点上下文',
        summary: resolution.reason
      })

      return {}
    }

    const { focus } = resolution

    emitAgentStage({
      stageId: 'world-focus-resolve',
      label: '正在聚焦世界观对象',
      status: 'running'
    })

    await memorySlotService.updateWorldFocus({
      worldId: focus.world.id,
      worldName: focus.world.name,
      focusType: focus.entity.type as WorldEntityType,
      entityId: focus.entity.id,
      entityName: focus.entity.name,
      confidence: focus.confidence,
      status: 'resolved'
    })

    let impression: WorldFocusContext['impression'] | undefined
    if (focus.entity.type === 'character') {
      emitAgentStage({
        stageId: `world-focus-impression-${focus.entity.id}`,
        label: '正在读取人物印象',
        status: 'running'
      })
      impression = await buildCharacterImpressionContext(focus.entity.id)
    }

    const worldFocusContext: WorldFocusContext = {
      worldId: focus.world.id,
      worldName: focus.world.name,
      focusType: focus.entity.type,
      entityId: focus.entity.id,
      entityName: focus.entity.name,
      confidence: focus.confidence,
      impression
    }

    traceDecision('worldFocusNode', {
      title: '决策: worldFocusNode 聚焦成功',
      summary: `${focus.world.name} / ${focus.entity.type} / ${focus.entity.name}`,
      data: {
        worldId: focus.world.id,
        entityId: focus.entity.id,
        entityType: focus.entity.type,
        confidence: focus.confidence,
        source: focus.source,
        matchedMentions: focus.matchedMentions,
        mentionScore: focus.score,
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
      summary: `${focus.entity.name}${impression?.status ? `，人物印象状态：${impression.status}` : ''}`
    })

    return {
      worldFocusContext
    }
  } catch (error) {
    try {
      await memorySlotService.replaceWorldFocus({
        status: 'none',
        confidence: 0
      })
    } catch (slotError) {
      traceError('worldFocusNode', slotError, {
        title: '异常: worldFocusNode 清理焦点槽失败',
        summary: slotError instanceof Error ? slotError.message : String(slotError)
      })
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
    return {}
  }
}
