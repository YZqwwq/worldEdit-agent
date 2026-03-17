export type UploadedChatFile = {
  id: string
  name: string
  resourceUrl?: string
  sourcePath: string
  size: number
  status: 'pending' | 'uploaded'
}

export type ChatAccentTone = 'ai' | 'user'

export type ChatParticipantProfile = {
  label?: string
  nickname?: string
  avatarText?: string
  avatarUrl?: string
  avatarAlt?: string
  avatarObjectPosition?: string
  avatarScale?: number
  avatarOffsetX?: number
  avatarOffsetY?: number
  accent?: ChatAccentTone
  statusIcon?: string
}
