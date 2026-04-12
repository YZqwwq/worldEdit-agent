<template>
  <div class="w-full flex-shrink-0">
    <div v-if="uploadedFiles.length" class="mb-2 flex flex-wrap gap-2 px-1">
        <article
          v-for="file in uploadedFiles"
          :key="file.id"
          :title="`${file.name} (${formatFileSize(file.size)})`"
          class="group relative flex h-[56px] w-[56px] flex-shrink-0 items-center justify-center rounded-2xl"
        >
          <div class="relative h-full w-full overflow-hidden rounded-2xl border border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(191,219,254,0.35),_rgba(241,245,249,0.85)_65%)] shadow-sm ring-1 ring-white/70">
            <img
              v-if="isImageFile(file) && resolvePreviewUrl(file)"
              :src="resolvePreviewUrl(file)"
              :alt="file.name"
              class="h-full w-full object-cover"
            />
            <div
              v-else
              class="flex h-full items-center justify-center text-slate-400"
            >
              <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h8" />
                <path d="M8 17h5" />
              </svg>
            </div>

            <div
              v-if="file.status === 'pending'"
              class="absolute inset-0 flex items-center justify-center bg-white/72 text-[10px] font-medium text-slate-600 backdrop-blur-[1px]"
            >
              上传中
            </div>
          </div>

          <button
            type="button"
            aria-label="删除附件"
            class="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/78 text-white opacity-0 transition group-hover:opacity-100 hover:bg-rose-500"
            @click="$emit('delete-file', file)"
          >
            <svg class="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </article>
    </div>

    <div
      class="rounded-[26px] border border-slate-200/80 bg-white/88 px-4 py-2 shadow-[0_10px_24px_rgba(15,23,42,0.06)] backdrop-blur"
    >
      <div class="flex min-h-[42px] items-center gap-3">
        <button
          type="button"
          class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
            class="block h-7 max-h-36 min-h-[28px] w-full resize-none overflow-y-auto bg-transparent py-0 text-[14px] leading-[1.65] text-slate-800 placeholder:text-slate-400 focus:outline-none"
            :disabled="isLoading"
            @input="handleInput"
            @paste="handlePaste"
            @keydown.enter.exact.prevent="emitSend"
          />
        </div>

        <div class="flex flex-shrink-0 items-center gap-2">
          <button
            v-if="isLoading"
            type="button"
            class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-400 text-white shadow-md transition-all hover:scale-[1.03] hover:bg-slate-400 active:scale-95"
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
            class="flex h-10 w-10 items-center justify-center rounded-full bg-slate-400 text-white shadow-md transition-all hover:scale-[1.03] hover:bg-slate-500 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
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
  (e: 'paste-files', files: File[]): void
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

const handlePaste = (event: ClipboardEvent): void => {
  const files = Array.from(event.clipboardData?.files ?? [])
  if (!files.length) {
    return
  }

  event.preventDefault()
  emit('paste-files', files)
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

const isImageFile = (file: UploadedChatFile): boolean => {
  return String(file.mimeType || '').startsWith('image/')
}

const resolvePreviewUrl = (file: UploadedChatFile): string => {
  return file.previewUrl || file.resourceUrl || ''
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
