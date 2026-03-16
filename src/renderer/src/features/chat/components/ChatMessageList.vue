<template>
  <div class="flex flex-col gap-6">
    <ChatMessageItem
      v-for="message in messages"
      :key="message.id"
      :message="message"
      :participant="participants?.[message.sender]"
    />
  </div>
</template>

<script setup lang="ts">
import ChatMessageItem from './ChatMessageItem.vue'
import type { ChatMessage, ChatSender } from '../../../../../share/cache/render/aiagent/chatMessage'

type ParticipantProfile = {
  label?: string
  nickname?: string
  avatarText?: string
  accent?: 'ai' | 'user'
  statusIcon?: string
}

defineProps<{
  messages: ChatMessage[]
  participants?: Partial<Record<ChatSender, ParticipantProfile>>
}>()
</script>
