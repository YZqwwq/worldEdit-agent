<template>
  <div class="flex flex-col gap-6">
    <ChatMessageItem
      v-for="message in messages"
      :key="message.id"
      :message="message"
      :participant="message.sender === 'system' ? undefined : participants?.[message.sender]"
      :can-revert="message.id === revertibleMessageId"
      :turn-activity="turnActivity?.messageId === message.id ? turnActivity : undefined"
      :document-diff-locatable="documentDiffLocatable"
      @edit-avatar="$emit('edit-avatar', $event)"
      @revert-message="$emit('revert-message', $event)"
      @toggle-turn-activity="$emit('toggle-turn-activity')"
      @document-diff-locate="$emit('document-diff-locate', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import ChatMessageItem from './ChatMessageItem.vue'
import type {
  ChatMessage,
  ChatMessageDocumentDiffReference,
  ChatSender
} from '../../../../../share/cache/render/aiagent/chatMessage'
import type { WorldDocumentDiffHunk } from '@share/cache/worldbuilding/worldDocumentHistory'
import type { ChatParticipantProfile } from '../types'
import type { AgentTurnActivity } from '../turnActivity'

defineEmits<{
  (e: 'edit-avatar', sender: Exclude<ChatSender, 'system'>): void
  (e: 'revert-message', message: ChatMessage): void
  (e: 'toggle-turn-activity'): void
  (e: 'document-diff-locate', payload: {
    reference: ChatMessageDocumentDiffReference
    hunk: WorldDocumentDiffHunk
  }): void
}>()

defineProps<{
  messages: ChatMessage[]
  participants?: Partial<Record<Exclude<ChatSender, 'system'>, ChatParticipantProfile>>
  revertibleMessageId?: number
  turnActivity?: AgentTurnActivity | null
  documentDiffLocatable?: boolean
}>()
</script>
