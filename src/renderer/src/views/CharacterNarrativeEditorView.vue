<template>
  <div class="entity-shell">
    <header class="entity-topbar">
      <div class="topbar-links">
        <router-link
          v-if="worldId"
          :to="{ name: 'WorldEditor', params: { worldId } }"
          class="back-link"
        >
          返回世界实例
        </router-link>
        <router-link
          :to="{ name: 'WorldEntityEditor', params: { worldId, entityId } }"
          class="sub-link"
        >
          返回功能选择
        </router-link>
      </div>

      <router-link to="/chat" class="assistant-link">AI 助手</router-link>
    </header>

    <main v-if="entityDetail" class="editor-page">
      <section class="panel-dark">
        <div class="editor-head">
          <div>
            <div class="eyebrow accent">Narrative Editor</div>
            <h1>{{ entityDetail.entity.name }}</h1>
          </div>
          <div class="editor-head-actions">
            <span class="editor-counts">
              {{ characterEditorStats.words }} 字词 {{ characterEditorStats.characters }} 字符
            </span>
            <span class="autosave-hint" :class="{ saving: savingNarrative, error: narrativeSaveState === 'error' }">
              {{ narrativeSaveHint }}
            </span>
            <WorldEditorShortcutHelp />
            <button
              type="button"
              class="editor-config-btn"
              :aria-label="showAppearancePanel ? '收起编辑器样式' : '打开编辑器样式'"
              :title="showAppearancePanel ? '收起编辑器样式' : '打开编辑器样式'"
              @click="showAppearancePanel = !showAppearancePanel"
            >
              <span class="editor-config-icon" aria-hidden="true">{{ showAppearancePanel ? '×' : '✎' }}</span>
            </button>
          </div>
        </div>

        <div class="editor-copy">
          文本编辑已经从人物展示页中拆出。这里专门维护人物介绍、经历、关系、秘密与叙事文案，不再和立绘布局混在一起。
        </div>

        <WorldRichTextAppearancePanel
          v-if="showAppearancePanel"
          v-model="characterEditorAppearance"
          class="appearance-popover"
        />

        <div class="editor-shell-frame">
          <WorldRichTextEditor
            v-model="characterDescriptionInput"
            class="narrative-editor"
            placeholder="写下人物介绍、经历、关系、秘密与转折。"
            :appearance="characterEditorAppearance"
            :show-toolbar-meta="false"
            :show-toolbar="false"
            @stats-change="characterEditorStats = $event"
          />
        </div>

        <footer class="editor-footer">
          <router-link
            :to="{ name: 'CharacterPortraitEditor', params: { worldId, entityId } }"
            class="feature-link"
          >
            进入人物立绘展示页
          </router-link>
        </footer>
      </section>
    </main>
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
import WorldEditorShortcutHelp from '../features/worldbuilding/editor/components/WorldEditorShortcutHelp.vue'
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

const canSaveNarrative = computed(() => Boolean(entityDetail.value))

const narrativeSaveHint = computed(() => {
  if (narrativeSaveState.value === 'saving') return '自动保存中...'
  if (narrativeSaveState.value === 'saved') return '已自动保存'
  if (narrativeSaveState.value === 'error') return '自动保存失败'
  return '自动保存'
})

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
.entity-shell {
  min-height: 100vh;
  padding: 20px;
  box-sizing: border-box;
  background:
    radial-gradient(circle at top left, rgba(43, 55, 75, 0.32), transparent 24%),
    linear-gradient(180deg, #0d1118 0%, #141a24 100%);
  color: #edf2f7;
}

.entity-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 10px;
}

.topbar-links {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.back-link,
.assistant-link,
.sub-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 7px 14px;
  border-radius: 14px;
  border: 1px solid rgba(185, 150, 93, 0.22);
  background: rgba(13, 17, 24, 0.94);
  color: #e7d2ad;
  line-height: 1;
  text-decoration: none;
  font: inherit;
}

.sub-link {
  border-color: rgba(205, 161, 92, 0.14);
  color: #cbb790;
}

.editor-page {
  min-height: calc(100vh - 108px);
}

.panel-dark {
  min-height: inherit;
  border-radius: 28px;
  border: 1px solid rgba(205, 161, 92, 0.18);
  background:
    linear-gradient(180deg, rgba(20, 25, 34, 0.98), rgba(13, 17, 24, 0.98));
  box-shadow: 0 26px 60px rgba(2, 4, 8, 0.38);
  padding: 18px;
  display: flex;
  flex-direction: column;
  position: relative;
}

.editor-head {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.editor-head h1 {
  margin: 8px 0 0;
  font-size: 34px;
  color: #f5efe4;
}

.editor-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #7c8798;
}

.eyebrow.accent {
  color: #cda15c;
}

.editor-copy {
  margin-top: 14px;
  color: #9aa6b8;
  line-height: 1.75;
}

.editor-counts,
.autosave-hint {
  font-size: 12px;
  color: #8f99ab;
  white-space: nowrap;
}

.autosave-hint.saving {
  color: #d7b272;
}

.autosave-hint.error {
  color: #ef8f8f;
}

.editor-config-btn {
  border: 1px solid rgba(205, 161, 92, 0.18);
  border-radius: 10px;
  width: 22px;
  height: 22px;
  padding: 0;
  background: rgba(11, 15, 22, 0.94);
  color: #e7d2ad;
  font: inherit;
  line-height: 1;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.editor-config-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  line-height: 1;
}

.appearance-popover {
  position: absolute;
  top: 94px;
  right: 18px;
  z-index: 20;
}

.editor-shell-frame {
  flex: 1;
  min-height: 0;
  margin-top: 14px;
  border-radius: 22px;
  overflow: hidden;
  border: 1px solid rgba(205, 161, 92, 0.12);
}

.narrative-editor {
  height: 100%;
}

.editor-footer {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
}

.feature-link {
  color: #e7d2ad;
  text-decoration: none;
  font-weight: 700;
}

@media (max-width: 900px) {
  .entity-topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .appearance-popover {
    position: static;
    width: 100%;
    margin-top: 14px;
  }
}
</style>
