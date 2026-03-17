<template>
  <button
    type="button"
    class="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border shadow-sm transition-transform"
    :class="[frameClass, interactive ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-default']"
    :disabled="!interactive"
    @click="$emit('edit')"
  >
    <div class="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full" :class="innerClass">
      <img
        v-if="avatarUrl"
        :src="avatarUrl"
        :alt="avatarAlt"
        class="absolute h-full w-full object-cover pointer-events-none"
        :style="imageStyle"
      />
      <span v-else class="text-sm font-semibold" :class="textClass">
        {{ avatarText }}
      </span>
    </div>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ChatAccentTone } from '../types'

const props = withDefaults(
  defineProps<{
    accent?: ChatAccentTone
    avatarText?: string
    avatarUrl?: string
    avatarAlt?: string
    avatarObjectPosition?: string
    avatarScale?: number
    avatarOffsetX?: number
    avatarOffsetY?: number
    interactive?: boolean
  }>(),
  {
    accent: 'ai',
    avatarText: 'AI',
    avatarAlt: 'avatar',
    avatarObjectPosition: 'center',
    avatarScale: 1,
    avatarOffsetX: 0,
    avatarOffsetY: 0,
    interactive: false
  }
)

defineEmits<{
  (e: 'edit'): void
}>()

const frameClass = computed(() =>
  props.accent === 'user'
    ? 'border-sky-200 bg-sky-50'
    : 'border-slate-200 bg-slate-100'
)

const innerClass = computed(() =>
  props.avatarUrl
    ? 'bg-white'
    : props.accent === 'user'
      ? 'bg-gradient-to-br from-sky-100 to-white'
      : 'bg-gradient-to-br from-slate-100 to-white'
)

const textClass = computed(() =>
  props.accent === 'user' ? 'text-sky-700' : 'text-slate-700'
)

const imageStyle = computed(() => ({
  left: `calc(50% + ${(props.avatarOffsetX ?? 0) * 100}%)`,
  top: `calc(50% + ${(props.avatarOffsetY ?? 0) * 100}%)`,
  transform: `translate(-50%, -50%) scale(${props.avatarScale ?? 1})`,
  transformOrigin: 'center center',
  objectPosition: props.avatarObjectPosition
}))
</script>
