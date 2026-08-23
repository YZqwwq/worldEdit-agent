import type { InteractionObservationSnapshot } from '@share/cache/AItype/states/interactionObservation'
import type { MoodAssessment } from '@share/cache/AItype/states/moodAssessment'
import type { RecentDialogueMessage } from '../instantperceptionnode/instantPerceptionContext'
import { getObservationText } from './personaObservationUtils'

export interface MoodAppraisalPromptInput {
  moodPrompt: string
  observations: InteractionObservationSnapshot[]
  currentEventText: string
  eventSource: 'user' | 'subagent' | 'system'
  recentHistory: RecentDialogueMessage[]
  previousMood?: MoodAssessment | null | undefined
}

const buildInteractionDigest = (observations: InteractionObservationSnapshot[]): string => {
  const interactionEvents = observations
    .filter(
      (observation) =>
        observation.type === 'user_interrupt' || observation.type === 'user_revert'
    )
    .slice(-3)

  if (!interactionEvents.length) return '(none)'
  return interactionEvents
    .map((observation) => {
      const text = getObservationText(observation).replace(/\s+/g, ' ').slice(0, 160)
      return `- [${observation.type}] ${text || '(no text)'}`
    })
    .join('\n')
}

const buildPreviousStateDigest = (mood: MoodAssessment | null | undefined): string => {
  if (!mood) return '(none)'
  return JSON.stringify({
    primaryEmotion: mood.primaryEmotion,
    secondaryEmotion: mood.secondaryEmotion ?? null,
    shortTerm: mood.shortTerm,
    slowMood: mood.slowMood,
    relationship: mood.relationship
  })
}

export const buildMoodAppraisalPrompt = (input: MoodAppraisalPromptInput): string =>
  `你是 Agent 情感系统中的事件评价器。

你评价当前 Turn 输入对 Agent 的意义。输入可能来自用户、子 Agent 或系统，但它们都只是本轮事件，不是不同的认知流程。

评价规则：
${input.moodPrompt.trim() || '(empty)'}

当前事件来源：${input.eventSource}

当前事件（本轮唯一的新语言事件）：
${input.currentEventText.trim() || '(none)'}

近期对话背景（只用于理解指代和关系连续性，不作为新事件重复评价）：
${input.recentHistory.length ? JSON.stringify(input.recentHistory) : '(none)'}

用户交互事件：
${buildInteractionDigest(input.observations)}

上一状态仅用于理解连续关系，不表示旧事件再次发生：
${buildPreviousStateDigest(input.previousMood)}

字段定义：
- userState: 对用户当前短期状态的理解，不是 Agent 自身情绪
  - mood: calm | positive | impatient | frustrated | uncertain
  - valence: -1 到 1，表示用户状态的正负效价
  - confidence: 0 到 1，情绪主体或证据不明确时必须降低
- eventKind: gain | loss | obstacle | threat | novelty | norm_violation | relationship_event | neutral
- valence: -2明显负面，-1轻微负面，0中性，1轻微正面，2明显正面
- salience: 0无关，1较低，2重要，3高度重要
- novelty: 0预期内，1轻微意外，2明显意外，3强烈意外
- futureProspect: -2明显恶化到2明显改善
- agency: self | user | other | environment | mixed | unknown
- normImpact: -2明显违背价值与身份到2明显符合
- relationshipImpact: -2明显损害关系到2明显增进关系
- controlSignal: 只有用户明确表达完成、失控、无法继续或恢复掌握时才改变；否则必须为 unknown
- confidence: 0无证据，1较弱，2较清楚，3明确

边界：
1. 不把用户自己的情绪直接复制成 Agent 情绪。
2. 用户讨论负面题材、角色愤怒或故事冲突，不代表用户本人负面；此时 userState 通常为 calm。
3. userState 只描述用户当前状态；事件字段描述这次互动对 Agent 的意义，两者可以不同。
4. 不从“暂未看到方案”推断 Agent 没有能力。
5. 普通请求通常是 neutral；不要为了产生情绪而夸大评价。
6. 只输出一个 JSON 对象，不解释，不输出 Markdown。
7. 只有来源为 user 时才评价 userState 和用户关系影响。来源为 subagent 或 system 时，userState 必须为 {"mood":"calm","valence":0,"confidence":0}，relationshipImpact 必须为 0；这类事件仍可通过其他事件字段影响 Agent 自身评价。

输出：
{"userState":{"mood":"calm","valence":0,"confidence":0.5},"eventKind":"neutral","valence":0,"salience":1,"novelty":0,"futureProspect":0,"agency":"unknown","normImpact":0,"relationshipImpact":0,"controlSignal":"unknown","confidence":1}`
