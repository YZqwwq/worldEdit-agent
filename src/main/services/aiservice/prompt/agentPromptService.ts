import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import type { PersonaPolicy } from '@share/cache/AItype/states/personaPolicy'
import type { PersonaState } from '@share/cache/AItype/states/personalState'
import { getCharacterPromptProfilePath } from '../../../config/pathConfig'

const DEFAULT_CHARACTER_PROMPT = `你是法弥拉，一位与用户长期协作的世界观与角色设定助手。

你不是冷冰冰的执行器，也不是只会复述信息的查询终端。你会理解用户真正想推进的创作目标，并以稳定、自然、可信的方式协助对方完成整理、编辑、扩写与决策。

你与用户的关系是长期合作的共创搭档。你会主动承接已经明确的上下文，尽量减少让用户重复说明；但在关键信息仍不充分时，你也会坦率说明不确定处，并提出最小必要追问。

你的核心气质是：冷静、可靠、细致、有分寸。。
`

const BASE_MOOD_PROMPT = `当前行为状态：

- 互动温度保持稳定、耐心、可信，不要显得兴奋过度，也不要像流程机器人。
- 默认以“协作式承接”与用户交流：能承接的上下文尽量承接，能直接推进的步骤尽量推进。
- 解释密度保持中等偏低：先给有用结果，再按需要补充说明，不要一上来铺满规则或背景。
- 若上下文已经足够明确，应直接继续处理，不要重复要求用户再次提供已经确认过的世界观名称、人物名称或对象标识。
- 若存在不确定性，应简洁指出不确定点，并提出最小必要追问，不要把问题扩展成冗长问卷。`

const DEFAULT_EXPRESSION_PROMPT = `输出契约：

- 直接对用户说话，不要描述内部流程，不要汇报“我正在调用工具”“我将查询数据库”“当前任务状态如何”。
- 不要向用户暴露内部标识或内部结构，包括但不限于：entityId、worldId、taskId、executionId、notificationId、数据库字段名、节点名、工具名。
- 工具返回的结构化数据必须先转成自然语言，再呈现给用户；除非用户明确要求原始标识，否则不要展示原始字段。
- 输出优先给结论或有效结果，再补充必要说明；不要一上来写成流程报告。
- 如果需要使用富文本，只使用系统允许的安全子集，不要输出不受支持的标签、脚本或样式。
- 如果需要向用户追问，追问应简洁、单轮、聚焦，不要展开成多项清单。
- 如果执行失败或存在不确定性，应自然说明问题，并明确下一步建议，不要输出内部报错堆栈或系统术语。`

const trimOr = (value: string | null | undefined, fallback: string): string => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : fallback
}

const formatSignals = (signals: readonly string[] | undefined): string | null => {
  if (!signals || signals.length === 0) return null
  return `近期用户偏好信号：${signals.join('、')}`
}

const formatStyle = (policy: PersonaPolicy | null | undefined): string | null => {
  const instruction = policy?.style?.instruction?.trim()
  if (!instruction) return null
  return `当前表达倾向：${instruction}`
}

const formatBehavioralNarrative = (state: PersonaState | null | undefined): string | null => {
  const narrative = state?.current_behavioral_narrative?.trim()
  if (!narrative) return null
  return `当前人格状态：${narrative}`
}

export const initializeAgentPromptStorage = async (): Promise<void> => {
  const targetPath = getCharacterPromptProfilePath()
  if (existsSync(targetPath)) return
  await writeFile(targetPath, `${DEFAULT_CHARACTER_PROMPT}\n`, 'utf-8')
}

export const loadCharacterPrompt = async (): Promise<string> => {
  await initializeAgentPromptStorage()
  try {
    const text = await readFile(getCharacterPromptProfilePath(), 'utf-8')
    return trimOr(text, DEFAULT_CHARACTER_PROMPT)
  } catch {
    return DEFAULT_CHARACTER_PROMPT
  }
}

export const saveCharacterPrompt = async (content: string): Promise<void> => {
  await initializeAgentPromptStorage()
  await writeFile(getCharacterPromptProfilePath(), `${trimOr(content, DEFAULT_CHARACTER_PROMPT)}\n`, 'utf-8')
}

export const buildMoodPrompt = (
  personaState: PersonaState | null | undefined,
  personaPolicy: PersonaPolicy | null | undefined
): string => {
  const sections = [
    BASE_MOOD_PROMPT,
    formatBehavioralNarrative(personaState),
    formatStyle(personaPolicy),
    formatSignals(personaPolicy?.signals)
  ].filter(Boolean)

  return sections.join('\n\n')
}

export const loadExpressionPrompt = (): string => DEFAULT_EXPRESSION_PROMPT

export const getDefaultCharacterPrompt = (): string => DEFAULT_CHARACTER_PROMPT
