import { app } from 'electron'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import {
  getCharacterPromptProfilePath,
  getExpressionPromptProfilePath,
  getMoodPromptProfilePath
} from '../../../../../config/pathConfig'
import {
  DEFAULT_CHARACTER_PROMPT,
  BASE_MOOD_PROMPT
} from '../shared/promptConstants'
import {
  getDefaultExpressionPrompt,
  getExpressionPromptProfileById,
  toExpressionPromptProfileState
} from './expressionPromptProfiles'
import type {
  ExpressionPromptProfileId,
  ExpressionPromptProfileState
} from '@share/cache/AItype/states/expressionPromptProfile'
import { trimOr } from '../shared/promptTextUtils'

let promptStorageInitialized = false

const PROMPT_DEFAULTS = {
  character: {
    path: getCharacterPromptProfilePath,
    defaultContent: DEFAULT_CHARACTER_PROMPT
  },
  expression: {
    path: getExpressionPromptProfilePath,
    defaultContent: getDefaultExpressionPrompt()
  },
  mood: {
    path: getMoodPromptProfilePath,
    defaultContent: BASE_MOOD_PROMPT
  }
} as const

const writePromptFile = async (targetPath: string, content: string): Promise<void> => {
  await writeFile(targetPath, `${trimOr(content, content)}\n`, 'utf-8')
}

const initializePromptFile = async (targetPath: string, defaultContent: string): Promise<void> => {
  if (!app.isPackaged) {
    await writePromptFile(targetPath, defaultContent)
    return
  }

  if (!existsSync(targetPath)) {
    await writePromptFile(targetPath, defaultContent)
  }
}

const readPromptFile = async (targetPath: string, fallback: string): Promise<string> => {
  try {
    const text = await readFile(targetPath, 'utf-8')
    return trimOr(text, fallback)
  } catch {
    return fallback
  }
}

export const initializeAgentPromptStorage = async (): Promise<void> => {
  if (promptStorageInitialized) return

  for (const prompt of Object.values(PROMPT_DEFAULTS)) {
    await initializePromptFile(prompt.path(), prompt.defaultContent)
  }

  promptStorageInitialized = true
}

export const loadCharacterPrompt = async (): Promise<string> => {
  await initializeAgentPromptStorage()
  return readPromptFile(getCharacterPromptProfilePath(), DEFAULT_CHARACTER_PROMPT)
}

export const saveCharacterPrompt = async (content: string): Promise<void> => {
  await initializeAgentPromptStorage()
  await writePromptFile(getCharacterPromptProfilePath(), trimOr(content, DEFAULT_CHARACTER_PROMPT))
}

export const loadExpressionPrompt = async (): Promise<string> => {
  await initializeAgentPromptStorage()
  return readPromptFile(getExpressionPromptProfilePath(), getDefaultExpressionPrompt())
}

export const loadExpressionPromptProfile = async (
  id: ExpressionPromptProfileId
): Promise<ExpressionPromptProfileState> => {
  if (id === 'default') {
    const prompt = await loadExpressionPrompt()
    return toExpressionPromptProfileState(getExpressionPromptProfileById(id), prompt)
  }

  return toExpressionPromptProfileState(getExpressionPromptProfileById(id))
}

export const loadMoodPrompt = async (): Promise<string> => {
  await initializeAgentPromptStorage()
  return readPromptFile(getMoodPromptProfilePath(), BASE_MOOD_PROMPT)
}

export const getDefaultCharacterPrompt = (): string => DEFAULT_CHARACTER_PROMPT
