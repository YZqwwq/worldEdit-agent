<template>
  <div class="flex flex-col gap-6">
    <ChatMessageItem
      v-for="message in messages"
      :key="message.id"
      :message="message"
      :participant="participants?.[message.sender]"
      @edit-avatar="$emit('edit-avatar', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import ChatMessageItem from './ChatMessageItem.vue'
import type { ChatMessage, ChatSender } from '../../../../../share/cache/render/aiagent/chatMessage'
import type { ChatParticipantProfile } from '../types'

defineEmits<{
  (e: 'edit-avatar', sender: ChatSender): void
}>()

defineProps<{
  messages: ChatMessage[]
  participants?: Partial<Record<ChatSender, ChatParticipantProfile>>
}>()
</script>
