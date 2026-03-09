import { app } from 'electron'
import { join, dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

const ensureDir = (dir: string) => {
  mkdirSync(dir, { recursive: true })
}


export const getStaticFamilaDailyRoot = (): string => {
  if (app.isPackaged) return join(process.resourcesPath, 'prompt-resource', 'famila-daily')
  return join(process.cwd(), 'prompt-resource', 'famila-daily')
}


export const getDataFamilaDailyRoot = (): string => {
  const baseDir = app.isPackaged ? dirname(app.getPath('exe')) : process.cwd()
  const dir = join(baseDir, 'prompt-resource', 'famila-daily')
  ensureDir(dir)
  return dir
}

// 角色提示路径
export const getRolePromptPath = (): string =>
  join(
    app.isPackaged ? process.resourcesPath : process.cwd(),
    'prompt-resource',
    'role-prompt',
    'roleprompt.md'
  )

// 角色状态路径
export const getPersonaStatePath = (): string => {
  const dir = join(getDataFamilaDailyRoot(), 'role')
  ensureDir(dir)
  return join(dir, 'personal_state.json')
}

// 角色状态回退路径
export const getPersonaStateFallbackPath = (): string =>
  join(getStaticFamilaDailyRoot(), 'role', 'personal_state.json')

// 历史记录目录
export const getHistoryDir = (): string => {
  const dir = join(getDataFamilaDailyRoot(), 'historyprompt', 'recent-history')
  ensureDir(dir)
  return dir
}

// 历史记录状态路径
export const getHistoryStatePath = (): string => join(getHistoryDir(), 'state.json')
// 短期记录路径
export const getShortTermPath = (): string => join(getHistoryDir(), 'short_term.json')
// 历史记录原始路径
export const getHistoryRawPath = (): string => join(getHistoryDir(), 'history_raw.md')
// 历史记录压缩路径
export const getHistoryCompressedPath = (): string => join(getHistoryDir(), 'history_compressed.md')
// 历史记录原始路径（旧版）
export const getLegacyHistoryMarkdownPath = (): string => {
  const dir = join(getDataFamilaDailyRoot(), 'historyprompt')
  ensureDir(dir)
  return join(dir, 'recent-history.md')
}

export const getStaticUploadDir = (): string => {
  const dir = join(getDataFamilaDailyRoot(), 'static-uploads')
  ensureDir(dir)
  return dir
}
