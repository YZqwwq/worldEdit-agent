import { app } from 'electron'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const ensureDir = (dir: string) => {
  mkdirSync(dir, { recursive: true })
}

const isDirEmpty = (dir: string): boolean => {
  if (!existsSync(dir)) return true
  return readdirSync(dir).length === 0
}

const unique = (items: string[]): string[] => [...new Set(items)]

const pickExisting = (candidates: string[]): string => {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return candidates[0]
}

const getStaticPromptResourceRoot = (): string => {
  const candidates = app.isPackaged
    ? [join(process.resourcesPath, 'prompt-resource')]
    : [
        join(process.cwd(), 'src', 'main', 'prompt-resource'),
        join(process.cwd(), 'prompt-resource')
      ]

  return pickExisting(unique(candidates))
}

const getDataPromptResourceRoot = (): string => {
  const dir = join(app.getPath('userData'), 'prompt-resource')
  ensureDir(dir)
  return dir
}

export const getStaticFamilaDailyRoot = (): string =>
  join(getStaticPromptResourceRoot(), 'famila-daily')

export const getDataFamilaDailyRoot = (): string => {
  const dir = join(getDataPromptResourceRoot(), 'famila-daily')
  ensureDir(dir)
  return dir
}

const getLegacyFamilaDailyRoots = (): string[] => {
  const currentRoot = resolve(getDataFamilaDailyRoot())
  const candidates = unique([
    join(process.cwd(), 'prompt-resource', 'famila-daily'),
    join(process.cwd(), 'src', 'main', 'prompt-resource', 'famila-daily'),
    join(dirname(app.getPath('exe')), 'prompt-resource', 'famila-daily')
  ]).map((dir) => resolve(dir))

  return candidates.filter((dir) => dir !== currentRoot)
}

const migrateLegacyFile = (targetPath: string, candidateRelatives: string[][]): void => {
  if (existsSync(targetPath)) return

  const legacyRoots = getLegacyFamilaDailyRoots()
  for (const legacyRoot of legacyRoots) {
    for (const relativeParts of candidateRelatives) {
      const sourcePath = join(legacyRoot, ...relativeParts)
      if (!existsSync(sourcePath)) continue
      ensureDir(dirname(targetPath))
      copyFileSync(sourcePath, targetPath)
      return
    }
  }
}

const resolveDataFilePath = (relativeParts: string[], legacyCandidates: string[][] = []): string => {
  const targetPath = join(getDataFamilaDailyRoot(), ...relativeParts)
  ensureDir(dirname(targetPath))
  migrateLegacyFile(targetPath, [relativeParts, ...legacyCandidates])
  return targetPath
}

const migrateLegacyDir = (targetDir: string, legacyCandidates: string[]): void => {
  ensureDir(targetDir)
  if (!isDirEmpty(targetDir)) return

  for (const candidate of legacyCandidates.map((dir) => resolve(dir))) {
    if (!existsSync(candidate) || candidate === resolve(targetDir)) continue
    cpSync(candidate, targetDir, {
      recursive: true,
      force: false,
      errorOnExist: false
    })
    return
  }
}

export const getAiServicePromptDir = (): string => {
  const dir = join(app.getPath('userData'), 'aiservice', 'prompt')
  ensureDir(dir)
  return dir
}

export const getCharacterPromptProfilePath = (): string =>
  join(getAiServicePromptDir(), 'character.md')

// 角色状态路径
export const getPersonaStatePath = (): string =>
  resolveDataFilePath(['role', 'personal_state.json'], [['role', 'persona_state.json']])

// 角色状态回退路径
export const getPersonaStateFallbackPath = (): string =>
  pickExisting([
    join(getStaticFamilaDailyRoot(), 'role', 'personal_state.json'),
    join(getStaticFamilaDailyRoot(), 'role', 'persona_state.json')
  ])

// 历史记录目录
export const getHistoryDir = (): string => {
  const dir = join(getDataFamilaDailyRoot(), 'historyprompt', 'recent-history')
  ensureDir(dir)
  return dir
}

// 历史记录状态路径
export const getHistoryStatePath = (): string =>
  resolveDataFilePath(['historyprompt', 'recent-history', 'state.json'], [['historyprompt', 'state.json']])
// 短期记录路径
export const getShortTermPath = (): string =>
  resolveDataFilePath(['historyprompt', 'recent-history', 'short_term.json'], [
    ['historyprompt', 'short_term.json']
  ])
// 历史记录原始路径
export const getHistoryRawPath = (): string =>
  resolveDataFilePath(['historyprompt', 'recent-history', 'history_raw.md'], [
    ['historyprompt', 'history_raw.md'],
    ['historyprompt', 'recent-history.md']
  ])
// 历史记录压缩路径
export const getHistoryCompressedPath = (): string =>
  resolveDataFilePath(['historyprompt', 'recent-history', 'history_compressed.md'], [
    ['historyprompt', 'history_compressed.md']
  ])
// 历史记录原始路径（旧版）
export const getLegacyHistoryMarkdownPath = (): string =>
  resolveDataFilePath(['historyprompt', 'recent-history.md'])

export const getRuntimeStaticRoot = (): string => {
  const dir = join(app.getPath('userData'), 'static')
  ensureDir(dir)
  return dir
}

export const getStaticUploadDir = (): string => {
  const dir = join(getRuntimeStaticRoot(), 'uploads')
  migrateLegacyDir(dir, [join(getDataFamilaDailyRoot(), 'static-uploads')])
  return dir
}

export const getStaticAvatarDir = (): string => {
  const dir = join(getRuntimeStaticRoot(), 'avatars')
  ensureDir(dir)
  return dir
}

export const getAvatarProfilesPath = (): string => {
  const path = join(getStaticAvatarDir(), 'profiles.json')
  ensureDir(dirname(path))
  return path
}
