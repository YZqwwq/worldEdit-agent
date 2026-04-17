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

export const getExpressionPromptProfilePath = (): string =>
  join(getAiServicePromptDir(), 'expression.md')

export const getMoodPromptProfilePath = (): string =>
  join(getAiServicePromptDir(), 'mood.md')

// 角色状态路径
export const getPersonaStatePath = (): string =>
  resolveDataFilePath(['role', 'personal_state.json'], [['role', 'persona_state.json']])

// 角色状态回退路径
export const getPersonaStateFallbackPath = (): string =>
  pickExisting([
    join(getStaticFamilaDailyRoot(), 'role', 'personal_state.json'),
    join(getStaticFamilaDailyRoot(), 'role', 'persona_state.json')
  ])

export const getPersonaConfigPath = (): string =>
  resolveDataFilePath(['persona-config.json'])

export const getPersonaConfigFallbackPath = (): string =>
  join(getStaticPromptResourceRoot(), 'persona-config.json')

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
