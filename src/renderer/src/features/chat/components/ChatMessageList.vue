<template>
  <div class="flex flex-col gap-6">
    <ChatMessageItem
      v-for="message in messages"
      :key="message.id"
      :message="message"
      :participant="participants?.[message.sender]"
      :can-revert="message.id === revertibleMessageId"
      @edit-avatar="$emit('edit-avatar', $event)"
      @revert-message="$emit('revert-message', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import ChatMessageItem from './ChatMessageItem.vue'
import type { ChatMessage, ChatSender } from '../../../../../share/cache/render/aiagent/chatMessage'
import type { ChatParticipantProfile } from '../types'

defineEmits<{
  (e: 'edit-avatar', sender: ChatSender): void
  (e: 'revert-message', message: ChatMessage): void
}>()

defineProps<{
  messages: ChatMessage[]
  participants?: Partial<Record<ChatSender, ChatParticipantProfile>>
  revertibleMessageId?: number
}>()
</script>
