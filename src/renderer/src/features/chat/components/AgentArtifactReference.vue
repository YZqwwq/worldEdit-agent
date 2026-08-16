<template>
  <div>
    <button
      type="button"
      class="group flex w-full items-center gap-3 border-t border-slate-200/80 py-3 text-left transition hover:text-blue-700"
      @click="openArtifact"
    >
      <span class="min-w-0 flex-1">
        <span class="mb-0.5 block text-[11px] font-semibold text-slate-400">
          {{ kindLabel }}
        </span>
        <span class="block truncate text-sm font-semibold text-slate-700 group-hover:text-blue-700">
          {{ artifact.title }}
        </span>
        <span
          v-if="artifact.summary"
          class="mt-1 line-clamp-2 block text-xs leading-5 text-slate-500"
        >
          {{ artifact.summary }}
        </span>
      </span>
      <span
        class="shrink-0 text-lg leading-none text-slate-400 group-hover:text-blue-600"
        aria-hidden="true"
      >
        ›
      </span>
    </button>

    <Teleport to="body">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/25 p-6"
        role="dialog"
        aria-modal="true"
        :aria-label="artifact.title"
        @click.self="closeArtifact"
      >
        <section
          class="flex max-h-[88vh] w-[min(920px,calc(100vw-48px))] flex-col overflow-hidden border border-slate-200 bg-white shadow-2xl"
        >
          <header
            class="flex min-h-16 items-start justify-between gap-6 border-b border-slate-200 px-7 py-4"
          >
            <div class="min-w-0">
              <p class="text-xs font-semibold text-slate-400">{{ kindLabel }}</p>
              <h2 class="mt-1 truncate text-xl font-semibold text-slate-900">
                {{ artifact.title }}
              </h2>
            </div>
            <button
              type="button"
              class="flex h-9 w-9 shrink-0 items-center justify-center text-2xl leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"
              aria-label="关闭观点文档"
              title="关闭"
              @click="closeArtifact"
            >
              ×
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto px-8 py-7">
            <p v-if="isLoading" class="text-sm text-slate-500">正在读取观点……</p>
            <p v-else-if="errorMessage" class="text-sm text-red-600">{{ errorMessage }}</p>
            <MdPreview
              v-else-if="artifactDetail"
              :model-value="artifactDetail.body"
              class="artifact-md-preview"
              theme="light"
            />
          </div>
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { MdPreview } from 'md-editor-v3'
import type { AgentArtifactPayload } from '../../../../../share/cache/AItype/states/agentArtifact'
import type { ChatMessageArtifactReference } from '../../../../../share/cache/render/aiagent/chatMessage'

const props = defineProps<{
  artifact: ChatMessageArtifactReference
}>()

const isOpen = ref(false)
const isLoading = ref(false)
const errorMessage = ref('')
const artifactDetail = ref<AgentArtifactPayload | null>(null)

const kindLabel = computed(() => {
  if (props.artifact.artifactKind === 'analysis') return 'AI 分析'
  if (props.artifact.artifactKind === 'proposal') return 'AI 建议'
  return 'AI 观点'
})

const handleEscape = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') closeArtifact()
}

const openArtifact = async (): Promise<void> => {
  isOpen.value = true
  document.addEventListener('keydown', handleEscape)
  if (artifactDetail.value || isLoading.value) return
  isLoading.value = true
  errorMessage.value = ''
  try {
    artifactDetail.value = await window.api.getAgentArtifact(props.artifact.artifactId)
    if (!artifactDetail.value) {
      errorMessage.value = '这份观点文档不存在或尚未完成提交。'
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '读取观点文档失败。'
  } finally {
    isLoading.value = false
  }
}

const closeArtifact = (): void => {
  isOpen.value = false
  document.removeEventListener('keydown', handleEscape)
}

onBeforeUnmount(() => document.removeEventListener('keydown', handleEscape))
</script>

<style scoped>
:deep(.artifact-md-preview),
:deep(.artifact-md-preview .md-editor-preview),
:deep(.artifact-md-preview .md-editor-preview-wrapper) {
  background: transparent !important;
  padding: 0 !important;
}

:deep(.artifact-md-preview .md-editor-preview) {
  color: #1e293b;
  font-size: 15px;
  line-height: 1.85;
}
</style>
