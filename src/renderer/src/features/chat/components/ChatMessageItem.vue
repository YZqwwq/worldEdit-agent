<template>
  <article class="w-full" :class="rowClass">
    <div class="grid w-full gap-4" :class="layoutClass">
      <div class="flex pt-1" :class="avatarWrapClass">
      <div
        class="flex h-12 w-12 items-center justify-center rounded-2xl border text-sm font-semibold shadow-sm"
        :class="avatarClass"
      >
        {{ profile.avatarText }}
      </div>
      </div>

      <div class="min-w-0 space-y-2" :class="bodyClass">
        <header class="flex flex-wrap items-center gap-3" :class="headerClass">
        <span
          class="inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-[0.18em]"
          :class="labelClass"
        >
          {{ profile.label }}
        </span>
        <span class="text-lg font-semibold text-slate-700">
          {{ profile.nickname }}
        </span>
        <span v-if="profile.statusIcon" class="text-xl leading-none">
          {{ profile.statusIcon }}
        </span>
        <time v-if="formattedTime" class="text-xs text-slate-400">
          {{ formattedTime }}
        </time>
        </header>

        <div class="max-w-[min(100%,960px)] rounded-[26px] border px-5 py-4 shadow-sm" :class="cardClass">
          <MdPreview :modelValue="message.text" class="chat-md-preview" theme="light" />
        </div>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MdPreview } from 'md-editor-v3'
import type { ChatMessage, ChatSender } from '../../../../../share/cache/render/aiagent/chatMessage'

type AccentTone = 'ai' | 'user'

type ParticipantProfile = {
  label?: string
  nickname?: string
  avatarText?: string
  accent?: AccentTone
  statusIcon?: string
}

const props = defineProps<{
  message: ChatMessage
  participant?: ParticipantProfile
}>()

const defaultProfiles: Record<
  ChatSender,
  Required<Pick<ParticipantProfile, 'label' | 'nickname' | 'avatarText' | 'accent'>> &
    Pick<ParticipantProfile, 'statusIcon'>
> = {
  ai: {
    label: 'AI AGENT',
    nickname: '法弥拉',
    avatarText: 'AI',
    accent: 'ai',
    statusIcon: '🔥'
  },
  user: {
    label: 'USER',
    nickname: '你',
    avatarText: '你',
    accent: 'user',
    statusIcon: ''
  }
}

const profile = computed(() => {
  const base = defaultProfiles[props.message.sender]
  return {
    ...base,
    ...(props.participant ?? {})
  }
})

const isUser = computed(() => props.message.sender === 'user')

const formattedTime = computed(() => {
  if (!props.message.timestamp) return ''
  const date = new Date(props.message.timestamp)
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes}`
})

const rowClass = computed(() => (isUser.value ? 'flex justify-end' : 'flex justify-start'))

const layoutClass = computed(() =>
  isUser.value ? 'grid-cols-[minmax(0,1fr)_56px]' : 'grid-cols-[56px_minmax(0,1fr)]'
)

const avatarWrapClass = computed(() => (isUser.value ? 'justify-center order-2' : 'justify-center order-1'))

const bodyClass = computed(() => (isUser.value ? 'order-1 flex flex-col items-end' : 'order-2 flex flex-col items-start'))

const headerClass = computed(() => (isUser.value ? 'justify-end text-right' : 'justify-start'))

const labelClass = computed(() =>
  profile.value.accent === 'user'
    ? 'bg-sky-100 text-sky-800'
    : 'bg-slate-200 text-slate-700'
)

const avatarClass = computed(() =>
  profile.value.accent === 'user'
    ? 'border-sky-200 bg-sky-50 text-sky-700'
    : 'border-slate-200 bg-slate-100 text-slate-700'
)

const cardClass = computed(() =>
  profile.value.accent === 'user'
    ? 'border-sky-100 bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-800 rounded-tr-md'
    : 'border-slate-200 bg-white text-slate-800 rounded-tl-md'
)
</script>

<style scoped>
:deep(.chat-md-preview),
:deep(.chat-md-preview .md-editor-preview) {
  background: transparent !important;
  padding: 0 !important;
}

:deep(.chat-md-preview .md-editor-preview-wrapper) {
  padding: 0 !important;
}

:deep(.chat-md-preview .md-editor-preview p:first-child) {
  margin-top: 0;
}

:deep(.chat-md-preview .md-editor-preview p:last-child) {
  margin-bottom: 0;
}

:deep(.chat-md-preview .md-editor-code .md-editor-code-head) {
  position: static !important;
  top: auto !important;
  z-index: auto !important;
}
</style>
