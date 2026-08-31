import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getAiServicePromptDir } from '../../../config/pathConfig'

type PromptOverrideMap = Record<string, string>
const getPath = (): string => join(getAiServicePromptDir(), 'prompt-overrides.json')

export const getPromptOverrides = async (): Promise<PromptOverrideMap> => {
  try {
    if (!existsSync(getPath())) return {}
    const parsed = JSON.parse(await readFile(getPath(), 'utf8')) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  } catch {
    return {}
  }
}

export const savePromptOverrides = async (input: PromptOverrideMap): Promise<void> => {
  const next: PromptOverrideMap = {}
  for (const [id, content] of Object.entries(input)) {
    if (typeof content === 'string' && content.trim()) next[id] = content
  }
  await mkdir(getAiServicePromptDir(), { recursive: true })
  await writeFile(getPath(), JSON.stringify(next, null, 2), 'utf8')
}

export const resolvePromptOverride = async (id: string, fallback: string): Promise<string> => {
  const overrides = await getPromptOverrides()
  return typeof overrides[id] === 'string' && overrides[id].trim() ? overrides[id] : fallback
}

export const renderPromptTemplate = (template: string, values: Record<string, string>): string =>
  template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key: string) => values[key] ?? '')
