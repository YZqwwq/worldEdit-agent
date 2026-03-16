<template>
  <div
    class="flex w-full flex-shrink-0 gap-4 rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur"
  >
    <div class="flex flex-grow flex-col gap-3">
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100"
          :disabled="isLoading"
          title="上传文件"
          @click="$emit('pick-file')"
        >
          📎
        </button>

        <div class="relative flex-grow">
          <textarea
            ref="inputRef"
            :value="modelValue"
            placeholder="输入你的问题... (Enter 发送)"
            class="h-14 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 py-3.5 pl-5 pr-4 text-sm text-slate-800 placeholder-slate-400 shadow-inner transition-all focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            :disabled="isLoading"
            @input="handleInput"
            @keydown.enter.exact.prevent="emitSend"
          />
        </div>
      </div>

      <div v-if="uploadedFiles.length" class="flex flex-col gap-2">
        <div
          v-for="file in uploadedFiles"
          :key="file.id"
          class="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700"
        >
          <div class="flex flex-col gap-1">
            <div class="font-medium text-slate-800">
              {{ file.name }} ({{ formatFileSize(file.size) }})
            </div>
            <div v-if="file.status === 'pending'" class="break-all text-[11px] text-slate-500">
              缓存路径：{{ file.sourcePath }}
            </div>
            <div v-else class="break-all text-[11px] text-slate-500">
              存储路径：{{ file.path }}
            </div>
          </div>

          <button
            type="button"
            class="flex h-7 w-7 items-center justify-center text-slate-500 hover:text-red-600"
            title="删除文件"
            @click="$emit('delete-file', file)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>

    <button
      type="button"
      class="flex h-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 px-8 text-sm font-semibold text-white shadow-md transition-all hover:from-blue-600 hover:to-indigo-700 hover:shadow-lg active:scale-95 focus:ring-4 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
      :disabled="isLoading || !modelValue.trim()"
      @click="emitSend"
    >
      {{ isLoading ? '思考中...' : '发送' }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { UploadedChatFile } from '../types'

const props = defineProps<{
  modelValue: string
  isLoading: boolean
  uploadedFiles: UploadedChatFile[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'send'): void
  (e: 'pick-file'): void
  (e: 'delete-file', file: UploadedChatFile): void
}>()

const inputRef = ref<HTMLTextAreaElement | null>(null)

const handleInput = (event: Event): void => {
  const target = event.target as HTMLTextAreaElement | null
  emit('update:modelValue', target?.value ?? '')
}

const emitSend = (): void => {
  if (!props.modelValue.trim() || props.isLoading) return
  emit('send')
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
</script>
