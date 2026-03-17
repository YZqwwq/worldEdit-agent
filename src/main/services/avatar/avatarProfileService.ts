import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { getAvatarProfilesPath, getStaticAvatarDir } from '../../config/pathConfig'
import type {
  ChatAvatarProfilesPayload,
  ChatParticipantKey,
  PersistedChatAvatarProfile,
  SaveChatAvatarInput
} from '../../../share/cache/render/aiagent/chatAvatarProfile'

type AvatarProfileRecord = {
  filePath?: string
  avatarScale?: number
  avatarOffsetX?: number
  avatarOffsetY?: number
}

type AvatarProfileRecordMap = Partial<Record<ChatParticipantKey, AvatarProfileRecord>>

const ensureDir = (dir: string): void => {
  mkdirSync(dir, { recursive: true })
}

const readJsonFile = <T>(path: string, fallback: T): T => {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T
  } catch {
    return fallback
  }
}

const writeJsonFile = (path: string, data: unknown): void => {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}

const clampScale = (value: number | undefined): number => {
  const normalized = Number.isFinite(value) ? Number(value) : 1
  return Math.min(3, Math.max(1, normalized))
}

const clampOffset = (value: number | undefined): number => {
  const normalized = Number.isFinite(value) ? Number(value) : 0
  return Math.min(0.8, Math.max(-0.8, normalized))
}

const inferExtensionFromDataUrl = (dataUrl: string): string => {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/)
  const mime = match?.[1]?.toLowerCase()
  if (mime === 'image/jpeg') return '.jpg'
  if (mime === 'image/png') return '.png'
  if (mime === 'image/webp') return '.webp'
  if (mime === 'image/gif') return '.gif'
  return '.png'
}

const decodeDataUrl = (dataUrl: string): Buffer => {
  const base64 = dataUrl.split(',')[1] || ''
  return Buffer.from(base64, 'base64')
}

const inferMimeFromPath = (filePath: string): string => {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'image/png'
}

const filePathToDataUrl = (filePath: string): string => {
  const buffer = readFileSync(filePath)
  const mime = inferMimeFromPath(filePath)
  return `data:${mime};base64,${buffer.toString('base64')}`
}

const resolveAvatarPathFromUrl = (avatarUrl: string): string | undefined => {
  if (!avatarUrl) return undefined
  try {
    if (avatarUrl.startsWith('file:')) {
      return fileURLToPath(avatarUrl)
    }
  } catch {
    return undefined
  }
  return undefined
}

const isInsideAvatarDir = (path: string | undefined): boolean => {
  if (!path) return false
  const avatarDir = resolve(getStaticAvatarDir())
  const targetPath = resolve(path)
  return targetPath.startsWith(`${avatarDir}\\`) || targetPath === avatarDir || targetPath.startsWith(`${avatarDir}/`)
}

const toPayload = (record: AvatarProfileRecord | undefined): PersistedChatAvatarProfile => ({
  avatarUrl: record?.filePath && existsSync(record.filePath) ? filePathToDataUrl(record.filePath) : '',
  avatarScale: clampScale(record?.avatarScale),
  avatarOffsetX: clampOffset(record?.avatarOffsetX),
  avatarOffsetY: clampOffset(record?.avatarOffsetY)
})

class AvatarProfileService {
  private get profilesPath(): string {
    return getAvatarProfilesPath()
  }

  private readProfiles(): AvatarProfileRecordMap {
    return readJsonFile<AvatarProfileRecordMap>(this.profilesPath, {})
  }

  private writeProfiles(data: AvatarProfileRecordMap): void {
    writeJsonFile(this.profilesPath, data)
  }

  private removeAvatarFile(filePath?: string): void {
    if (!filePath || !existsSync(filePath) || !isInsideAvatarDir(filePath)) return
    unlinkSync(filePath)
  }

  private saveAvatarDataUrl(participantKey: ChatParticipantKey, dataUrl: string): string {
    const avatarDir = getStaticAvatarDir()
    ensureDir(avatarDir)
    const extension = inferExtensionFromDataUrl(dataUrl)
    const fileName = `${participantKey}-${randomUUID()}${extension}`
    const targetPath = join(avatarDir, fileName)
    writeFileSync(targetPath, decodeDataUrl(dataUrl))
    return targetPath
  }

  getProfiles(): ChatAvatarProfilesPayload {
    const profiles = this.readProfiles()
    return {
      ai: toPayload(profiles.ai),
      user: toPayload(profiles.user)
    }
  }

  saveProfile(input: SaveChatAvatarInput): PersistedChatAvatarProfile {
    const profiles = this.readProfiles()
    const current = profiles[input.participantKey]
    let filePath = current?.filePath

    if (!input.avatarUrl) {
      this.removeAvatarFile(current?.filePath)
      filePath = undefined
    } else if (input.avatarUrl.startsWith('data:image/')) {
      const nextPath = this.saveAvatarDataUrl(input.participantKey, input.avatarUrl)
      if (current?.filePath && current.filePath !== nextPath) {
        this.removeAvatarFile(current.filePath)
      }
      filePath = nextPath
    } else {
      const resolved = resolveAvatarPathFromUrl(input.avatarUrl)
      filePath = isInsideAvatarDir(resolved) ? resolved : current?.filePath
    }

    profiles[input.participantKey] = {
      filePath,
      avatarScale: clampScale(input.avatarScale),
      avatarOffsetX: clampOffset(input.avatarOffsetX),
      avatarOffsetY: clampOffset(input.avatarOffsetY)
    }

    if (!filePath) {
      profiles[input.participantKey] = {
        avatarScale: clampScale(input.avatarScale),
        avatarOffsetX: clampOffset(input.avatarOffsetX),
        avatarOffsetY: clampOffset(input.avatarOffsetY)
      }
    }

    this.writeProfiles(profiles)
    return toPayload(profiles[input.participantKey])
  }

  clearAll(): void {
    const avatarDir = getStaticAvatarDir()
    if (existsSync(avatarDir)) {
      rmSync(avatarDir, { recursive: true, force: true })
    }
    ensureDir(avatarDir)
    this.writeProfiles({})
  }
}

export const avatarProfileService = new AvatarProfileService()
