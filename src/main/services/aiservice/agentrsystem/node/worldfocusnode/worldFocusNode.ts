import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type {
  WorldEntityPayload,
  WorldEntityType,
  WorldPayload
} from '@share/cache/worldbuilding/worldbuilding'
import { characterImpressionService } from '../../../../worldbuilding/characterImpressionService'
import {
  characterNarrativeReadingService,
  type CharacterNarrativeReadingChunk
} from '../../../../worldbuilding/characterNarrativeReadingService'
import { worldbuildingService } from '../../../../worldbuilding/worldbuildingService'
import {
  emitAgentStage,
  traceArtifact,
  traceDecision,
  traceError
} from '../../../../log/trace/agentTraceEmitter'
import { contentToText } from '../../../messageoutput/transformRespones'
import { getConfiguredQuickModel } from '../../modelwithtool/model'
import { memorySlotService } from '../../manager/memory/memorySlotService'
import { MessagesState, type WorldFocusContext } from '../../state/messageState'

type ResolvedFocus = {
  world: WorldPayload
  entity: WorldEntityPayload
  confidence: number
}

const MAX_READING_CHARS_FOR_FOCUS = 60000
const DEFAULT_BATCH_MAX_CHARS = 24000

const normalizeText = (value: unknown): string => String(value ?? '').trim().toLowerCase()

const getCurrentUserText = (state: typeof MessagesState.State): string => {
  const message = state.messages
    .slice()
    .reverse()
    .find((item) => item instanceof HumanMessage && !item.additional_kwargs?.isHistory)
  return message ? contentToText(message.content).trim() : ''
}

const canUseNameForMatch = (name: string): boolean => normalizeText(name).length >= 2

const findMentionedWorld = (worlds: WorldPayload[], text: string): WorldPayload | null => {
  const normalized = normalizeText(text)
  return (
    worlds
      .filter((world) => canUseNameForMatch(world.name) && normalized.includes(normalizeText(world.name)))
      .sort((a, b) => b.name.length - a.name.length)[0] ?? null
  )
}

const findMentionedEntities = (
  worlds: WorldPayload[],
  entitiesByWorldId: Map<string, WorldEntityPayload[]>,
  text: string
): ResolvedFocus[] => {
  const normalized = normalizeText(text)
  const worldById = new Map(worlds.map((world) => [world.id, world]))
  const matches: ResolvedFocus[] = []

  for (const [worldId, entities] of entitiesByWorldId.entries()) {
    const world = worldById.get(worldId)
    if (!world) continue

    for (const entity of entities) {
      const names = [entity.name, entity.title, entity.slug].filter(
        (name): name is string => typeof name === 'string' && canUseNameForMatch(name)
      )
      const matchedName = names.find((name) => normalized.includes(normalizeText(name)))
      if (matchedName) {
        matches.push({
          world,
          entity,
          confidence: Math.min(0.96, 0.72 + Math.min(matchedName.length, 12) / 50)
        })
      }
    }
  }

  return matches.sort((a, b) => {
    const lengthDelta = b.entity.name.length - a.entity.name.length
    if (lengthDelta !== 0) return lengthDelta
    return b.confidence - a.confidence
  })
}

const looksLikeExistingFocusReference = (text: string): boolean =>
  /(这个人物|这个角色|该人物|该角色|他|她|ta|TA|其|他的|她的|ta的|它)/.test(text)

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
      ? worlds.find((world) => world.id === slots.world_focus.worldId) ?? null
      : null
  const scopedWorlds = mentionedWorld
    ? [mentionedWorld]
    : existingWorld
      ? [existingWorld]
      : worlds.length === 1
        ? [worlds[0]]
        : worlds

  const entitiesByWorldId = new Map<string, WorldEntityPayload[]>()
  await Promise.all(
    scopedWorlds.map(async (world) => {
      entitiesByWorldId.set(world.id, await worldbuildingService.listEntities(world.id))
    })
  )

  const matches = findMentionedEntities(scopedWorlds, entitiesByWorldId, text)
  if (matches.length > 0) {
    return matches[0]
  }

  if (
    slots.world_focus.status === 'resolved' &&
    slots.world_focus.worldId &&
    slots.world_focus.entityId &&
    slots.world_focus.entityName &&
    looksLikeExistingFocusReference(text)
  ) {
    const world = worlds.find((item) => item.id === slots.world_focus.worldId)
    if (!world) return null
    const entities = await worldbuildingService.listEntities(world.id, slots.world_focus.focusType)
    const entity = entities.find((item) => item.id === slots.world_focus.entityId)
    if (!entity) return null
    return {
      world,
      entity,
      confidence: 0.62
    }
  }

  return null
}

const collectCharacterReadingText = async (
  characterEntityId: string
): Promise<{
  text: string
  truncated: boolean
  sourceCount: number
}> => {
  const task = await characterNarrativeReadingService.createReadingTask({
    characterEntityId,
    mode: 'full',
    mission: '形成对人物的整体概念',
    outputIntent: {
      kind: 'character_impression',
      instructions: '生成主 agent 对人物的结构化印象'
    },
    maxBatchChars: DEFAULT_BATCH_MAX_CHARS
  })
  let cursor: string | undefined = task.firstCursor
  let hasMore = task.totalDocuments > 0
  let totalText = ''
  let sourceCount = 0
  let truncated = false

  while (hasMore && totalText.length < MAX_READING_CHARS_FOR_FOCUS) {
    const batch = await characterNarrativeReadingService.readTaskBatch({
      task,
      cursor
    })
    const sections = batch.chunks
      .filter((chunk): chunk is CharacterNarrativeReadingChunk => Boolean(chunk.text.trim()))
      .map((chunk) => {
        sourceCount += 1
        return `### ${chunk.path.join(' > ')}\n[documentId=${chunk.documentId}; chunk=${chunk.chunkIndex + 1}/${chunk.chunkCount}]\n${chunk.text}`
      })
      .join('\n\n')

    if (sections) {
      totalText = `${totalText}${totalText ? '\n\n' : ''}${sections}`
    }

    hasMore = batch.hasMore
    cursor = batch.nextCursor ?? undefined
    if (totalText.length >= MAX_READING_CHARS_FOR_FOCUS && hasMore) {
      truncated = true
      break
    }
  }

  return {
    text: totalText.slice(0, MAX_READING_CHARS_FOR_FOCUS),
    truncated,
    sourceCount
  }
}

const buildFallbackImpression = (
  character: WorldEntityPayload,
  reading: { text: string; truncated: boolean; sourceCount: number }
): string => [
  `# ${character.name}：人物印象`,
  '',
  '## 当前结论',
  reading.text.trim()
    ? '已读取该人物的叙事文本，但快速模型暂时不可用；以下为待主 agent 后续细化的基础印象占位。'
    : '该人物当前没有可读取的叙事文本，因此主 agent 暂无稳定人物印象。',
  '',
  '## 证据状态',
  `读取来源数：${reading.sourceCount}`,
  `是否截断：${reading.truncated ? '是' : '否'}`,
  '',
  '## 主观看法',
  '证据不足，暂不形成强评价。'
].join('\n')

const generateCharacterImpression = async (
  character: WorldEntityPayload,
  world: WorldPayload
): Promise<WorldFocusContext['impression']> => {
  emitAgentStage({
    stageId: `world-focus-read-${character.id}`,
    label: '正在阅读人物文本',
    status: 'running'
  })
  const reading = await collectCharacterReadingText(character.id)
  let structuredText = buildFallbackImpression(character, reading)

  if (reading.text.trim()) {
    try {
      emitAgentStage({
        stageId: `world-focus-summarize-${character.id}`,
        label: '正在形成人物印象',
        status: 'running'
      })
      const quickModel = await getConfiguredQuickModel()
      const response = await quickModel.invoke([
        new SystemMessage(
          [
            '你是主 Agent 的人物印象生成节点。根据提供的世界观人物叙事文本，生成可持久保存的结构化人物印象。',
            '要求：',
            '1. 使用中文 Markdown。',
            '2. 必须包含：外貌特征、性格特征、行为特征、能力特征、主要事迹、人物关系、矛盾/未知、主 Agent 主观看法、证据来源。',
            '3. 不要编造文本中没有依据的事实；不确定时明确写“未知/证据不足”。',
            '4. 主观看法可以有人格化评价，但必须与证据区分。',
            '',
            `世界观：${world.name}`,
            `人物：${character.name}`,
            `文本是否截断：${reading.truncated ? '是' : '否'}`,
            '',
            '叙事文本：',
            reading.text
          ].join('\n')
        )
      ])
      const modelText = contentToText(response.content).trim()
      if (modelText) {
        structuredText = modelText
      }
    } catch (error) {
      traceError('worldFocusNode', error, {
        title: '异常: worldFocusNode 生成人物印象失败',
        summary: '快速模型生成失败，使用基础占位印象'
      })
    }
  }

  const saved = await characterImpressionService.upsertImpression({
    characterEntityId: character.id,
    structuredText,
    updateMarker: ''
  })
  return {
    found: true,
    structuredText: saved.structuredText,
    updatedAt: saved.updatedAt,
    generatedThisTurn: true
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
      const existing = await characterImpressionService.getImpression(focus.entity.id)
      impression = existing
        ? {
            found: true,
            structuredText: existing.structuredText,
            updatedAt: existing.updatedAt
          }
        : await generateCharacterImpression(focus.entity, focus.world)
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
        hasImpression: Boolean(impression?.found),
        generatedImpression: Boolean(impression?.generatedThisTurn)
      }
    })

    emitAgentStage({
      stageId: 'world-focus-resolve',
      label: '世界观焦点已就绪',
      status: 'done'
    })
    traceArtifact('worldFocusNode', {
      title: '产物: worldFocusNode 本轮聚焦上下文',
      summary: `${focus.entity.name}${impression?.generatedThisTurn ? '，本轮新建人物印象' : ''}`
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
