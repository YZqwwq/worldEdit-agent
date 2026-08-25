import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import {
  getAuthoredNarrativeTemplatePath,
  getExpressionPromptProfilePath,
  getMoodPromptProfilePath
} from '../../../../../config/pathConfig'
import {
  DEFAULT_CHARACTER_PROMPT,
  BASE_MOOD_PROMPT,
  isLegacyDefaultCharacterPrompt,
  isLegacyDefaultMoodPrompt
} from '../shared/promptConstants'
import {
  getDefaultExpressionPrompt,
  getExpressionPromptProfileById,
  isLegacyDefaultExpressionPrompt,
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
    path: getAuthoredNarrativeTemplatePath,
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

const migrateLegacyDefaultExpressionPrompt = async (): Promise<void> => {
  const targetPath = getExpressionPromptProfilePath()
  const current = await readPromptFile(targetPath, getDefaultExpressionPrompt())
  if (isLegacyDefaultExpressionPrompt(current)) {
    await writePromptFile(targetPath, getDefaultExpressionPrompt())
  }
}

const migrateLegacyAuthoredNarrativeTemplate = async (): Promise<void> => {
  const targetPath = getAuthoredNarrativeTemplatePath()
  const current = await readPromptFile(targetPath, DEFAULT_CHARACTER_PROMPT)
  if (isLegacyDefaultCharacterPrompt(current)) {
    await writePromptFile(targetPath, DEFAULT_CHARACTER_PROMPT)
  }
}

const migrateLegacyDefaultMoodPrompt = async (): Promise<void> => {
  const targetPath = getMoodPromptProfilePath()
  const current = await readPromptFile(targetPath, BASE_MOOD_PROMPT)
  if (isLegacyDefaultMoodPrompt(current)) {
    await writePromptFile(targetPath, BASE_MOOD_PROMPT)
  }
}

export const initializeAgentPromptStorage = async (): Promise<void> => {
  if (promptStorageInitialized) return

  for (const prompt of Object.values(PROMPT_DEFAULTS)) {
    await initializePromptFile(prompt.path(), prompt.defaultContent)
  }

  await migrateLegacyAuthoredNarrativeTemplate()
  await migrateLegacyDefaultExpressionPrompt()
  await migrateLegacyDefaultMoodPrompt()
  promptStorageInitialized = true
}

/** 仅作为 Self Core 首次建立时的作者叙事来源，不代表当前运行身份。 */
export const loadAuthoredNarrativeTemplate = async (): Promise<string> => {
  await initializeAgentPromptStorage()
  return readPromptFile(getAuthoredNarrativeTemplatePath(), DEFAULT_CHARACTER_PROMPT)
}

/** 只修改未来 Self Core 的初始化模板；当前身份必须通过 Self Core 修订。 */
export const saveAuthoredNarrativeTemplate = async (content: string): Promise<void> => {
  await initializeAgentPromptStorage()
  await writePromptFile(getAuthoredNarrativeTemplatePath(), trimOr(content, DEFAULT_CHARACTER_PROMPT))
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

export const getDefaultAuthoredNarrativeTemplate = (): string => DEFAULT_CHARACTER_PROMPT
