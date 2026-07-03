import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { SceneDomain, ScenePerceptionSlot } from '@share/cache/AItype/states/memorySlots'
import { contentToText } from '../../../messageoutput/transformRespones'
import { memorySlotService } from '../../manager/memory/memorySlotService'
import { getQuickModel } from '../../modelwithtool/quick-base-model'
import { MessagesState } from '../../state/messageState'
import { buildConversationStateFromScenePerception } from '../../state/sceneContextAdapter'
import { traceArtifact, traceDecision, traceError } from '../../../../log/trace/agentTraceEmitter'

const SCENE_DOMAINS = [
  'app_worldbuilding',
  'general_creative',
  'external_media',
  'practical_support',
  'daily_life',
  'knowledge_query',
  'relational_intimacy',
  'unknown'
] as const

const SCENE_CONTINUITIES = [
  'continue_current_scene',
  'temporary_reference',
  'scene_shift',
  'new_scene',
  'uncertain'
] as const

const scenePerceptionResponseSchema = z.object({
  primaryDomain: z.enum(SCENE_DOMAINS),
  referenceDomains: z.array(z.enum(SCENE_DOMAINS)).max(4).default([]),
  continuity: z.enum(SCENE_CONTINUITIES),
  currentSceneStillActive: z.boolean(),
  appWorldbuildingDiscussionRelated: z.boolean(),
  appWorldbuildingInstanceRelated: z.boolean(),
  shouldRunWorldFocus: z.boolean(),
  shouldInjectHistoricalWorldFocus: z.boolean(),
  confidence: z.number().finite().min(0).max(1),
  reason: z.string().trim().min(1).max(300),
  evidence: z.array(z.string().trim().min(1).max(120)).max(6).default([])
})

type RecentMessagePreview = {
  role: 'user' | 'assistant'
  text: string
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

const compact = (value: string, max = 500): string => {
  const normalized = String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

const getCurrentUserText = (state: typeof MessagesState.State): string => {
  const message = state.messages
    .slice()
    .reverse()
    .find((item) => item instanceof HumanMessage && !item.additional_kwargs?.isHistory)
  return message ? contentToText(message.content).trim() : ''
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

const buildScenePrompt = (input: {
  currentUserText: string
  recentMessages: RecentMessagePreview[]
  previousScene?: ScenePerceptionSlot
  memoryWorldFocus?: {
    status?: string
    worldName?: string
    focusType?: string
    entityName?: string
    entityId?: string
  }
  activeTask?: {
    title?: string
    goal?: string
    status?: string
    summary?: string
  }
}): string => `你是“场景连续性判断器”，不是聊天助手。你只判断用户最新输入与当前持续场景的关系，不回答用户。

目标：
判断本轮是否需要进入“应用内世界观实例感知”（worldFocusNode），以及是否允许把历史世界观焦点注入主 LLM 上下文。

你必须区分三类情况：
1. 用户已经转移场景：主讨论对象换成了现实电影、外部作品、代码、生活、知识问答等。
2. 用户依然在当前场景，只是临时提到其他方向作为例子、参考、类比、距离感或风格参照。
3. 用户继续在当前场景推进。

特别注意：
- 不要用关键词判断。“剧情/角色/设定/世界观”等词可能是在聊现实电影、小说、游戏或一般创作。
- 出现现实电影、小说、游戏、历史、代码、生活例子，不一定是场景转移；它可能只是应用内世界观编辑的临时参考对象。
- 判断关键是：用户本轮真正想推进的主目标是什么。
- 如果外部对象只是比较、参考、举例、类比，而用户仍在要求修改/分析当前应用内对象，continuity=temporary_reference，primaryDomain=app_worldbuilding。
- 如果用户明确或明显把主讨论目标切换到外部作品、现实工作、普通闲聊等，continuity=scene_shift。
- appWorldbuildingInstanceRelated 只在用户指向本应用内已有世界观、人物、实体、人物文本、人物印象，或延续已识别的本地 world/entity 焦点时为 true。
- 泛泛创作/新设定构思可以是 appWorldbuildingDiscussionRelated=true，但若没有指向本地已有实例，则 appWorldbuildingInstanceRelated=false。
- 低置信度时保持保守：shouldRunWorldFocus=false，shouldInjectHistoricalWorldFocus=false。

字段含义：
- primaryDomain: 本轮主讨论/主任务场景。
- referenceDomains: 本轮临时提到的参考场景，不是主任务。
- continuity:
  - continue_current_scene: 继续当前场景。
  - temporary_reference: 仍在当前场景，但临时引用别的领域/作品/例子。
  - scene_shift: 已经切换主场景。
  - new_scene: 开启新场景。
  - uncertain: 无法确定。
- shouldRunWorldFocus: 是否运行应用内世界观实例聚焦。
- shouldInjectHistoricalWorldFocus: 是否允许主 LLM 本轮使用历史 world_focus。

当前用户最新输入：
${input.currentUserText || '(empty)'}

最近对话预览：
${JSON.stringify(input.recentMessages, null, 2)}

上一轮场景判断：
${input.previousScene ? JSON.stringify(input.previousScene, null, 2) : '(none)'}

历史世界观焦点 memory slot：
${input.memoryWorldFocus ? JSON.stringify(input.memoryWorldFocus, null, 2) : '(none)'}

当前活跃任务：
${input.activeTask ? JSON.stringify(input.activeTask, null, 2) : '(none)'}

只输出 JSON，不要 Markdown，不要解释。格式：
{
  "primaryDomain": "app_worldbuilding | general_creative | external_media | practical_support | daily_life | knowledge_query | relational_intimacy | unknown",
  "referenceDomains": ["external_media"],
  "continuity": "continue_current_scene | temporary_reference | scene_shift | new_scene | uncertain",
  "currentSceneStillActive": true,
  "appWorldbuildingDiscussionRelated": true,
  "appWorldbuildingInstanceRelated": true,
  "shouldRunWorldFocus": true,
  "shouldInjectHistoricalWorldFocus": true,
  "confidence": 0.0,
  "reason": "不超过120字，说明判断理由",
  "evidence": ["最多6条证据"]
}`

const normalizeScenePerception = (
  parsed: z.infer<typeof scenePerceptionResponseSchema>,
  input: {
    previousScene?: ScenePerceptionSlot
    memoryWorldFocus?: {
      entityName?: string
      entityId?: string
    }
  }
): ScenePerceptionSlot => {
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence)))
  const conservative = confidence < 0.6 || parsed.continuity === 'uncertain'
  const shouldRunWorldFocus = !conservative && parsed.shouldRunWorldFocus === true
  const shouldInjectHistoricalWorldFocus =
    !conservative && parsed.shouldInjectHistoricalWorldFocus === true

  return {
    primaryDomain: parsed.primaryDomain,
    referenceDomains: parsed.referenceDomains.filter(
      (domain): domain is SceneDomain => domain !== parsed.primaryDomain
    ),
    continuity: parsed.continuity,
    currentSceneStillActive: parsed.currentSceneStillActive,
    appWorldbuildingDiscussionRelated: parsed.appWorldbuildingDiscussionRelated,
    appWorldbuildingInstanceRelated: parsed.appWorldbuildingInstanceRelated,
    shouldRunWorldFocus,
    shouldInjectHistoricalWorldFocus,
    confidence,
    reason: parsed.reason,
    evidence: parsed.evidence,
    source: 'sceneNode',
    updatedAt: new Date().toISOString(),
    previousScene: {
      primaryDomain: input.previousScene?.primaryDomain,
      appWorldbuildingInstanceRelated: input.previousScene?.appWorldbuildingInstanceRelated,
      worldFocusEntityName: input.memoryWorldFocus?.entityName,
      worldFocusEntityId: input.memoryWorldFocus?.entityId
    }
  }
}

const buildFallbackScenePerception = (input: {
  previousScene?: ScenePerceptionSlot
  memoryWorldFocus?: {
    entityName?: string
    entityId?: string
  }
  reason: string
}): ScenePerceptionSlot => ({
  primaryDomain: 'unknown',
  referenceDomains: [],
  continuity: 'uncertain',
  currentSceneStillActive: false,
  appWorldbuildingDiscussionRelated: false,
  appWorldbuildingInstanceRelated: false,
  shouldRunWorldFocus: false,
  shouldInjectHistoricalWorldFocus: false,
  confidence: 0,
  reason: input.reason,
  evidence: ['轻量模型场景判断失败，采用保守降级。'],
  source: 'sceneNode',
  updatedAt: new Date().toISOString(),
  previousScene: {
    primaryDomain: input.previousScene?.primaryDomain,
    appWorldbuildingInstanceRelated: input.previousScene?.appWorldbuildingInstanceRelated,
    worldFocusEntityName: input.memoryWorldFocus?.entityName,
    worldFocusEntityId: input.memoryWorldFocus?.entityId
  }
})

export async function sceneNode(
  state: typeof MessagesState.State
): Promise<Partial<typeof MessagesState.State>> {
  const currentUserText = getCurrentUserText(state)
  const slots = await memorySlotService.getSnapshot()
  const memoryWorldFocus =
    slots.world_focus.status === 'resolved'
      ? {
          status: slots.world_focus.status,
          worldName: slots.world_focus.worldName,
          focusType: slots.world_focus.focusType,
          entityName: slots.world_focus.entityName,
          entityId: slots.world_focus.entityId
        }
      : undefined

  try {
    const quickModel = await getQuickModel()
    const response = await quickModel.invoke(
      [
        new SystemMessage('你只负责返回合法 JSON。'),
        new HumanMessage(
          buildScenePrompt({
            currentUserText,
            recentMessages: buildRecentMessagePreview(state),
            previousScene: slots.scene_perception,
            memoryWorldFocus,
            activeTask: state.taskLifecycle?.activeTask
              ? {
                  title: state.taskLifecycle.activeTask.title,
                  goal: state.taskLifecycle.activeTask.goal,
                  status: state.taskLifecycle.activeTask.status,
                  summary: state.taskLifecycle.activeTask.summary
                }
              : undefined
          })
        )
      ],
      { signal: AbortSignal.timeout(8000) } as Record<string, unknown>
    )

    const text = contentToText(response.content).trim()
    const jsonText = extractJsonObject(text)
    if (!jsonText) {
      throw new Error('Scene model did not return valid JSON content')
    }

    const parsed = scenePerceptionResponseSchema.parse(JSON.parse(jsonText))
    const scenePerception = normalizeScenePerception(parsed, {
      previousScene: slots.scene_perception,
      memoryWorldFocus
    })
    const conversationState = buildConversationStateFromScenePerception(
      scenePerception,
      slots.conversation_state
    )

    await memorySlotService.updateSceneState({
      scenePerception,
      conversationState: conversationState ?? slots.conversation_state
    })

    traceDecision('sceneNode', {
      title: '决策: sceneNode 场景判断完成',
      summary:
        `${scenePerception.primaryDomain}/${scenePerception.continuity}` +
        `，worldFocus=${scenePerception.shouldRunWorldFocus ? 'run' : 'skip'}` +
        `，confidence=${scenePerception.confidence.toFixed(2)}`,
      data: {
        scenePerception,
        persistedConversationState: conversationState ?? null
      }
    })

    traceArtifact('sceneNode', {
      title: '产物: sceneNode 场景上下文',
      summary: scenePerception.reason
    })

    return {}
  } catch (error) {
    traceError('sceneNode', error, {
      title: '异常: sceneNode 场景判断失败',
      summary: error instanceof Error ? error.message : String(error)
    })

    const fallbackScene = buildFallbackScenePerception({
      previousScene: slots.scene_perception,
      memoryWorldFocus,
      reason: error instanceof Error ? error.message : String(error)
    })
    const fallbackConversationState = buildConversationStateFromScenePerception(
      fallbackScene,
      slots.conversation_state
    )
    await memorySlotService.updateSceneState({
      scenePerception: fallbackScene,
      conversationState: fallbackConversationState ?? slots.conversation_state
    })

    return {}
  }
}
