<template>
  <div class="flex flex-col gap-6">
    <ChatMessageItem
      v-for="message in messages"
      :key="message.id"
      :message="message"
      :participant="participants?.[message.sender]"
      :can-revert="message.id === revertibleMessageId"
      :document-diff-locatable="documentDiffLocatable"
      @edit-avatar="$emit('edit-avatar', $event)"
      @revert-message="$emit('revert-message', $event)"
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

defineEmits<{
  (e: 'edit-avatar', sender: ChatSender): void
  (e: 'revert-message', message: ChatMessage): void
  (e: 'document-diff-locate', payload: {
    reference: ChatMessageDocumentDiffReference
    hunk: WorldDocumentDiffHunk
  }): void
}>()

defineProps<{
  messages: ChatMessage[]
  participants?: Partial<Record<ChatSender, ChatParticipantProfile>>
  revertibleMessageId?: number
  documentDiffLocatable?: boolean
}>()
</script>
