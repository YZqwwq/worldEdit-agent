export type ChatParticipantKey = 'ai' | 'user'

export type PersistedChatAvatarProfile = {
  avatarUrl?: string
  avatarScale?: number
  avatarOffsetX?: number
  avatarOffsetY?: number
}

export type ChatAvatarProfilesPayload = Partial<Record<ChatParticipantKey, PersistedChatAvatarProfile>>

export type SaveChatAvatarInput = {
  participantKey: ChatParticipantKey
  avatarUrl?: string
  avatarScale?: number
  avatarOffsetX?: number
  avatarOffsetY?: number
}
