import type { InteractionObservationSnapshot } from '@share/cache/AItype/states/interactionObservation'
import type { MoodAssessment } from '@share/cache/AItype/states/moodAssessment'
import type { RecentDialogueMessage } from '../instantperceptionnode/instantPerceptionContext'
import { getObservationText } from './personaObservationUtils'

export interface MoodAppraisalPromptInput {
  moodPrompt: string
  observations: InteractionObservationSnapshot[]
  currentUserText: string
  recentDialogue: RecentDialogueMessage[]
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

你只评价当前用户消息以及用户产生的交互事件。工具调用、任务执行状态和系统能力不属于你的判断范围。

评价规则：
${input.moodPrompt.trim() || '(empty)'}

当前用户消息（本轮唯一的新语言事件）：
${input.currentUserText.trim() || '(none)'}

近期对话背景（只用于理解指代和关系连续性，不作为新事件重复评价）：
${input.recentDialogue.length ? JSON.stringify(input.recentDialogue) : '(none)'}

用户交互事件：
${buildInteractionDigest(input.observations)}

上一状态仅用于理解连续关系，不表示旧事件再次发生：
${buildPreviousStateDigest(input.previousMood)}

字段定义：
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
2. 不从“暂未看到方案”推断 Agent 没有能力。
3. 普通请求通常是 neutral；不要为了产生情绪而夸大评价。
4. 只输出一个 JSON 对象，不解释，不输出 Markdown。

输出：
{"eventKind":"neutral","valence":0,"salience":1,"novelty":0,"futureProspect":0,"agency":"unknown","normImpact":0,"relationshipImpact":0,"controlSignal":"unknown","confidence":1}`
