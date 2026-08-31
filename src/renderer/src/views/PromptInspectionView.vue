<template>
  <div class="prompt-page">
    <div v-if="error" class="error">{{ error }}</div>
    <div v-if="!hasRuntimeSnapshot && !error" class="empty-state">
      <strong>尚无可用的认知阶段运行时入参</strong>
      <span>请先让 Agent 完成一次认知调用。这里不会使用 mock 数据或人工拼接内容冒充真实模型入参。</span>
    </div>
    <main v-else-if="!error" class="prompt-layout">
      <aside class="section-list">
        <div class="sidebar-actions">
          <button type="button" class="save-button" :disabled="saving" @click="savePrompts">{{ saving ? '保存中...' : '保存并应用' }}</button>
          <button type="button" class="back-button" @click="router.push('/chat')">返回 AI</button>
          <span v-if="saveMessage" class="save-message">{{ saveMessage }}</span>
          <span v-if="runtimeCapturedAt" class="snapshot-source">{{ snapshotSource === 'trace' ? '历史日志快照' : '最新运行快照' }} · {{ runtimeCapturedAt }}</span>
        </div>
        <button v-for="section in sections" :key="section.id" type="button" class="section-item" :class="{ active: section.id === selectedId }" @click="selectSection(section.id)">
          <span class="section-title">{{ section.title }}</span>
          <span class="section-meta"><span>{{ section.editable ? '静态 · 可编辑' : `${section.messageType ?? '运行时'} · 只读` }}</span><span>#{{ (section.messageIndex ?? 0) + 1 }}</span></span>
        </button>
      </aside>
      <section class="full-panel">
        <div ref="fullPreview" class="full-preview"><section v-for="section in sections" :key="`${section.messageIndex}-${section.id}`" :ref="(element) => setSectionElement(section.id, element)" class="prompt-section" :class="{ highlighted: section.id === selectedId }" @click="selectedId = section.id"><div class="prompt-section-label"><span>{{ section.title }} · 消息 {{ (section.messageIndex ?? 0) + 1 }}</span><span v-if="section.mock">{{ section.mock }}</span></div><pre v-if="section.prefix" class="message-prefix">{{ section.prefix }}</pre><textarea v-model="section.content" :readonly="section.editable === false" :ref="(element) => setTextareaElement(section.id, element)" spellcheck="false" @input="resizeTextarea($event.target as HTMLTextAreaElement)" /></section></div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { PromptInspectionSection } from '../../../share/cache/AItype/states/promptInspection'

const router = useRouter()
const sections = ref<PromptInspectionSection[]>([])
const selectedId = ref('')
const error = ref('')
const saving = ref(false)
const saveMessage = ref('')
const hasRuntimeSnapshot = ref(false)
const runtimeCapturedAt = ref('')
const model = ref('')
const modelStep = ref(0)
const snapshotSource = ref<'runtime' | 'trace'>('runtime')
const fullPreview = ref<HTMLElement | null>(null)
const sectionElements = new Map<string, HTMLElement>()
const textareaElements = new Map<string, HTMLTextAreaElement>()

const setSectionElement = (id: string, element: unknown): void => {
  if (element instanceof HTMLElement) sectionElements.set(id, element)
}

const setTextareaElement = (id: string, element: unknown): void => {
  if (element instanceof HTMLTextAreaElement) {
    textareaElements.set(id, element)
    resizeTextarea(element)
  }
}

const resizeTextarea = (element: HTMLTextAreaElement): void => {
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

const selectSection = async (id: string): Promise<void> => {
  selectedId.value = id
  await nextTick()
  sectionElements.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const savePrompts = async (): Promise<void> => {
  saving.value = true
  saveMessage.value = ''
  try {
    await window.api.savePromptInspection({
      sections: sections.value.filter((section) => section.editable).map(({ id, content }) => ({ id, content }))
    })
    saveMessage.value = '静态 Prompt 已保存，下一轮认知调用生效'
  } catch (cause) {
    saveMessage.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    const payload = await window.api.getPromptInspection()
    hasRuntimeSnapshot.value = payload.hasRuntimeSnapshot
    runtimeCapturedAt.value = payload.runtimeCapturedAt ? new Date(payload.runtimeCapturedAt).toLocaleString() : ''
    model.value = payload.model ?? ''
    modelStep.value = payload.modelStep ?? 0
    snapshotSource.value = payload.snapshotSource ?? 'runtime'
    sections.value = payload.sections
    selectedId.value = payload.sections[0]?.id ?? ''
    await nextTick()
    textareaElements.forEach(resizeTextarea)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
})
</script>

<style scoped>
.prompt-page { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; background: #f5f7fa; color: #1f2937; }
.back-button { border: 1px solid #cfd6df; background: #fff; color: #334155; border-radius: 6px; padding: 8px 14px; cursor: pointer; }
.sidebar-actions { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border-bottom: 1px solid #edf0f3; }
.save-button { border: 1px solid #2563eb; background: #2563eb; color: #fff; border-radius: 6px; padding: 8px 14px; cursor: pointer; }
.save-button:disabled { cursor: wait; opacity: .65; }
.save-message { color: #15803d; font-size: 12px; }
.snapshot-source { color: #94a3b8; font-size: 11px; line-height: 1.5; }
.empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 9px; padding: 32px; color: #64748b; text-align: center; }
.empty-state strong { color: #334155; font-size: 14px; }
.empty-state span { max-width: 620px; font-size: 12px; line-height: 1.7; }
.prompt-layout { min-height: 0; flex: 1; display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 1px; background: #dfe4ea; align-items: stretch; }
.section-list, .full-panel { min-width: 0; min-height: 0; background: #fff; display: flex; flex-direction: column; overflow: auto; }
.section-item { display: flex; flex-direction: column; gap: 7px; text-align: left; border: 0; border-bottom: 1px solid #f0f2f5; background: #fff; padding: 13px 16px; cursor: pointer; }
.section-item:hover { background: #f8fafc; } .section-item.active { background: #eef5ff; box-shadow: inset 3px 0 #3b82f6; }
.section-title { font-size: 13px; color: #1e293b; } .section-meta { display: flex; justify-content: space-between; color: #94a3b8; font-size: 11px; }
.full-preview { padding: 18px; background: #fff; overflow: visible; }
.error { margin: 24px; color: #b91c1c; }
.prompt-section { display: block; margin: 8px 0; padding: 10px 12px; border: 1px solid transparent; border-radius: 4px; transition: border-color .2s, box-shadow .2s; }
.prompt-section-label { display: flex; justify-content: space-between; gap: 12px; margin: 0 0 8px; color: #64748b; font: 11px/1.4 ui-sans-serif, system-ui, sans-serif; }
.message-prefix { margin: 0 0 8px; padding: 9px 10px; border-left: 2px solid #cbd5e1; white-space: pre-wrap; word-break: break-word; color: #64748b; background: #f8fafc; font: 11px/1.6 ui-monospace, SFMono-Regular, Consolas, monospace; }
.prompt-section.highlighted { border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.12); background: transparent; }
.prompt-section textarea { display: block; width: 100%; min-height: 110px; box-sizing: border-box; border: 0; outline: 0; resize: none; overflow: hidden; white-space: pre-wrap; word-break: break-word; font: 12px/1.7 ui-monospace, SFMono-Regular, Consolas, monospace; color: #334155; background: transparent; }
.prompt-section textarea[readonly] { color: #64748b; }
@media (max-width: 700px) { .prompt-layout { grid-template-columns: 180px minmax(0, 1fr); } }
</style>
