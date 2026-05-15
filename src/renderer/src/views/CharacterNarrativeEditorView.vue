<template>
  <div class="worldbuilding-white-theme narrative-editor-page">
    <aside class="narrative-sidebar">
      <header class="sidebar-home">
        <router-link
          to="/"
          class="sidebar-home-link"
        >
          <span class="sidebar-icon" aria-hidden="true">⌂</span>
          <span>首页</span>
        </router-link>
        <button type="button" class="sidebar-menu-btn" aria-label="更多">...</button>
      </header>

      <section class="catalog-panel">
        <header class="catalog-head">
          <div class="catalog-title">
            <span class="sidebar-icon" aria-hidden="true">☷</span>
            <span>目录</span>
          </div>
          <div class="catalog-actions">
            <button type="button" aria-label="定位">✣</button>
            <button type="button" aria-label="目录设置">☰</button>
          </div>
        </header>

        <router-link
          v-if="worldId"
          class="catalog-tree-item active"
          :to="{ name: 'WorldEditor', params: { worldId } }"
        >
          <span aria-hidden="true">⌄</span>
          <span class="catalog-tree-title">{{ documentTitle }}</span>
        </router-link>

        <div class="catalog-child">名称思路构建</div>
      </section>
    </aside>

    <section class="narrative-main">
      <div class="format-toolbar" role="toolbar" aria-label="文本编辑工具栏">
        <div class="toolbar-group toolbar-group-primary">
          <button type="button" class="toolbar-add-btn" aria-label="新增">+</button>
        </div>

        <div
          v-for="(group, groupIndex) in toolbarGroups"
          :key="groupIndex"
          class="toolbar-group"
        >
          <button
            v-for="item in group"
            :key="item.label"
            type="button"
            class="toolbar-tool"
            :aria-label="item.title"
            :title="item.title"
          >
            {{ item.label }}
          </button>
        </div>

        <div class="toolbar-group toolbar-status-group">
          <span class="editor-counts">{{ characterEditorStats.characters }} 字</span>
          <span
            class="autosave-hint"
            :class="{ saving: savingNarrative, error: narrativeSaveState === 'error' }"
          >
            {{ narrativeSaveHint }}
          </span>
        </div>
      </div>

      <main v-if="entityDetail" class="editor-workspace">
        <WorldRichTextAppearancePanel
          v-if="showAppearancePanel"
          v-model="characterEditorAppearance"
          class="appearance-popover"
        />

        <section class="document-canvas">
          <div class="document-content-column">
            <h1 class="document-heading">{{ documentTitle }}</h1>
            <div class="document-meta-line" aria-hidden="true">⋮</div>
          </div>

          <WorldRichTextEditor
            v-model="characterDescriptionInput"
            class="narrative-editor"
            placeholder="写下人物介绍、经历、关系、秘密与转折。"
            :appearance="characterEditorAppearance"
            :show-toolbar-meta="false"
            :show-toolbar="false"
            theme="light"
            @stats-change="characterEditorStats = $event"
          />

          <span class="document-word-count">{{ characterEditorStats.characters }}字</span>
        </section>

        <aside class="outline-panel">
          <h2>大纲</h2>
        </aside>
      </main>

      <main v-else class="editor-loading">
        正在读取文本编辑页面
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type {
  UpsertWorldEntityComponentInput,
  WorldEntityDetailPayload
} from '@share/cache/worldbuilding/worldbuilding'
import { worldbuildingClientService } from '../services/worldbuildingClientService'
import { toPlainIpcPayload } from '../utils/ipcPayload'
import { useKeyboardShortcut } from '../utils/useKeyboardShortcut'
import { useAppTitleBar } from '../composables/useAppTitleBar'
import WorldRichTextAppearancePanel from '../features/worldbuilding/editor/components/WorldRichTextAppearancePanel.vue'
import WorldRichTextEditor from '../features/worldbuilding/editor/components/WorldRichTextEditor.vue'
import {
  DEFAULT_WORLD_RICH_TEXT_APPEARANCE,
  normalizeWorldRichTextAppearance,
  type WorldRichTextAppearance
} from '../features/worldbuilding/editor/model/editorAppearance'
import {
  getCharacterComponentByType,
  type CharacterProfileData
} from '../features/worldbuilding/character/shared'
import '../styles/worldbuildingWhiteTheme.css'

const route = useRoute()

const entityDetail = ref<WorldEntityDetailPayload | null>(null)
const characterDescriptionInput = ref('')
const characterEditorAppearance = ref<WorldRichTextAppearance>(DEFAULT_WORLD_RICH_TEXT_APPEARANCE)
const characterEditorStats = ref({ words: 0, characters: 0 })
const showAppearancePanel = ref(false)
const savingNarrative = ref(false)
const narrativeSaveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

let syncingFromDetail = false
let narrativeAutosaveTimer: ReturnType<typeof setTimeout> | null = null
let narrativeSaveQueued = false
let lastSavedNarrativeSignature = ''

const worldId = computed(() => String(route.params.worldId || ''))
const entityId = computed(() => String(route.params.entityId || ''))
const documentTitle = computed(() => entityDetail.value?.entity.name || '人物文本编辑')

const toolbarGroups = [
  [
    { label: '↶', title: '撤销' },
    { label: '↷', title: '重做' },
    { label: '刷', title: '格式刷' },
    { label: '擦', title: '清除格式' }
  ],
  [
    { label: '正文⌄', title: '段落样式' },
    { label: '15px⌄', title: '字号' }
  ],
  [
    { label: 'B', title: '加粗' },
    { label: 'I', title: '斜体' },
    { label: 'S', title: '删除线' },
    { label: 'U', title: '下划线' },
    { label: 'T⌄', title: '文字样式' }
  ],
  [
    { label: 'A⌄', title: '文字颜色' },
    { label: '⌁⌄', title: '高亮' }
  ],
  [
    { label: '≡⌄', title: '对齐' },
    { label: '•☰', title: '无序列表' },
    { label: '1☰', title: '有序列表' },
    { label: '▾☰', title: '缩进' }
  ],
  [
    { label: '☑', title: '待办' },
    { label: '🔗', title: '链接' },
    { label: '❝', title: '引用' },
    { label: '─', title: '分割线' }
  ]
] as const

const canSaveNarrative = computed(() => Boolean(entityDetail.value))

const narrativeSaveHint = computed(() => {
  if (narrativeSaveState.value === 'saving') return '自动保存中...'
  if (narrativeSaveState.value === 'saved') return '已自动保存'
  if (narrativeSaveState.value === 'error') return '自动保存失败'
  return '自动保存'
})

useAppTitleBar(
  computed(() => ({
    title: documentTitle.value,
    subtitle: '▧',
    meta: narrativeSaveHint.value
  }))
)

const narrativeAutosaveSignature = computed(() =>
  JSON.stringify({
    entityId: entityDetail.value?.entity.id || '',
    description: characterDescriptionInput.value,
    editorAppearance: normalizeWorldRichTextAppearance(characterEditorAppearance.value)
  })
)

const syncNarrativeFromDetail = (): void => {
  const profile = getCharacterComponentByType<CharacterProfileData>(entityDetail.value, 'character_profile')
  characterDescriptionInput.value = String(profile?.data?.description || '')
  characterEditorAppearance.value = normalizeWorldRichTextAppearance(profile?.data?.editorAppearance)
  lastSavedNarrativeSignature = narrativeAutosaveSignature.value
  narrativeSaveState.value = 'saved'
}

const loadEntityDetail = async (): Promise<void> => {
  if (!entityId.value) {
    entityDetail.value = null
    return
  }

  syncingFromDetail = true
  try {
    entityDetail.value = await worldbuildingClientService.getEntityDetail(entityId.value)
    syncNarrativeFromDetail()
  } finally {
    syncingFromDetail = false
  }
}

const saveNarrative = async (force = false): Promise<void> => {
  if (!canSaveNarrative.value || !entityDetail.value) return
  if (!force && narrativeAutosaveSignature.value === lastSavedNarrativeSignature) return
  if (savingNarrative.value) {
    narrativeSaveQueued = true
    return
  }

  const profile = getCharacterComponentByType<CharacterProfileData>(entityDetail.value, 'character_profile')

  const profileInput: UpsertWorldEntityComponentInput<CharacterProfileData> = {
    entityId: entityDetail.value.entity.id,
    componentType: 'character_profile',
    schemaVersion: profile?.schemaVersion ?? 1,
    data: {
      ...toPlainIpcPayload(profile?.data ?? {}),
      description: characterDescriptionInput.value,
      descriptionFormat: 'html',
      editorAppearance: normalizeWorldRichTextAppearance(characterEditorAppearance.value)
    }
  }

  savingNarrative.value = true
  narrativeSaveState.value = 'saving'
  const signatureAtSave = narrativeAutosaveSignature.value
  try {
    await worldbuildingClientService.upsertComponent(profileInput)
    lastSavedNarrativeSignature = signatureAtSave
    narrativeSaveState.value = 'saved'
  } catch (error) {
    narrativeSaveState.value = 'error'
    throw error
  } finally {
    savingNarrative.value = false
    if (narrativeSaveQueued || narrativeAutosaveSignature.value !== lastSavedNarrativeSignature) {
      narrativeSaveQueued = false
      scheduleNarrativeAutosave(120)
    }
  }
}

const clearNarrativeAutosave = (): void => {
  if (narrativeAutosaveTimer) {
    clearTimeout(narrativeAutosaveTimer)
    narrativeAutosaveTimer = null
  }
}

const scheduleNarrativeAutosave = (delay = 700): void => {
  if (syncingFromDetail || !entityDetail.value) return
  clearNarrativeAutosave()
  if (!canSaveNarrative.value || narrativeAutosaveSignature.value === lastSavedNarrativeSignature) return
  narrativeSaveState.value = 'idle'
  narrativeAutosaveTimer = setTimeout(() => {
    narrativeAutosaveTimer = null
    void saveNarrative()
  }, delay)
}

onMounted(async () => {
  await loadEntityDetail()
})

watch(narrativeAutosaveSignature, () => {
  scheduleNarrativeAutosave()
})

onBeforeUnmount(() => {
  clearNarrativeAutosave()
})

useKeyboardShortcut(
  {
    key: 's',
    ctrlOrMeta: true,
    preventDefault: true,
    enabled: () => canSaveNarrative.value && !savingNarrative.value
  },
  async () => {
    clearNarrativeAutosave()
    await saveNarrative(true)
  }
)
</script>

<style scoped>
.narrative-editor-page {
  --narrative-sidebar-width: 288px;

  width: 100vw;
  height: 100%;
  display: grid;
  grid-template-columns: var(--narrative-sidebar-width) minmax(0, 1fr);
  overflow: hidden;
  background: var(--wb-narrative-bg);
  color: var(--wb-narrative-text);
}

.narrative-sidebar {
  min-width: 0;
  border-right: 1px solid var(--wb-narrative-border);
  background: var(--wb-narrative-sidebar-bg);
  display: flex;
  flex-direction: column;
}

.sidebar-home,
.catalog-head,
.format-toolbar {
  flex-shrink: 0;
}

.sidebar-home {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 0 10px 0 14px;
  border-bottom: 1px solid var(--wb-narrative-border);
}

.sidebar-home-link,
.catalog-tree-item {
  color: inherit;
  text-decoration: none;
}

.sidebar-home-link {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--wb-narrative-text-muted);
}

.sidebar-icon {
  width: 18px;
  display: inline-flex;
  justify-content: center;
  color: var(--wb-narrative-text-muted);
}

.sidebar-menu-btn,
.catalog-actions button,
.toolbar-tool,
.toolbar-add-btn {
  border: 0;
  background: transparent;
  color: var(--wb-narrative-text-muted);
  font: inherit;
  cursor: pointer;
}

.sidebar-menu-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  line-height: 1;
}

.sidebar-menu-btn:hover,
.catalog-actions button:hover,
.toolbar-tool:hover {
  background: var(--wb-narrative-hover);
  color: var(--wb-narrative-text);
}

.catalog-panel {
  min-height: 0;
  padding: 0 4px;
  overflow: auto;
}

.catalog-head {
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0 7px;
  color: var(--wb-narrative-text-muted);
}

.catalog-title,
.catalog-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.catalog-title {
  min-width: 0;
  font-size: 15px;
}

.catalog-actions button {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: 12px;
}

.catalog-tree-item {
  height: 28px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 8px;
  border-radius: 6px;
  color: var(--wb-narrative-text);
  font-size: 13px;
  font-weight: 700;
}

.catalog-tree-item.active {
  background: var(--wb-narrative-active);
}

.catalog-tree-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.catalog-child {
  margin: 8px 0 0 56px;
  color: var(--wb-narrative-text-muted);
  font-size: 13px;
  line-height: 1.7;
}

.narrative-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--wb-narrative-surface-bg);
}

.format-toolbar {
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  border-bottom: 1px solid var(--wb-narrative-border);
  background: var(--wb-narrative-toolbar-bg);
  overflow-x: auto;
  overflow-y: hidden;
}

.toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 7px;
  border-left: 1px solid var(--wb-narrative-border);
}

.toolbar-group-primary {
  border-left: 0;
  padding-left: 0;
}

.toolbar-status-group {
  margin-left: auto;
  flex-shrink: 0;
}

.toolbar-tool,
.toolbar-add-btn {
  height: 28px;
  min-width: 26px;
  padding: 0 6px;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  white-space: nowrap;
  font-size: 13px;
}

.toolbar-add-btn {
  width: 18px;
  min-width: 18px;
  height: 18px;
  padding: 0;
  border-radius: 999px;
  background: var(--wb-narrative-accent);
  color: #ffffff;
  font-weight: 800;
}

.toolbar-tool.active {
  color: #315cff;
}

.editor-counts,
.autosave-hint {
  color: var(--wb-narrative-text-faint);
  font-size: 12px;
  white-space: nowrap;
}

.autosave-hint.saving {
  color: #b7791f;
}

.autosave-hint.error {
  color: #c24141;
}

.editor-workspace {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 250px;
  overflow: hidden;
}

.document-canvas {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #ffffff;
}

.document-content-column {
  width: min(var(--wb-narrative-editor-width), calc(100% - 80px));
  margin: 56px auto 0;
  color: var(--wb-narrative-text);
}

.document-heading {
  margin: 0 0 44px;
  font-size: 34px;
  line-height: 1.25;
  font-weight: 800;
  letter-spacing: 0;
}

.document-meta-line {
  width: 20px;
  margin-bottom: 14px;
  color: var(--wb-narrative-text-muted);
  font-size: 20px;
  line-height: 1;
}

.narrative-editor {
  position: absolute;
  inset: 162px 0 36px;
}

.document-word-count {
  position: absolute;
  left: 0;
  bottom: 92px;
  color: var(--wb-narrative-text-faint);
  font-size: 12px;
}

.outline-panel {
  min-width: 0;
  border-left: 0;
  background: #ffffff;
  padding: 48px 24px;
}

.outline-panel h2 {
  margin: 0;
  color: var(--wb-narrative-text);
  font-size: 15px;
  font-weight: 800;
}

.appearance-popover {
  position: absolute;
  top: 12px;
  right: 18px;
  z-index: 20;
}

.editor-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--wb-narrative-text-muted);
}

.narrative-editor :deep(.editor-shell) {
  height: 100%;
  gap: 0;
}

.narrative-editor :deep(.editor-frame) {
  height: 100%;
  border: 0;
  border-radius: 0;
  background: transparent;
}

.narrative-editor :deep(.editor-content .tiptap) {
  max-width: min(var(--wb-content-width, var(--wb-narrative-editor-width)), calc(100% - 80px));
  padding: 0 0 120px;
  color: var(--wb-narrative-text);
  font-size: calc(15px * var(--wb-font-scale, 1));
  line-height: var(--wb-line-height, 1.75);
}

.narrative-editor :deep(.editor-content .tiptap p) {
  color: var(--wb-narrative-text);
}

.narrative-editor :deep(.editor-content .tiptap h1),
.narrative-editor :deep(.editor-content .tiptap h2),
.narrative-editor :deep(.editor-content .tiptap h3),
.narrative-editor :deep(.editor-content .tiptap strong) {
  color: var(--wb-narrative-text);
}

.narrative-editor :deep(.editor-content .tiptap p.is-editor-empty:first-child::before) {
  color: var(--wb-narrative-text-faint);
}

.appearance-popover :deep(.appearance-panel) {
  border-color: var(--wb-narrative-border-strong);
  background: rgba(255, 255, 255, 0.98);
  color: var(--wb-narrative-text);
  box-shadow: 0 20px 46px rgba(17, 24, 39, 0.12);
}

.appearance-popover :deep(.panel-head h3),
.appearance-popover :deep(.setting-label) {
  color: var(--wb-narrative-text);
}

.appearance-popover :deep(.eyebrow),
.appearance-popover :deep(.panel-tip) {
  color: var(--wb-narrative-text-muted);
}

.appearance-popover :deep(.reset-btn) {
  border-color: var(--wb-narrative-border);
  background: var(--wb-narrative-hover);
  color: var(--wb-narrative-text);
}

.format-toolbar :deep(.shortcut-help-btn) {
  border: 0;
  background: transparent;
  color: var(--wb-narrative-text-muted);
}

@media (max-width: 980px) {
  .narrative-editor-page {
    --narrative-sidebar-width: 210px;
  }

  .editor-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .outline-panel {
    display: none;
  }

  .toolbar-status-group {
    margin-left: 0;
  }
}
</style>
