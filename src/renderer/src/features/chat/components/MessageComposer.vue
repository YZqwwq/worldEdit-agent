<template>
  <div
    class="w-full flex-shrink-0 rounded-[28px] border border-slate-200/80 bg-white/88 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.06)] backdrop-blur"
  >
    <div class="flex flex-col gap-3">
      <div class="flex min-h-[48px] items-center gap-3">
        <button
          type="button"
          class="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="isLoading"
          title="上传文件"
          @click="$emit('pick-file')"
        >
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>

        <div class="min-w-0 flex-1">
          <textarea
            ref="inputRef"
            :value="modelValue"
            rows="1"
            placeholder="有问题，尽管问"
            class="block h-7 max-h-36 min-h-[28px] w-full resize-none overflow-y-auto bg-transparent py-0 text-[15px] leading-7 text-slate-800 placeholder:text-slate-400 focus:outline-none"
            :disabled="isLoading"
            @input="handleInput"
            @keydown.enter.exact.prevent="emitSend"
          />
        </div>

        <div class="flex flex-shrink-0 items-center gap-2">
          <button
            v-if="isLoading"
            type="button"
            class="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-amber-500 to-rose-500 text-white shadow-md transition-transform hover:scale-[1.03] active:scale-95"
            title="终止生成"
            @click="handlePrimaryAction"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="6.5" y="6.5" width="11" height="11" rx="2.2" />
            </svg>
          </button>

          <button
            v-else
            type="button"
            class="flex h-11 w-11 items-center justify-center rounded-full bg-slate-950 text-white shadow-md transition-all hover:scale-[1.03] hover:bg-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            :disabled="!canSend"
            title="发送消息"
            @click="handlePrimaryAction"
          >
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M22 2 11 13" />
              <path d="m22 2-7 20-4-9-9-4Z" />
            </svg>
          </button>
        </div>
      </div>

      <div v-if="uploadedFiles.length" class="flex flex-col gap-2">
        <div
          v-for="file in uploadedFiles"
          :key="file.id"
          class="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/85 px-4 py-3 text-xs text-slate-700"
        >
          <div class="flex flex-col gap-1">
            <div class="flex items-center gap-2 font-medium text-slate-800">
              <span class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm">
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M13.234 20.252 21 12.3" />
                  <path d="m16 6-8.414 8.414a2 2 0 0 0 2.828 2.828L19 8.656a4 4 0 0 0-5.656-5.656L4.929 11.414a6 6 0 1 0 8.485 8.485L20 13" />
                </svg>
              </span>
              {{ file.name }} ({{ formatFileSize(file.size) }})
            </div>
            <div v-if="file.status === 'pending'" class="break-all text-[11px] text-slate-500">
              缓存路径：{{ file.sourcePath }}
            </div>
            <div v-else class="break-all text-[11px] text-slate-500">
              资源地址：{{ file.resourceUrl }}
            </div>
          </div>

          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white hover:text-red-600"
            title="删除文件"
            @click="$emit('delete-file', file)"
          >
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { UploadedChatFile } from '../types'

const props = defineProps<{
  modelValue: string
  isLoading: boolean
  canSend: boolean
  uploadedFiles: UploadedChatFile[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send'): void
  (e: 'interrupt'): void
  (e: 'pick-file'): void
  (e: 'delete-file', file: UploadedChatFile): void
}>()

const inputRef = ref<HTMLTextAreaElement | null>(null)

const syncTextareaHeight = (): void => {
  const el = inputRef.value
  if (!el) return
  el.style.height = '0px'
  const nextHeight = Math.min(el.scrollHeight, 144)
  el.style.height = `${Math.max(nextHeight, 28)}px`
}

const handleInput = (event: Event): void => {
  const target = event.target as HTMLTextAreaElement | null
  emit('update:modelValue', target?.value ?? '')
  syncTextareaHeight()
}

const emitSend = (): void => {
  if (!props.canSend || props.isLoading) return
  emit('send')
}

const handlePrimaryAction = (): void => {
  if (props.isLoading) {
    emit('interrupt')
    return
  }

  emitSend()
}

const focusInput = (): void => {
  inputRef.value?.focus()
}

const formatFileSize = (size: number): string => {
  if (size < 1024) return `${size} B`
  const kb = size / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(2)} MB`
}

defineExpose({
  focusInput
})

watch(
  () => props.modelValue,
  async () => {
    await nextTick()
    syncTextareaHeight()
  },
  { immediate: true }
)
</script>
