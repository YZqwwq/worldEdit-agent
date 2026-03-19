<template>
  <div class="entity-shell">
    <header class="entity-topbar">
      <router-link
        v-if="worldId"
        :to="{ name: 'WorldEditor', params: { worldId } }"
        class="back-link"
      >
        返回世界实例
      </router-link>

      <router-link to="/chat" class="assistant-link">AI 助手</router-link>
    </header>

    <main v-if="entityDetail" class="entity-main">
      <template v-if="isCharacter">
        <section class="character-left">
          <div class="left-header">
            <div class="eyebrow accent">Character Frame</div>
            <div class="header-fields">
              <input
                v-model.trim="characterNameInput"
                class="chrome-input chrome-input-name"
                type="text"
                maxlength="120"
                placeholder="角色名称"
              />
              <input
                v-model.trim="characterTitleInput"
                class="chrome-input"
                type="text"
                maxlength="120"
                placeholder="称号 / 代号"
              />
              <input
                v-model.trim="characterSummaryInput"
                class="chrome-input"
                type="text"
                maxlength="1000"
                placeholder="一句话角色概述"
              />
            </div>
          </div>

          <section class="portrait-panel">
            <div class="portrait-stage">
              <div class="portrait-card">
                <div class="portrait-placeholder">
                  <span class="portrait-code">{{ characterInitials }}</span>
                  <span class="portrait-copy">CHARACTER ART</span>
                </div>
              </div>

              <label class="orbit-card orbit-age">
                <span class="orbit-label">年龄</span>
                <input
                  v-model.number="characterAgeInput"
                  class="orbit-input"
                  type="number"
                  min="0"
                  max="100000"
                  placeholder="--"
                />
              </label>

              <label class="orbit-card orbit-race">
                <span class="orbit-label">种族</span>
                <input
                  v-model.trim="characterRaceIdInput"
                  class="orbit-input"
                  type="text"
                  maxlength="120"
                  placeholder="种族"
                />
              </label>

              <label class="orbit-card orbit-height">
                <span class="orbit-label">身高</span>
                <input
                  v-model.trim="characterHeightInput"
                  class="orbit-input"
                  type="text"
                  maxlength="120"
                  placeholder="例如 172cm"
                />
              </label>

              <label class="orbit-card orbit-gender">
                <span class="orbit-label">性别</span>
                <input
                  v-model.trim="characterGenderInput"
                  class="orbit-input"
                  type="text"
                  maxlength="60"
                  placeholder="未设定"
                />
              </label>
            </div>

            <div class="side-meta-grid">
              <label class="meta-chip">
                <span class="meta-chip-label">势力</span>
                <input
                  v-model.trim="characterFactionIdInput"
                  class="meta-chip-input"
                  type="text"
                  maxlength="120"
                  placeholder="所属势力"
                />
              </label>

              <label class="meta-chip">
                <span class="meta-chip-label">出生地</span>
                <input
                  v-model.trim="characterBirthplaceInput"
                  class="meta-chip-input"
                  type="text"
                  maxlength="120"
                  placeholder="出生地"
                />
              </label>

              <label class="meta-chip">
                <span class="meta-chip-label">国家</span>
                <input
                  v-model.trim="characterNationIdInput"
                  class="meta-chip-input"
                  type="text"
                  maxlength="120"
                  placeholder="所属国家"
                />
              </label>

              <div class="meta-chip meta-chip-static">
                <span class="meta-chip-label">状态</span>
                <strong>{{ entityDetail.entity.status }}</strong>
              </div>
            </div>

            <div class="left-actions">
              <button
                class="primary-btn"
                :disabled="savingCharacter || !canSaveCharacter"
                title="保存角色档案 (Ctrl+S)"
                @click="saveCharacter"
              >
                {{ savingCharacter ? '保存中...' : '保存角色档案' }}
              </button>
              <span class="shortcut-hint">Ctrl / Cmd + S</span>
            </div>
          </section>
        </section>

        <section class="character-right panel-dark">
          <div class="editor-head">
            <div>
              <div class="eyebrow accent">Narrative Editor</div>
              <h2>人物描述 / 生平记录</h2>
            </div>

            <button type="button" class="editor-config-btn" @click="showAppearancePanel = !showAppearancePanel">
              {{ showAppearancePanel ? '收起样式' : '编辑器样式' }}
            </button>
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
              show-shortcut-hint
              :appearance="characterEditorAppearance"
            />
          </div>
        </section>
      </template>

      <template v-else>
        <section class="panel description-panel">
          <div class="panel-head">
            <h2>描述文案</h2>
            <button
              class="primary-btn"
              :disabled="savingDescription || !canSaveDescription"
              title="保存描述 (Ctrl+S)"
              @click="saveDescription"
            >
              {{ savingDescription ? '保存中...' : '保存描述' }}
            </button>
          </div>

          <div class="form-stack">
            <MdEditor
              v-model="descriptionText"
              class="narrative-editor narrative-editor-light"
              previewTheme="github"
              codeTheme="github"
              :toolbars="genericToolbars"
              :footers="['markdownTotal', '=', 'scrollSwitch']"
              noUploadImg
            />
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>基础信息</h2>
          </div>
          <div class="meta-grid">
            <div class="meta-card">
              <span class="meta-label">实体类型</span>
              <strong>{{ displayEntityType }}</strong>
            </div>
            <div class="meta-card">
              <span class="meta-label">状态</span>
              <strong>{{ entityDetail.entity.status }}</strong>
            </div>
            <div class="meta-card full">
              <span class="meta-label">组件类型</span>
              <strong>{{ editableComponentType || '当前类型暂无默认文案组件' }}</strong>
            </div>
          </div>
        </section>
      </template>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { MdEditor, type ToolbarNames } from 'md-editor-v3'
import { useRoute } from 'vue-router'
import type {
  UpdateWorldEntityInput,
  UpsertWorldEntityComponentInput,
  WorldEntityComponentPayload,
  WorldEntityDetailPayload,
  WorldEntityType
} from '@share/cache/worldbuilding/worldbuilding'
import { worldbuildingClientService } from '../services/worldbuildingClientService'
import { useKeyboardShortcut } from '../utils/useKeyboardShortcut'
import WorldRichTextAppearancePanel from '../features/worldbuilding/editor/components/WorldRichTextAppearancePanel.vue'
import WorldRichTextEditor from '../features/worldbuilding/editor/components/WorldRichTextEditor.vue'
import {
  DEFAULT_WORLD_RICH_TEXT_APPEARANCE,
  normalizeWorldRichTextAppearance,
  type WorldRichTextAppearance
} from '../features/worldbuilding/editor/model/editorAppearance'

type CharacterProfileData = {
  title?: string
  summary?: string
  description?: string
  descriptionFormat?: 'markdown' | 'html'
  editorAppearance?: Partial<WorldRichTextAppearance>
  personalityTraits?: string[]
  abilities?: string[]
  tags?: string[]
}

type CharacterDemographicData = {
  age?: number | null
  ageLabel?: string
  heightLabel?: string
  gender?: string
  raceEntityId?: string
  factionEntityId?: string
  nationEntityId?: string
  birthplaceEntityId?: string
}

const route = useRoute()

const entityDetail = ref<WorldEntityDetailPayload | null>(null)
const savingDescription = ref(false)
const savingCharacter = ref(false)
const showAppearancePanel = ref(false)

const descriptionText = ref('')

const characterNameInput = ref('')
const characterTitleInput = ref('')
const characterSummaryInput = ref('')
const characterDescriptionInput = ref('')
const characterAgeInput = ref<number | null>(null)
const characterHeightInput = ref('')
const characterGenderInput = ref('')
const characterRaceIdInput = ref('')
const characterFactionIdInput = ref('')
const characterNationIdInput = ref('')
const characterBirthplaceInput = ref('')
const characterEditorAppearance = ref<WorldRichTextAppearance>(DEFAULT_WORLD_RICH_TEXT_APPEARANCE)

const worldId = computed(() => String(route.params.worldId || ''))
const entityId = computed(() => String(route.params.entityId || ''))

const genericToolbars: ToolbarNames[] = [
  'bold',
  'italic',
  'title',
  'quote',
  'unorderedList',
  'orderedList',
  'link',
  'table',
  'code',
  'codeRow',
  'revoke',
  'next',
  '=',
  'preview'
]

const editableComponentByType: Partial<Record<WorldEntityType, string>> = {
  character: 'character_profile',
  race: 'race_profile',
  faction: 'faction_profile',
  nation: 'nation_profile',
  city: 'city_profile',
  region: 'region_profile',
  map: 'map_profile',
  map_location: 'map_location_profile',
  event: 'event_profile',
  item: 'item_profile',
  rule: 'rule_profile',
  custom: 'custom_profile'
}

const isCharacter = computed(() => entityDetail.value?.entity.type === 'character')

const editableComponentType = computed(
  () => (entityDetail.value ? editableComponentByType[entityDetail.value.entity.type] || '' : '')
)
const canSaveDescription = computed(() => Boolean(entityDetail.value && editableComponentType.value))
const canSaveCharacter = computed(
  () => Boolean(entityDetail.value && isCharacter.value && characterNameInput.value.trim())
)

const displayEntityType = computed(() => {
  const currentType = entityDetail.value?.entity.type
  if (currentType === 'character') return '人物'
  if (currentType === 'race') return '种族'
  if (currentType === 'faction') return '势力'
  if (currentType === 'nation') return '国家'
  if (currentType === 'city') return '城市'
  if (currentType === 'region') return '区域'
  if (currentType === 'map') return '地图'
  if (currentType === 'map_location') return '地图标注'
  if (currentType === 'event') return '事件'
  if (currentType === 'item') return '物品'
  if (currentType === 'rule') return '规则'
  if (currentType === 'custom') return '自定义'
  return currentType || ''
})

const characterInitials = computed(() => {
  const base = (characterNameInput.value || entityDetail.value?.entity.name || '').trim()
  if (!base) return '??'
  const compact = base.replace(/\s+/g, '')
  return compact.slice(0, 2).toUpperCase()
})

const getEditableComponent = (): WorldEntityComponentPayload<Record<string, unknown>> | null => {
  if (!entityDetail.value || !editableComponentType.value) return null
  return (
    entityDetail.value.components.find(
      (component) => component.componentType === editableComponentType.value
    ) as WorldEntityComponentPayload<Record<string, unknown>> | undefined
  ) ?? null
}

const getComponentByType = <TData extends Record<string, unknown>>(
  componentType: string
): WorldEntityComponentPayload<TData> | null => {
  if (!entityDetail.value) return null
  return (
    entityDetail.value.components.find((component) => component.componentType === componentType) as
      | WorldEntityComponentPayload<TData>
      | undefined
  ) ?? null
}

const syncGenericFormFromDetail = (): void => {
  const editableComponent = getEditableComponent()
  descriptionText.value = String(editableComponent?.data?.description || '')
}

const syncCharacterFormFromDetail = (): void => {
  if (!entityDetail.value) return

  const profile = getComponentByType<CharacterProfileData>('character_profile')
  const demographic = getComponentByType<CharacterDemographicData>('character_demographic')

  characterNameInput.value = entityDetail.value.entity.name || ''
  characterTitleInput.value = String(profile?.data?.title || '')
  characterSummaryInput.value = String(profile?.data?.summary || entityDetail.value.entity.summary || '')
  characterDescriptionInput.value = String(profile?.data?.description || '')
  characterAgeInput.value =
    typeof demographic?.data?.age === 'number' ? demographic.data.age : null
  characterHeightInput.value = String(demographic?.data?.heightLabel || '')
  characterGenderInput.value = String(demographic?.data?.gender || '')
  characterRaceIdInput.value = String(demographic?.data?.raceEntityId || '')
  characterFactionIdInput.value = String(demographic?.data?.factionEntityId || '')
  characterNationIdInput.value = String(demographic?.data?.nationEntityId || '')
  characterBirthplaceInput.value = String(demographic?.data?.birthplaceEntityId || '')
  characterEditorAppearance.value = normalizeWorldRichTextAppearance(profile?.data?.editorAppearance)
}

const loadEntityDetail = async (): Promise<void> => {
  if (!entityId.value) {
    entityDetail.value = null
    return
  }

  entityDetail.value = await worldbuildingClientService.getEntityDetail(entityId.value)
  syncGenericFormFromDetail()
  if (isCharacter.value) {
    syncCharacterFormFromDetail()
  }
}

const saveDescription = async (): Promise<void> => {
  if (!canSaveDescription.value || savingDescription.value || !entityDetail.value) return

  const editableComponent = getEditableComponent()
  const nextData = {
    ...(editableComponent?.data ?? {}),
    description: descriptionText.value
  }

  savingDescription.value = true
  try {
    await worldbuildingClientService.upsertComponent({
      entityId: entityDetail.value.entity.id,
      componentType: editableComponentType.value,
      schemaVersion: editableComponent?.schemaVersion ?? 1,
      data: nextData
    })
    await loadEntityDetail()
  } finally {
    savingDescription.value = false
  }
}

const saveCharacter = async (): Promise<void> => {
  if (!canSaveCharacter.value || savingCharacter.value || !entityDetail.value) return

  const profile = getComponentByType<CharacterProfileData>('character_profile')
  const demographic = getComponentByType<CharacterDemographicData>('character_demographic')

  const entityInput: UpdateWorldEntityInput = {
    entityId: entityDetail.value.entity.id,
    name: characterNameInput.value.trim(),
    summary: characterSummaryInput.value.trim(),
    status: entityDetail.value.entity.status
  }

  const profileInput: UpsertWorldEntityComponentInput<CharacterProfileData> = {
    entityId: entityDetail.value.entity.id,
    componentType: 'character_profile',
    schemaVersion: profile?.schemaVersion ?? 1,
    data: {
      ...(profile?.data ?? {}),
      title: characterTitleInput.value.trim(),
      summary: characterSummaryInput.value.trim(),
      description: characterDescriptionInput.value,
      descriptionFormat: 'html',
      editorAppearance: normalizeWorldRichTextAppearance(characterEditorAppearance.value)
    }
  }

  const demographicInput: UpsertWorldEntityComponentInput<CharacterDemographicData> = {
    entityId: entityDetail.value.entity.id,
    componentType: 'character_demographic',
    schemaVersion: demographic?.schemaVersion ?? 1,
    data: {
      ...(demographic?.data ?? {}),
      age:
        typeof characterAgeInput.value === 'number' && Number.isFinite(characterAgeInput.value)
          ? characterAgeInput.value
          : null,
      ageLabel: demographic?.data?.ageLabel || '',
      heightLabel: characterHeightInput.value.trim(),
      gender: characterGenderInput.value.trim(),
      raceEntityId: characterRaceIdInput.value.trim(),
      factionEntityId: characterFactionIdInput.value.trim(),
      nationEntityId: characterNationIdInput.value.trim(),
      birthplaceEntityId: characterBirthplaceInput.value.trim()
    }
  }

  savingCharacter.value = true
  try {
    await Promise.all([
      worldbuildingClientService.updateEntity(entityInput),
      worldbuildingClientService.upsertComponent(profileInput),
      worldbuildingClientService.upsertComponent(demographicInput)
    ])
    await loadEntityDetail()
  } finally {
    savingCharacter.value = false
  }
}

onMounted(async () => {
  await loadEntityDetail()
})

useKeyboardShortcut(
  {
    key: 's',
    ctrlOrMeta: true,
    preventDefault: true,
    enabled: () =>
      (isCharacter.value && canSaveCharacter.value && !savingCharacter.value) ||
      (!isCharacter.value && canSaveDescription.value && !savingDescription.value)
  },
  async () => {
    if (isCharacter.value) {
      await saveCharacter()
      return
    }
    await saveDescription()
  }
)
</script>

<style scoped>
.entity-shell {
  height: 100vh;
  overflow: hidden;
  padding: 20px;
  box-sizing: border-box;
  background:
    radial-gradient(circle at top left, rgba(43, 55, 75, 0.32), transparent 24%),
    linear-gradient(180deg, #0d1118 0%, #141a24 100%);
  color: #edf2f7;
  display: flex;
  flex-direction: column;
}

.entity-topbar {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 14px;
}

.back-link,
.assistant-link,
.primary-btn {
  border-radius: 14px;
  font: inherit;
  text-decoration: none;
}

.back-link,
.assistant-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 14px;
  border: 1px solid rgba(185, 150, 93, 0.22);
  background: rgba(13, 17, 24, 0.94);
  color: #e7d2ad;
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

.editor-head h2 {
  margin: 0;
}

.entity-main {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-columns: 410px minmax(0, 1fr);
  gap: 16px;
}

.character-left,
.character-right,
.panel {
  min-height: 0;
}

.character-left {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.left-header {
  border-radius: 24px;
  border: 1px solid rgba(205, 161, 92, 0.18);
  background:
    linear-gradient(180deg, rgba(20, 25, 34, 0.98), rgba(13, 17, 24, 0.98));
  box-shadow: 0 22px 50px rgba(2, 4, 8, 0.34);
  padding: 18px;
}

.header-fields {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.chrome-input {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(205, 161, 92, 0.12);
  border-radius: 14px;
  padding: 12px 14px;
  background: rgba(8, 12, 18, 0.62);
  color: #f0f4f8;
  font: inherit;
}

.chrome-input-name {
  font-size: 20px;
  font-weight: 700;
  letter-spacing: 0.03em;
}

.chrome-input:focus,
.orbit-input:focus,
.meta-chip-input:focus {
  outline: none;
  border-color: #cda15c;
  box-shadow: 0 0 0 3px rgba(205, 161, 92, 0.12);
}

.portrait-panel {
  flex: 1;
  min-height: 0;
  border-radius: 28px;
  border: 1px solid rgba(205, 161, 92, 0.18);
  background:
    radial-gradient(circle at center, rgba(205, 161, 92, 0.08), transparent 38%),
    linear-gradient(180deg, rgba(18, 24, 34, 0.98), rgba(11, 15, 22, 0.98));
  box-shadow: 0 26px 60px rgba(2, 4, 8, 0.38);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.portrait-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  border-radius: 24px;
  border: 1px solid rgba(205, 161, 92, 0.08);
  background:
    linear-gradient(180deg, rgba(34, 42, 55, 0.82), rgba(12, 17, 25, 0.96));
  overflow: hidden;
}

.portrait-card {
  position: absolute;
  inset: 44px 52px;
  border-radius: 30px;
  border: 1px solid rgba(205, 161, 92, 0.14);
  background:
    radial-gradient(circle at center, rgba(205, 161, 92, 0.11), transparent 40%),
    linear-gradient(180deg, rgba(26, 34, 47, 0.96), rgba(10, 14, 20, 0.98));
  display: flex;
  align-items: center;
  justify-content: center;
}

.portrait-placeholder {
  width: 100%;
  height: 100%;
  border-radius: 30px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #d2a35d;
}

.portrait-code {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 140px;
  height: 140px;
  border-radius: 34px;
  background: linear-gradient(135deg, #ce9d55, #8d6027);
  color: #17110a;
  font-size: 54px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.portrait-copy {
  font-size: 12px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: #8f98a8;
}

.orbit-card {
  position: absolute;
  width: 126px;
  padding: 12px 12px 10px;
  border-radius: 18px;
  border: 1px solid rgba(205, 161, 92, 0.14);
  background: rgba(10, 14, 20, 0.88);
  backdrop-filter: blur(6px);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.orbit-age {
  top: 18px;
  left: 18px;
}

.orbit-race {
  top: 18px;
  right: 18px;
}

.orbit-height {
  bottom: 18px;
  left: 18px;
}

.orbit-gender {
  bottom: 18px;
  right: 18px;
}

.orbit-label,
.meta-chip-label {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #8994a6;
}

.orbit-input,
.meta-chip-input {
  width: 100%;
  box-sizing: border-box;
  border: 0;
  padding: 0;
  background: transparent;
  color: #f3f6fa;
  font: inherit;
  font-weight: 700;
}

.side-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.meta-chip {
  border-radius: 16px;
  border: 1px solid rgba(205, 161, 92, 0.12);
  background: rgba(9, 13, 19, 0.56);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.meta-chip-static strong {
  color: #f3f6fa;
  font-size: 16px;
  text-transform: capitalize;
}

.left-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.shortcut-hint {
  font-size: 12px;
  color: #8f99ab;
}

.panel-dark {
  min-height: 0;
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
  gap: 16px;
}

.editor-head h2 {
  margin-top: 6px;
  font-size: 22px;
  color: #f4ede1;
}

.editor-shell-frame {
  flex: 1;
  min-height: 0;
  margin-top: 14px;
  border-radius: 22px;
  overflow: hidden;
  border: 1px solid rgba(205, 161, 92, 0.12);
}

.editor-config-btn {
  border: 1px solid rgba(205, 161, 92, 0.18);
  border-radius: 14px;
  padding: 10px 14px;
  background: rgba(11, 15, 22, 0.94);
  color: #e7d2ad;
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}

.appearance-popover {
  position: absolute;
  top: 78px;
  right: 18px;
  z-index: 20;
}

.narrative-editor {
  height: 100%;
}

.narrative-editor-light {
  min-height: 420px;
}

:deep(.narrative-editor .md-editor) {
  height: 100%;
}

:deep(.narrative-editor .md-editor-toolbar) {
  background: rgba(11, 15, 22, 0.96);
}

:deep(.narrative-editor .md-editor-input-wrapper),
:deep(.narrative-editor .md-editor-preview-wrapper) {
  background: rgba(17, 22, 30, 0.98);
}

.panel {
  border-radius: 26px;
  border: 1px solid rgba(109, 129, 158, 0.16);
  background: rgba(255, 255, 255, 0.96);
  color: #1b2432;
  box-shadow: 0 24px 60px rgba(5, 8, 13, 0.26);
  padding: 20px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.description-panel {
  display: flex;
  flex-direction: column;
}

.form-stack {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
}

.form-label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: inherit;
}

.field {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(111, 132, 162, 0.24);
  background: #f8faff;
  color: #182233;
  border-radius: 16px;
  padding: 12px 14px;
  font: inherit;
}

.field:focus {
  outline: none;
  border-color: #cda15c;
  box-shadow: 0 0 0 3px rgba(205, 161, 92, 0.12);
}

.field-area {
  min-height: 320px;
  resize: vertical;
  line-height: 1.7;
}

.primary-btn {
  border: 0;
  padding: 12px 18px;
  background: linear-gradient(135deg, #d4a25d, #8e6128);
  color: #17110a;
  font-weight: 800;
  cursor: pointer;
}

.primary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.meta-grid {
  margin-top: 18px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.meta-card {
  border-radius: 18px;
  border: 1px solid rgba(109, 129, 158, 0.14);
  background: #fbfcff;
  padding: 16px;
}

.meta-card.full {
  grid-column: 1 / -1;
}

.meta-label {
  display: block;
  font-size: 12px;
  color: #6a7a90;
  margin-bottom: 8px;
}

@media (max-width: 1200px) {
  .entity-shell {
    height: auto;
    min-height: 100vh;
    overflow: auto;
  }

  .entity-main {
    grid-template-columns: 1fr;
    overflow: visible;
  }

  .character-left {
    min-height: auto;
  }

  .panel-dark,
  .portrait-panel {
    min-height: 640px;
  }

  .appearance-popover {
    position: static;
    width: 100%;
    margin: 14px 0 0;
  }
}

@media (max-width: 720px) {
  .entity-shell {
    padding: 16px;
  }

  .entity-topbar {
    flex-direction: column;
    align-items: stretch;
  }

  .portrait-card {
    inset: 78px 24px;
  }

  .orbit-card {
    width: 104px;
  }

  .side-meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
