import { HumanMessage } from '@langchain/core/messages'
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
import { MessagesState, type WorldFocusContext } from '../../state/messageState'

type ResolvedFocus = {
  world: WorldPayload
  entity: WorldEntityPayload
  confidence: number
  source: 'mention_index' | 'previous_focus'
  matchedMentions?: string[]
  score?: number
}

const RESOLVE_SCORE_THRESHOLD = 0.7
const AMBIGUOUS_SCORE_THRESHOLD = 0.45
const MIN_SCORE_GAP = 0.12

const normalizeText = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase()

const getCurrentUserText = (state: typeof MessagesState.State): string => {
  const message = state.messages
    .slice()
    .reverse()
    .find((item) => item instanceof HumanMessage && !item.additional_kwargs?.isHistory)
  return message ? contentToText(message.content).trim() : ''
}

const findMentionedWorld = (worlds: WorldPayload[], text: string): WorldPayload | null => {
  const normalized = normalizeText(text)
  return (
    worlds
      .filter(
        (world) =>
          normalizeText(world.name).length >= 2 && normalized.includes(normalizeText(world.name))
      )
      .sort((a, b) => b.name.length - a.name.length)[0] ?? null
  )
}

const looksLikeExistingFocusReference = (text: string): boolean =>
  /(这个人物|这个角色|该人物|该角色|他|她|ta|TA|其|他的|她的|ta的|它)/.test(text)

const resolveCandidateDecision = (
  candidates: WorldEntityMentionSearchCandidate[]
): WorldEntityMentionSearchCandidate | null => {
  const [top, second] = candidates
  if (!top) return null
  if (top.score < RESOLVE_SCORE_THRESHOLD) return null
  if (
    second &&
    second.score >= AMBIGUOUS_SCORE_THRESHOLD &&
    top.score - second.score < MIN_SCORE_GAP
  ) {
    return null
  }
  return top
}

const resolveFocus = async (text: string): Promise<ResolvedFocus | null> => {
  if (!text.trim()) return null

  const [worlds, slots] = await Promise.all([
    worldbuildingService.listWorlds(),
    memorySlotService.getSnapshot()
  ])
  if (worlds.length === 0) return null

  const mentionedWorld = findMentionedWorld(worlds, text)
  const existingWorld =
    slots.world_focus.worldId && slots.world_focus.status === 'resolved'
      ? (worlds.find((world) => world.id === slots.world_focus.worldId) ?? null)
      : null
  const scopedWorlds = mentionedWorld
    ? [mentionedWorld]
    : existingWorld
      ? [existingWorld]
      : worlds.length === 1
        ? [worlds[0]]
        : worlds

  if (
    slots.world_focus.status === 'resolved' &&
    slots.world_focus.worldId &&
    slots.world_focus.entityId &&
    slots.world_focus.entityName &&
    looksLikeExistingFocusReference(text)
  ) {
    const world = worlds.find((item) => item.id === slots.world_focus.worldId)
    if (!world) return null
    const detail = await worldbuildingService.getEntityDetail(slots.world_focus.entityId)
    if (
      !detail ||
      detail.entity.worldId !== world.id ||
      detail.entity.type !== slots.world_focus.focusType
    ) {
      return null
    }
    return {
      world,
      entity: detail.entity,
      confidence: 0.62,
      source: 'previous_focus'
    }
  }

  const scopedWorldId = scopedWorlds.length === 1 ? scopedWorlds[0].id : undefined
  const candidates = await worldEntityMentionIndexService.search({
    query: text,
    worldId: scopedWorldId,
    entityType: 'character',
    limit: 8,
    previousFocus: {
      worldId: slots.world_focus.worldId,
      entityId: slots.world_focus.entityId
    }
  })
  const selected = resolveCandidateDecision(candidates)
  if (!selected) {
    if (candidates.length > 0) {
      traceDecision('worldFocusNode', {
        title: '决策: worldFocusNode 候选未达聚焦阈值',
        summary: `候选 ${candidates.length} 个，top=${candidates[0]?.entityName ?? 'none'} score=${candidates[0]?.score.toFixed(3) ?? '0'}`,
        data: {
          candidates: candidates.slice(0, 5)
        }
      })
    }
    return null
  }

  const world = worlds.find((item) => item.id === selected.worldId)
  if (!world) return null
  const detail = await worldbuildingService.getEntityDetail(selected.entityId)
  if (!detail || detail.entity.worldId !== world.id || detail.entity.type !== selected.entityType) {
    return null
  }

  return {
    world,
    entity: detail.entity,
    confidence: Math.max(0.5, Math.min(0.96, selected.score)),
    source: 'mention_index',
    matchedMentions: selected.matchedMentions,
    score: selected.score
  }
}

const parseTime = (value: string | undefined): number | null => {
  if (!value) return null
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

const hasEvidenceMarker = (value: string | undefined): boolean => {
  const text = String(value ?? '').trim()
  return /(证据|来源|documentId|readingTaskId|path|文件|阅读)/i.test(text)
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

  if (!hasEvidenceMarker(existing.updateMarker) && !hasEvidenceMarker(existing.structuredText)) {
    return {
      ...base,
      status: 'insufficient',
      found: true,
      structuredText: existing.structuredText,
      updatedAt: existing.updatedAt,
      reason: '已保存人物印象缺少明确阅读任务或文本证据来源，深度判断时应谨慎。'
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
    const focus = await resolveFocus(text)
    if (!focus) {
      return {}
    }

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
