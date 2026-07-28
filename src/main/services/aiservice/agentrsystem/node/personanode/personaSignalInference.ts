import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import { z } from 'zod'
import type { PersonaMetrics } from '@share/cache/AItype/states/personalState'
import { contentToText } from '../../../messageoutput/transformRespones'
import { getQuickModel } from '../../modelwithtool/quick-base-model'
import { roundTo } from '../../manager/personal/personalManager'
import { extractJsonObject } from './personaJsonUtils'
import type { PersonaSignal, SignalCategory } from './personaTypes'
import type { RecentDialogueMessage } from '../instantperceptionnode/instantPerceptionContext'

const PERSONA_SIGNAL_CATEGORIES = ['自主性', '详略度', '探索性', '正式度'] as const

const personaSignalResponseSchema = z.object({
  signals: z
    .array(
      z.object({
        category: z.enum(PERSONA_SIGNAL_CATEGORIES),
        user_signal: z.string().trim().min(1).max(120),
        delta: z.number().finite().min(-0.12).max(0.12)
      })
    )
    .max(4)
    .default([])
})

const formatImpact = (delta: number, category: SignalCategory): string =>
  `${delta >= 0 ? '+' : ''}${roundTo(delta, 3)} ${category}`

const normalizeModelSignals = (
  input: z.infer<typeof personaSignalResponseSchema>
): PersonaSignal[] => {
  const selected = new Map<SignalCategory, PersonaSignal>()

  for (const signal of input.signals) {
    if (selected.has(signal.category)) {
      continue
    }

    const delta = roundTo(signal.delta, 3)
    if (delta === 0) {
      continue
    }

    selected.set(signal.category, {
      category: signal.category,
      user_signal: signal.user_signal.trim(),
      impact: formatImpact(delta, signal.category),
      delta
    })
  }

  return [...selected.values()]
}

// 识别用户对“助手行为风格”的元偏好，只产出人格参数信号，不处理任务内容本身。
const buildPersonaInferencePrompt = (
  userInput: string,
  metrics: PersonaMetrics,
  recentDialogue: RecentDialogueMessage[]
): string => `你是一个人格参数调节器。

任务：根据“用户最新一句话”里体现出的元偏好，只判断是否需要调整以下四个人格参数：
- 自主性：是否希望助手更主动还是更先确认
- 详略度：是否希望助手更详细还是更精简
- 探索性：是否希望助手更大胆探索还是更保守稳妥
- 正式度：是否希望助手更正式还是更自然随意

当前人格参数：
${JSON.stringify(metrics, null, 2)}

用户最新输入：
${userInput}

最近对话背景：
${recentDialogue.length > 0 ? JSON.stringify(recentDialogue, null, 2) : '(none)'}

请只输出 JSON，不要输出解释，不要使用 Markdown 代码块。格式如下：
{
  "signals": [
    {
      "category": "详略度",
      "user_signal": "user_requests_more_detail",
      "delta": 0.08
    }
  ]
}

规则：
1. 只判断“用户最新输入”表达的新偏好；最近对话只用于理解指代、承接和这句话针对的助手行为。
2. 不要从最近对话中的旧消息重复提取偏好，也不要因为任务主题本身就误判。
3. 没有明显偏好时返回 {"signals":[]}
4. 每个分类最多返回一条。
5. delta 必须在 -0.12 到 0.12 之间。
6. user_signal 使用简短 snake_case 标签。`

const inferSignalsWithModel = async (
  userInput: string,
  metrics: PersonaMetrics,
  recentDialogue: RecentDialogueMessage[]
): Promise<{
  signals: PersonaSignal[]
  parsedResponse: z.infer<typeof personaSignalResponseSchema>
}> => {
  const quickModel = await getQuickModel()
  const response = await quickModel.invoke(
    [
      new SystemMessage('你只负责返回合法 JSON。'),
      new HumanMessage(buildPersonaInferencePrompt(userInput, metrics, recentDialogue))
    ],
    { signal: AbortSignal.timeout(8000) } as Record<string, unknown>
  )
  const text = contentToText(response.content).trim()
  const jsonText = extractJsonObject(text)
  if (!jsonText) {
    throw new Error('Persona model did not return valid JSON content')
  }

  const parsed = personaSignalResponseSchema.parse(JSON.parse(jsonText))
  return {
    signals: normalizeModelSignals(parsed),
    parsedResponse: parsed
  }
}

export const inferSignals = async (
  userInput: string,
  metrics: PersonaMetrics,
  recentDialogue: RecentDialogueMessage[] = []
): Promise<PersonaSignal[]> => {
  try {
    const result = await inferSignalsWithModel(userInput, metrics, recentDialogue)
    return result.signals
  } catch {
    return []
  }
}
