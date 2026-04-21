import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { getCharacterPromptProfilePath } from '../../../../config/pathConfig'
import { DEFAULT_CHARACTER_PROMPT } from './shared/promptConstants'
import { getDefaultExpressionPrompt } from './persona/expressionPromptProfiles'
import { trimOr } from './shared/promptTextUtils'

/**
 * 初始化agent提示词存储
 * 如果存储不存在，则创建默认提示词
 * 如果存储存在，则不创建
 */

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
  await writeFile(
    getCharacterPromptProfilePath(),
    `${trimOr(content, DEFAULT_CHARACTER_PROMPT)}\n`,
    'utf-8'
  )
}

export const loadExpressionPrompt = (): string => getDefaultExpressionPrompt()

export const getDefaultCharacterPrompt = (): string => DEFAULT_CHARACTER_PROMPT
