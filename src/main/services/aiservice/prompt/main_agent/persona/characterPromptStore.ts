import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { getCharacterPromptProfilePath } from '../../../../../config/pathConfig'
import { DEFAULT_CHARACTER_PROMPT, DEFAULT_EXPRESSION_PROMPT } from '../shared/promptConstants'
import { trimOr } from '../shared/promptTextUtils'

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
  const targetPath = getCharacterPromptProfilePath()
  await writeFile(targetPath, `${trimOr(content, DEFAULT_CHARACTER_PROMPT)}\n`, 'utf-8')
}

export const loadExpressionPrompt = (): string => DEFAULT_EXPRESSION_PROMPT

export const getDefaultCharacterPrompt = (): string => DEFAULT_CHARACTER_PROMPT
