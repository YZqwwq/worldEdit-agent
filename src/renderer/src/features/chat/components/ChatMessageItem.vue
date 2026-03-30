<template>
  <article class="w-full" :class="rowClass">
    <div class="grid w-full gap-3" :class="layoutClass">
      <div class="flex pt-1" :class="avatarWrapClass">
        <ChatAvatar
          :accent="profile.accent"
          :avatar-text="profile.avatarText"
          :avatar-url="profile.avatarUrl"
          :avatar-alt="profile.avatarAlt || profile.nickname"
          :avatar-object-position="profile.avatarObjectPosition"
          :avatar-scale="profile.avatarScale"
          :avatar-offset-x="profile.avatarOffsetX"
          :avatar-offset-y="profile.avatarOffsetY"
          :interactive="true"
          @edit="$emit('edit-avatar', message.sender)"
        />
      </div>

      <div class="group relative min-w-0" :class="bodyClass">
        <header class="mb-1 flex flex-wrap items-center gap-1" :class="headerClass">
        <span
          class="inline-flex h-5 items-center rounded-sm px-2.5 text-[12px] font-bold leading-none tracking-[0.08em]"
          :class="labelClass"
        >
          {{ profile.label }}
        </span>
        <span class="text-[13px] font-semibold leading-6 text-slate-700">
          {{ profile.nickname }}
        </span>
        <span v-if="profile.statusIcon" class="text-base leading-none">
          {{ profile.statusIcon }}
        </span>
        <time v-if="formattedTime" class="text-[11px] text-slate-400">
          {{ formattedTime }}
        </time>
        </header>

        <div class="max-w-[min(100%,960px)] rounded-[18px] border px-4 py-2 shadow-sm" :class="cardClass">
          <MdPreview :modelValue="message.text" class="chat-md-preview" theme="light" />
        </div>

        <button
          v-if="showRevertAction"
          type="button"
          class="absolute -bottom-4 right-2 flex h-9 w-9 translate-y-1 items-center justify-center rounded-full border border-slate-200 bg-white text-sm text-slate-500 shadow-sm opacity-0 transition-all duration-150 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 group-hover:translate-y-0 group-hover:opacity-100"
          title="回退这一轮并把消息放回输入框"
          @click="$emit('revert-message', message)"
        >
          ↺
        </button>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { MdPreview } from 'md-editor-v3'
import type { ChatMessage, ChatSender } from '../../../../../share/cache/render/aiagent/chatMessage'
import ChatAvatar from './ChatAvatar.vue'
import type { ChatParticipantProfile } from '../types'

const props = defineProps<{
  message: ChatMessage
  participant?: ChatParticipantProfile
  canRevert?: boolean
}>()

defineEmits<{
  (e: 'edit-avatar', sender: ChatSender): void
  (e: 'revert-message', message: ChatMessage): void
}>()

const defaultProfiles: Record<
  ChatSender,
  Required<Pick<ChatParticipantProfile, 'label' | 'nickname' | 'avatarText' | 'accent'>> &
    Pick<
      ChatParticipantProfile,
      | 'statusIcon'
      | 'avatarUrl'
      | 'avatarAlt'
      | 'avatarObjectPosition'
      | 'avatarScale'
      | 'avatarOffsetX'
      | 'avatarOffsetY'
    >
> = {
  ai: {
    label: 'AI AGENT',
    nickname: '法弥拉',
    avatarText: 'AI',
    accent: 'ai',
    statusIcon: '🔥',
    avatarUrl: '',
    avatarAlt: '法弥拉头像',
    avatarObjectPosition: 'center',
    avatarScale: 1,
    avatarOffsetX: 0,
    avatarOffsetY: 0
  },
  user: {
    label: 'USER',
    nickname: '你',
    avatarText: '你',
    accent: 'user',
    statusIcon: '',
    avatarUrl: '',
    avatarAlt: '用户头像',
    avatarObjectPosition: 'center',
    avatarScale: 1,
    avatarOffsetX: 0,
    avatarOffsetY: 0
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

const showRevertAction = computed(() => Boolean(props.canRevert) && isUser.value)

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

const cardClass = computed(() =>
  profile.value.accent === 'user'
    ? 'border-sky-100 bg-gradient-to-br from-sky-50 via-blue-50 to-white text-slate-800 rounded-tr-sm'
    : 'border-slate-200 bg-white text-slate-800 rounded-tl-sm'
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

:deep(.chat-md-preview .md-editor-preview) {
  font-size: 14px !important;
  line-height: 1.65 !important;
}

:deep(.chat-md-preview .md-editor-preview p:first-child) {
  margin-top: 0;
}

:deep(.chat-md-preview .md-editor-preview p:last-child) {
  margin-bottom: 0;
}

:deep(.chat-md-preview .md-editor-preview p) {
  margin: 0 0 0.55em !important;
}

:deep(.chat-md-preview .md-editor-code .md-editor-code-head) {
  position: static !important;
  top: auto !important;
  z-index: auto !important;
}
</style>
