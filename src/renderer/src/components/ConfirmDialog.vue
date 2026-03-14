<template>
  <teleport to="body">
    <div
      v-if="modelValue"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      @click.self="handleOverlayClick"
    >
      <div
        class="w-full rounded-xl border border-gray-200 bg-white p-5 shadow-2xl"
        :class="dialogSizeClass"
        role="dialog"
        aria-modal="true"
        :aria-busy="loading ? 'true' : 'false'"
      >
        <div class="flex items-center gap-3">
          <span
            v-if="resolvedIcon !== 'none'"
            class="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm"
            :class="iconClass"
          >
            {{ iconSymbol }}
          </span>
          <h3 class="text-base font-semibold text-gray-800">
            {{ title }}
          </h3>
        </div>
        <p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">
          {{ message }}
        </p>
        <div class="mt-6 flex items-center justify-end gap-3">
          <button
            v-if="showCancel"
            type="button"
            class="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="loading"
            @click="handleCancel"
          >
            {{ cancelText }}
          </button>
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
            :class="danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'"
            :disabled="loading"
            @click="handleConfirm"
          >
            {{ loading ? loadingText : confirmText }}
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'

type DialogSize = 'sm' | 'md' | 'lg'
type DialogIcon = 'none' | 'info' | 'warning' | 'danger' | 'success'

type Props = {
  modelValue: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  showCancel?: boolean
  loadingText?: string
  danger?: boolean
  loading?: boolean
  size?: DialogSize
  icon?: DialogIcon
  closeOnOverlay?: boolean
  closeOnEsc?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  confirmText: '确认',
  cancelText: '取消',
  showCancel: true,
  loadingText: '处理中...',
  danger: false,
  loading: false,
  size: 'md',
  icon: 'none',
  closeOnOverlay: true,
  closeOnEsc: true
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const dialogSizeClass = computed<string>(() => {
  if (props.size === 'sm') return 'max-w-sm'
  if (props.size === 'lg') return 'max-w-2xl'
  return 'max-w-md'
})

const resolvedIcon = computed<DialogIcon>(() => {
  if (props.icon !== 'none') return props.icon
  if (props.danger) return 'danger'
  return 'none'
})

const iconSymbol = computed<string>(() => {
  if (resolvedIcon.value === 'info') return 'ℹ️'
  if (resolvedIcon.value === 'warning') return '⚠️'
  if (resolvedIcon.value === 'danger') return '🗑️'
  if (resolvedIcon.value === 'success') return '✅'
  return ''
})

const iconClass = computed<string>(() => {
  if (resolvedIcon.value === 'info') return 'bg-blue-50 text-blue-700'
  if (resolvedIcon.value === 'warning') return 'bg-amber-50 text-amber-700'
  if (resolvedIcon.value === 'danger') return 'bg-red-50 text-red-700'
  if (resolvedIcon.value === 'success') return 'bg-emerald-50 text-emerald-700'
  return ''
})

const handleCancel = (): void => {
  if (props.loading) return
  emit('cancel')
  emit('update:modelValue', false)
}

const handleOverlayClick = (): void => {
  if (!props.closeOnOverlay) return
  handleCancel()
}

const handleConfirm = (): void => {
  if (props.loading) return
  emit('confirm')
}

const handleWindowKeydown = (event: KeyboardEvent): void => {
  if (!props.modelValue || !props.closeOnEsc) return
  if (event.key !== 'Escape') return
  event.preventDefault()
  handleCancel()
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      window.addEventListener('keydown', handleWindowKeydown)
    } else {
      window.removeEventListener('keydown', handleWindowKeydown)
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
})
</script>
