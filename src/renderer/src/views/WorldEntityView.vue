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
          <article
            class="character-stage"
            :class="`layout-${characterLayoutVariant}`"
          >
            <div class="character-base-layer">
              <div class="character-stage-noise" />
              <div class="character-stage-blur" />
              <div class="character-stage-glow" />
              <div class="stage-geometry">
                <span class="geo-line geo-line-long" />
                <span class="geo-line geo-line-short" />
                <span class="geo-angle" />
              </div>
            </div>

            <div class="character-image-layer">
              <div
                ref="portraitZoneRef"
                class="portrait-design-zone"
                :class="{ dragging: portraitDragging }"
                @pointerdown="startPortraitDrag"
                @pointermove="handlePortraitPointerMove"
                @pointerup="endPortraitDrag"
                @pointercancel="endPortraitDrag"
                @wheel.prevent="handlePortraitWheel"
              >
                <div class="portrait-design-backdrop" />
                <img
                  v-if="characterPortraitUrl"
                  :src="characterPortraitUrl"
                  alt="人物立绘"
                  class="character-stage-art"
                  :style="portraitTransformStyle"
                />
                <button
                  v-if="!characterPortraitUrl"
                  type="button"
                  class="portrait-upload-placeholder"
                  @click="pickCharacterPortrait"
                >
                  添加人物立绘
                </button>
              </div>
            </div>

            <div class="character-content-layer">
              <div class="character-stage-topbar">
                <div class="eyebrow accent">Character Frame</div>
                <div class="stage-topbar-actions">
                  <button type="button" class="ghost-stage-btn compact" @click="pickCharacterPortrait">
                    {{ characterPortraitUrl ? '更换立绘' : '添加立绘' }}
                  </button>
                  <span class="autosave-hint" :class="{ saving: savingCharacter, error: characterSaveState === 'error' }">
                    {{ characterSaveHint }}
                  </span>
                  <div class="layout-selector" role="tablist" aria-label="人物版式切换">
                    <button
                      v-for="variant in layoutVariants"
                      :key="variant.value"
                      type="button"
                      class="layout-dot"
                      :class="{ active: characterLayoutVariant === variant.value }"
                      :title="variant.label"
                      @click="characterLayoutVariant = variant.value"
                    />
                  </div>
                </div>
              </div>

              <div class="character-hero-copy">
                <input
                  v-model.trim="characterNameInput"
                  class="hero-name-input"
                  type="text"
                  maxlength="120"
                  placeholder="NAME"
                />
                <input
                  v-model.trim="characterTitleInput"
                  class="hero-title-input"
                  type="text"
                  maxlength="120"
                  placeholder="称号 / 代号"
                />
                <textarea
                  v-model.trim="characterSummaryInput"
                  class="hero-summary-input"
                  maxlength="1000"
                  placeholder="一句话角色概述"
                />
              </div>

              <label class="stage-meta stage-meta-age">
                <span class="stage-meta-label">age</span>
                <input
                  v-model.number="characterAgeInput"
                  class="stage-meta-input"
                  type="number"
                  min="0"
                  max="100000"
                  placeholder="----"
                />
              </label>

              <label class="stage-meta stage-meta-race">
                <span class="stage-meta-label">race</span>
                <input
                  v-model.trim="characterRaceIdInput"
                  class="stage-meta-input"
                  type="text"
                  maxlength="120"
                  placeholder="----"
                />
              </label>

              <label class="stage-meta stage-meta-height">
                <span class="stage-meta-label">height</span>
                <input
                  v-model.trim="characterHeightInput"
                  class="stage-meta-input"
                  type="text"
                  maxlength="120"
                  placeholder="例如 172cm"
                />
              </label>

              <label class="stage-meta stage-meta-gender">
                <span class="stage-meta-label">gender</span>
                <input
                  v-model.trim="characterGenderInput"
                  class="stage-meta-input"
                  type="text"
                  maxlength="60"
                  placeholder="----"
                />
              </label>

              <label class="stage-meta stage-meta-nation">
                <span class="stage-meta-label">nation</span>
                <input
                  v-model.trim="characterNationIdInput"
                  class="stage-meta-input"
                  type="text"
                  maxlength="120"
                  placeholder="----"
                />
              </label>

              <div class="stage-footer">
                <div class="stage-footer-grid">
                  <label class="footer-chip">
                    <span>势力</span>
                    <input
                      v-model.trim="characterFactionIdInput"
                      class="footer-chip-input"
                      type="text"
                      maxlength="120"
                      placeholder="所属势力"
                    />
                  </label>

                  <label class="footer-chip">
                    <span>出生地</span>
                    <input
                      v-model.trim="characterBirthplaceInput"
                      class="footer-chip-input"
                      type="text"
                      maxlength="120"
                      placeholder="出生地"
                    />
                  </label>

                  <div class="footer-chip footer-chip-static">
                    <span>状态</span>
                    <strong>{{ entityDetail.entity.status }}</strong>
                  </div>
                </div>
              </div>
            </div>

          </article>
        </section>

        <section class="character-right panel-dark">
          <div class="editor-head">
            <div>
              <div class="eyebrow accent">Narrative Editor</div>
              <h2>人物描述 / 生平记录</h2>
            </div>
            <div class="editor-head-actions">
              <span class="autosave-hint" :class="{ saving: savingCharacter, error: characterSaveState === 'error' }">
                {{ characterSaveHint }}
              </span>
              <button type="button" class="editor-config-btn" @click="showAppearancePanel = !showAppearancePanel">
                {{ showAppearancePanel ? '收起样式' : '编辑器样式' }}
              </button>
            </div>
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
            <span class="autosave-hint" :class="{ saving: savingDescription, error: descriptionSaveState === 'error' }">
              {{ descriptionSaveHint }}
            </span>
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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
import { isFilePickerCancelled } from '../utils/filePicker'
import { toPlainIpcPayload } from '../utils/ipcPayload'
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
  portraitResourceUrl?: string
  portraitTransform?: Partial<PortraitTransform>
  layoutVariant?: 'v1' | 'v2' | 'v3'
  editorAppearance?: Partial<WorldRichTextAppearance>
  personalityTraits?: string[]
  abilities?: string[]
  tags?: string[]
}

type PortraitTransform = {
  offsetX: number
  offsetY: number
  scale: number
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
const characterSaveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const descriptionSaveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

const descriptionText = ref('')

const characterNameInput = ref('')
const characterTitleInput = ref('')
const characterSummaryInput = ref('')
const characterDescriptionInput = ref('')
const characterPortraitUrl = ref('')
const characterLayoutVariant = ref<'v1' | 'v2' | 'v3'>('v1')
const portraitOffsetX = ref(0)
const portraitOffsetY = ref(0)
const portraitScale = ref(1)
const portraitDragging = ref(false)
const characterAgeInput = ref<number | null>(null)
const characterHeightInput = ref('')
const characterGenderInput = ref('')
const characterRaceIdInput = ref('')
const characterFactionIdInput = ref('')
const characterNationIdInput = ref('')
const characterBirthplaceInput = ref('')
const characterEditorAppearance = ref<WorldRichTextAppearance>(DEFAULT_WORLD_RICH_TEXT_APPEARANCE)
const portraitZoneRef = ref<HTMLElement | null>(null)

let syncingFromDetail = false
let characterAutosaveTimer: ReturnType<typeof setTimeout> | null = null
let descriptionAutosaveTimer: ReturnType<typeof setTimeout> | null = null
let characterSaveQueued = false
let descriptionSaveQueued = false
let lastSavedCharacterSignature = ''
let lastSavedDescriptionSignature = ''
let activePortraitPointerId: number | null = null
let portraitDragStartX = 0
let portraitDragStartY = 0
let portraitDragOriginX = 0
let portraitDragOriginY = 0

const DEFAULT_PORTRAIT_TRANSFORM: PortraitTransform = {
  offsetX: 0,
  offsetY: 0,
  scale: 1
}

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

const layoutVariants = [
  { value: 'v1' as const, label: '版式一' },
  { value: 'v2' as const, label: '版式二' },
  { value: 'v3' as const, label: '版式三' }
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
const characterSaveHint = computed(() => {
  if (characterSaveState.value === 'saving') return '自动保存中...'
  if (characterSaveState.value === 'saved') return '已自动保存'
  if (characterSaveState.value === 'error') return '自动保存失败'
  return '自动保存'
})
const descriptionSaveHint = computed(() => {
  if (descriptionSaveState.value === 'saving') return '自动保存中...'
  if (descriptionSaveState.value === 'saved') return '已自动保存'
  if (descriptionSaveState.value === 'error') return '自动保存失败'
  return '自动保存'
})

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

const portraitTransformStyle = computed(() => ({
  transform: `translate(${portraitOffsetX.value}px, ${portraitOffsetY.value}px) scale(${portraitScale.value})`
}))
const characterAutosaveSignature = computed(() =>
  JSON.stringify({
    entityId: entityDetail.value?.entity.id || '',
    name: characterNameInput.value.trim(),
    title: characterTitleInput.value.trim(),
    summary: characterSummaryInput.value.trim(),
    description: characterDescriptionInput.value,
    portraitResourceUrl: characterPortraitUrl.value,
    portraitTransform: {
      offsetX: portraitOffsetX.value,
      offsetY: portraitOffsetY.value,
      scale: portraitScale.value
    },
    layoutVariant: characterLayoutVariant.value,
    age:
      typeof characterAgeInput.value === 'number' && Number.isFinite(characterAgeInput.value)
        ? characterAgeInput.value
        : null,
    heightLabel: characterHeightInput.value.trim(),
    gender: characterGenderInput.value.trim(),
    raceEntityId: characterRaceIdInput.value.trim(),
    factionEntityId: characterFactionIdInput.value.trim(),
    nationEntityId: characterNationIdInput.value.trim(),
    birthplaceEntityId: characterBirthplaceInput.value.trim(),
    editorAppearance: normalizeWorldRichTextAppearance(characterEditorAppearance.value)
  })
)
const descriptionAutosaveSignature = computed(() =>
  JSON.stringify({
    entityId: entityDetail.value?.entity.id || '',
    componentType: editableComponentType.value,
    description: descriptionText.value
  })
)

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
  lastSavedDescriptionSignature = descriptionAutosaveSignature.value
  descriptionSaveState.value = 'saved'
}

const syncCharacterFormFromDetail = (): void => {
  if (!entityDetail.value) return

  const profile = getComponentByType<CharacterProfileData>('character_profile')
  const demographic = getComponentByType<CharacterDemographicData>('character_demographic')

  characterNameInput.value = entityDetail.value.entity.name || ''
  characterTitleInput.value = String(profile?.data?.title || '')
  characterSummaryInput.value = String(profile?.data?.summary || entityDetail.value.entity.summary || '')
  characterDescriptionInput.value = String(profile?.data?.description || '')
  characterPortraitUrl.value = String(profile?.data?.portraitResourceUrl || '')
  const portraitTransform = profile?.data?.portraitTransform
  portraitOffsetX.value =
    typeof portraitTransform?.offsetX === 'number' ? portraitTransform.offsetX : DEFAULT_PORTRAIT_TRANSFORM.offsetX
  portraitOffsetY.value =
    typeof portraitTransform?.offsetY === 'number' ? portraitTransform.offsetY : DEFAULT_PORTRAIT_TRANSFORM.offsetY
  portraitScale.value =
    typeof portraitTransform?.scale === 'number' ? portraitTransform.scale : DEFAULT_PORTRAIT_TRANSFORM.scale
  characterLayoutVariant.value =
    profile?.data?.layoutVariant === 'v2' || profile?.data?.layoutVariant === 'v3'
      ? profile.data.layoutVariant
      : 'v1'
  characterAgeInput.value =
    typeof demographic?.data?.age === 'number' ? demographic.data.age : null
  characterHeightInput.value = String(demographic?.data?.heightLabel || '')
  characterGenderInput.value = String(demographic?.data?.gender || '')
  characterRaceIdInput.value = String(demographic?.data?.raceEntityId || '')
  characterFactionIdInput.value = String(demographic?.data?.factionEntityId || '')
  characterNationIdInput.value = String(demographic?.data?.nationEntityId || '')
  characterBirthplaceInput.value = String(demographic?.data?.birthplaceEntityId || '')
  characterEditorAppearance.value = normalizeWorldRichTextAppearance(profile?.data?.editorAppearance)
  lastSavedCharacterSignature = characterAutosaveSignature.value
  characterSaveState.value = 'saved'
}

const pickCharacterPortrait = async (): Promise<void> => {
  try {
    const picked = await window.api.pickFile()
    const uploaded = await window.api.uploadFile(picked.sourcePath)
    characterPortraitUrl.value = uploaded.resourceUrl
    portraitOffsetX.value = DEFAULT_PORTRAIT_TRANSFORM.offsetX
    portraitOffsetY.value = DEFAULT_PORTRAIT_TRANSFORM.offsetY
    portraitScale.value = DEFAULT_PORTRAIT_TRANSFORM.scale
  } catch (error: unknown) {
    if (isFilePickerCancelled(error)) {
      return
    }
    console.error('Failed to pick character portrait:', error)
  }
}

const startPortraitDrag = (event: PointerEvent): void => {
  if (!characterPortraitUrl.value || !portraitZoneRef.value) return
  if ((event.target as HTMLElement | null)?.closest('button, input, textarea')) return
  activePortraitPointerId = event.pointerId
  portraitDragging.value = true
  portraitDragStartX = event.clientX
  portraitDragStartY = event.clientY
  portraitDragOriginX = portraitOffsetX.value
  portraitDragOriginY = portraitOffsetY.value
  portraitZoneRef.value.setPointerCapture(event.pointerId)
}

const handlePortraitPointerMove = (event: PointerEvent): void => {
  if (!portraitDragging.value || activePortraitPointerId !== event.pointerId) return
  portraitOffsetX.value = portraitDragOriginX + (event.clientX - portraitDragStartX)
  portraitOffsetY.value = portraitDragOriginY + (event.clientY - portraitDragStartY)
}

const endPortraitDrag = (event: PointerEvent): void => {
  if (activePortraitPointerId !== event.pointerId) return
  if (portraitZoneRef.value?.hasPointerCapture(event.pointerId)) {
    portraitZoneRef.value.releasePointerCapture(event.pointerId)
  }
  activePortraitPointerId = null
  portraitDragging.value = false
}

const handlePortraitWheel = (event: WheelEvent): void => {
  if (!characterPortraitUrl.value) return
  const nextScale = portraitScale.value + (event.deltaY < 0 ? 0.05 : -0.05)
  portraitScale.value = Math.min(2.5, Math.max(0.45, Number(nextScale.toFixed(2))))
}

const loadEntityDetail = async (): Promise<void> => {
  if (!entityId.value) {
    entityDetail.value = null
    return
  }

  syncingFromDetail = true
  try {
    entityDetail.value = await worldbuildingClientService.getEntityDetail(entityId.value)
    syncGenericFormFromDetail()
    if (isCharacter.value) {
      syncCharacterFormFromDetail()
    }
  } finally {
    syncingFromDetail = false
  }
}

const saveDescription = async (force = false): Promise<void> => {
  if (!canSaveDescription.value || !entityDetail.value) return
  if (!force && descriptionAutosaveSignature.value === lastSavedDescriptionSignature) return
  if (savingDescription.value) {
    descriptionSaveQueued = true
    return
  }

  const editableComponent = getEditableComponent()
  const nextData = {
    ...toPlainIpcPayload(editableComponent?.data ?? {}),
    description: descriptionText.value
  }

  savingDescription.value = true
  descriptionSaveState.value = 'saving'
  const signatureAtSave = descriptionAutosaveSignature.value
  try {
    await worldbuildingClientService.upsertComponent({
      entityId: entityDetail.value.entity.id,
      componentType: editableComponentType.value,
      schemaVersion: editableComponent?.schemaVersion ?? 1,
      data: nextData
    })
    lastSavedDescriptionSignature = signatureAtSave
    descriptionSaveState.value = 'saved'
  } catch (error) {
    descriptionSaveState.value = 'error'
    throw error
  } finally {
    savingDescription.value = false
    if (descriptionSaveQueued || descriptionAutosaveSignature.value !== lastSavedDescriptionSignature) {
      descriptionSaveQueued = false
      scheduleDescriptionAutosave(120)
    }
  }
}

const saveCharacter = async (force = false): Promise<void> => {
  if (!canSaveCharacter.value || !entityDetail.value) return
  if (!force && characterAutosaveSignature.value === lastSavedCharacterSignature) return
  if (savingCharacter.value) {
    characterSaveQueued = true
    return
  }

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
      ...toPlainIpcPayload(profile?.data ?? {}),
      title: characterTitleInput.value.trim(),
      summary: characterSummaryInput.value.trim(),
      description: characterDescriptionInput.value,
      descriptionFormat: 'html',
      portraitResourceUrl: characterPortraitUrl.value,
      portraitTransform: {
        offsetX: portraitOffsetX.value,
        offsetY: portraitOffsetY.value,
        scale: portraitScale.value
      },
      layoutVariant: characterLayoutVariant.value,
      editorAppearance: normalizeWorldRichTextAppearance(characterEditorAppearance.value)
    }
  }

  const demographicInput: UpsertWorldEntityComponentInput<CharacterDemographicData> = {
    entityId: entityDetail.value.entity.id,
    componentType: 'character_demographic',
    schemaVersion: demographic?.schemaVersion ?? 1,
    data: {
      ...toPlainIpcPayload(demographic?.data ?? {}),
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
  characterSaveState.value = 'saving'
  const signatureAtSave = characterAutosaveSignature.value
  try {
    await Promise.all([
      worldbuildingClientService.updateEntity(entityInput),
      worldbuildingClientService.upsertComponent(profileInput),
      worldbuildingClientService.upsertComponent(demographicInput)
    ])
    if (entityDetail.value) {
      entityDetail.value = {
        ...entityDetail.value,
        entity: {
          ...entityDetail.value.entity,
          name: entityInput.name,
          summary: entityInput.summary
        }
      }
    }
    lastSavedCharacterSignature = signatureAtSave
    characterSaveState.value = 'saved'
  } catch (error) {
    characterSaveState.value = 'error'
    throw error
  } finally {
    savingCharacter.value = false
    if (characterSaveQueued || characterAutosaveSignature.value !== lastSavedCharacterSignature) {
      characterSaveQueued = false
      scheduleCharacterAutosave(120)
    }
  }
}

const clearCharacterAutosave = (): void => {
  if (characterAutosaveTimer) {
    clearTimeout(characterAutosaveTimer)
    characterAutosaveTimer = null
  }
}

const clearDescriptionAutosave = (): void => {
  if (descriptionAutosaveTimer) {
    clearTimeout(descriptionAutosaveTimer)
    descriptionAutosaveTimer = null
  }
}

const scheduleCharacterAutosave = (delay = 700): void => {
  if (!isCharacter.value || syncingFromDetail || !entityDetail.value) return
  clearCharacterAutosave()
  if (!canSaveCharacter.value || characterAutosaveSignature.value === lastSavedCharacterSignature) return
  characterSaveState.value = 'idle'
  characterAutosaveTimer = setTimeout(() => {
    characterAutosaveTimer = null
    void saveCharacter()
  }, delay)
}

const scheduleDescriptionAutosave = (delay = 700): void => {
  if (isCharacter.value || syncingFromDetail || !entityDetail.value) return
  clearDescriptionAutosave()
  if (!canSaveDescription.value || descriptionAutosaveSignature.value === lastSavedDescriptionSignature) return
  descriptionSaveState.value = 'idle'
  descriptionAutosaveTimer = setTimeout(() => {
    descriptionAutosaveTimer = null
    void saveDescription()
  }, delay)
}

onMounted(async () => {
  await loadEntityDetail()
})

watch(characterAutosaveSignature, () => {
  scheduleCharacterAutosave()
})

watch(descriptionAutosaveSignature, () => {
  scheduleDescriptionAutosave()
})

onBeforeUnmount(() => {
  clearCharacterAutosave()
  clearDescriptionAutosave()
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
      clearCharacterAutosave()
      await saveCharacter(true)
      return
    }
    clearDescriptionAutosave()
    await saveDescription(true)
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
  grid-template-columns: 520px minmax(0, 1fr);
  gap: 16px;
}

.character-left,
.character-right,
.panel {
  min-height: 0;
}

.character-left {
  display: flex;
}

.character-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border-radius: 30px;
  border: 1px solid rgba(205, 161, 92, 0.18);
  background:
    radial-gradient(circle at top center, rgba(205, 161, 92, 0.12), transparent 28%),
    linear-gradient(180deg, #161c26 0%, #0b1017 100%);
  box-shadow: 0 26px 60px rgba(2, 4, 8, 0.38);
  padding: 22px;
}

.character-base-layer,
.character-image-layer,
.character-content-layer {
  position: absolute;
  inset: 0;
}

.character-base-layer {
  z-index: 1;
  pointer-events: none;
}

.character-image-layer {
  z-index: 2;
  pointer-events: none;
  inset: 0;
}

.character-content-layer {
  z-index: 4;
  pointer-events: none;
}

.character-content-layer > * {
  pointer-events: auto;
}

.character-stage-noise,
.character-stage-blur,
.character-stage-glow,
.character-stage-art {
  position: absolute;
  pointer-events: none;
}

.character-stage-noise,
.character-stage-blur,
.character-stage-glow {
  inset: 0;
}

.character-stage-art {
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center bottom;
  transform-origin: center center;
  -webkit-mask-image: linear-gradient(
    to top,
    transparent 0%,
    rgba(0, 0, 0, 0.2) 30%,
    rgba(0, 0, 0, 0.72) 50%,
    rgba(0, 0, 0, 1) 80%
  );
  mask-image: linear-gradient(
    to top,
    transparent 0%,
    rgba(0, 0, 0, 0.2) 30%,
    rgba(0, 0, 0, 0.72) 50%,
    rgba(0, 0, 0, 1) 80%
  );
  z-index: 3;
}

.character-stage-noise {
  background:
    radial-gradient(circle at 12% 10%, rgba(255, 255, 255, 0.08) 0 1px, transparent 1.5px),
    radial-gradient(circle at 88% 22%, rgba(255, 255, 255, 0.06) 0 1px, transparent 1.5px),
    radial-gradient(circle at 8% 76%, rgba(255, 255, 255, 0.05) 0 1px, transparent 1.5px);
  z-index: 0;
}

.character-stage-blur {
  inset: auto 0 0 0;
  height: 44%;
  backdrop-filter: blur(16px);
  background: linear-gradient(180deg, rgba(9, 13, 19, 0), rgba(9, 13, 19, 0.84) 42%, rgba(9, 13, 19, 0.96) 100%);
  mask-image: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.38) 24%, rgba(0, 0, 0, 1));
  z-index: 2;
}

.character-stage-glow {
  background:
    radial-gradient(circle at 48% 24%, rgba(255, 255, 255, 0.08), transparent 32%),
    linear-gradient(180deg, rgba(10, 14, 20, 0.12), rgba(10, 14, 20, 0.22));
  z-index: 1;
}

.portrait-upload-placeholder {
  position: absolute;
  inset: 0;
  z-index: 4;
  width: 100%;
  min-height: 100%;
  border: 1px dashed rgba(205, 161, 92, 0.28);
  border-radius: 24px;
  background: rgba(8, 12, 18, 0.46);
  color: #e7d2ad;
  font: inherit;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  backdrop-filter: blur(4px);
}

.character-stage-topbar {
  position: absolute;
  top: 22px;
  left: 22px;
  right: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  z-index: 5;
}

.stage-topbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

.layout-selector {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.layout-dot {
  width: 10px;
  height: 10px;
  border: 0;
  border-radius: 999px;
  background: rgba(148, 160, 183, 0.42);
  box-shadow: inset 0 0 0 1px rgba(205, 161, 92, 0.18);
  cursor: pointer;
}

.layout-dot.active {
  background: #d2a35d;
  box-shadow: 0 0 0 4px rgba(210, 163, 93, 0.14);
}

.ghost-stage-btn {
  border: 1px solid rgba(205, 161, 92, 0.18);
  border-radius: 14px;
  padding: 10px 14px;
  background: rgba(11, 15, 22, 0.72);
  color: #e7d2ad;
  font: inherit;
  cursor: pointer;
  backdrop-filter: blur(8px);
}

.ghost-stage-btn.compact {
  border-radius: 12px;
  padding: 7px 12px;
  font-size: 13px;
  line-height: 1.2;
}

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

.character-hero-copy {
  position: absolute;
  top: 96px;
  left: 28px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(46%, 250px);
  z-index: 5;
}

.hero-name-input,
.hero-title-input,
.hero-summary-input,
.stage-meta-input,
.footer-chip-input {
  width: 100%;
  box-sizing: border-box;
  border: 0;
  background: transparent;
  color: #f6f4ef;
  font: inherit;
}

.hero-name-input,
.hero-title-input,
.hero-summary-input,
.stage-meta-input,
.footer-chip-input,
.ghost-stage-btn {
  outline: none;
}

.hero-name-input::placeholder,
.hero-title-input::placeholder,
.hero-summary-input::placeholder,
.stage-meta-input::placeholder,
.footer-chip-input::placeholder {
  color: rgba(228, 236, 248, 0.48);
}

.hero-name-input {
  font-size: 42px;
  line-height: 0.95;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.hero-title-input {
  font-size: 16px;
  font-weight: 600;
  color: #d8dfea;
}

.hero-summary-input {
  min-height: 72px;
  resize: none;
  font-size: 14px;
  line-height: 1.7;
  color: #cad3df;
}

.stage-meta {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 120px;
  z-index: 5;
}

.stage-meta-label,
.footer-chip span {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #8f98a8;
}

.stage-meta-input {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.stage-meta-age {
  top: 312px;
  left: 28px;
}

.stage-meta-race {
  top: 408px;
  left: 28px;
}

.stage-meta-height {
  top: 504px;
  left: 28px;
}

.stage-meta-gender {
  top: 600px;
  left: 28px;
}

/* 右侧nation 调节位置 */
.stage-meta-nation {
  top: 100px;
  right: 30px;
  align-items: flex-end;
  text-align: right;
}

.portrait-design-zone {
  position: absolute;
  inset: 0;
  z-index: 2;
  border-radius: inherit;
  overflow: hidden;
  pointer-events: auto;
  cursor: grab;
}

.portrait-design-zone.dragging {
  cursor: grabbing;
}

.portrait-design-backdrop {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    linear-gradient(180deg, rgba(18, 23, 32, 0.02), rgba(8, 12, 18, 0.08)),
    radial-gradient(circle at 50% 86%, rgba(0, 0, 0, 0.26), transparent 62%);
  pointer-events: none;
}

.stage-footer {
  position: absolute;
  left: 24px;
  right: 24px;
  bottom: 24px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stage-footer-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.footer-chip {
  border: 1px solid rgba(205, 161, 92, 0.12);
  border-radius: 18px;
  background: rgba(9, 13, 19, 0.5);
  backdrop-filter: blur(10px);
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.footer-chip-input,
.footer-chip-static strong {
  font-size: 16px;
  font-weight: 700;
}

.footer-chip-static strong {
  color: #f6f4ef;
  text-transform: capitalize;
}

.stage-geometry {
  position: absolute;
  right: 18px;
  bottom: 128px;
  width: 110px;
  height: 110px;
  pointer-events: none;
  z-index: 4;
}

.geo-line {
  position: absolute;
  display: block;
  background: rgba(244, 239, 228, 0.18);
}

.geo-line-long {
  right: 10px;
  bottom: 18px;
  width: 1px;
  height: 90px;
}

.geo-line-short {
  left: 0;
  bottom: 0;
  width: 78px;
  height: 2px;
}

.geo-angle {
  position: absolute;
  right: 0;
  top: 18px;
  width: 24px;
  height: 24px;
  border-right: 2px solid rgba(210, 163, 93, 0.8);
  border-bottom: 2px solid rgba(210, 163, 93, 0.8);
  transform: rotate(-28deg);
}

.hero-name-input:focus,
.hero-title-input:focus,
.hero-summary-input:focus,
.stage-meta-input:focus,
.footer-chip-input:focus,
.ghost-stage-btn:focus {
  box-shadow: 0 0 0 3px rgba(205, 161, 92, 0.14);
  border-radius: 12px;
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

.editor-head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
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
  .character-stage {
    min-height: 760px;
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

  .entity-main {
    gap: 14px;
  }

  .character-stage {
    min-height: 820px;
    padding: 18px;
  }

  .character-hero-copy {
    top: 84px;
    left: 22px;
    width: min(48%, 190px);
  }

  .hero-name-input {
    font-size: 28px;
  }

  .stage-topbar-actions,
  .editor-head-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .stage-meta-age {
    top: 264px;
    left: 22px;
  }

  .stage-meta-race {
    top: 344px;
    left: 22px;
  }

  .stage-meta-height {
    top: 424px;
    left: 22px;
  }

  .stage-meta-gender {
    top: 504px;
    left: 22px;
  }

  .stage-meta-nation {
    top: 122px;
    right: 22px;
  }

  .stage-footer-grid {
    grid-template-columns: 1fr;
  }

  .stage-geometry {
    right: 14px;
    bottom: 164px;
    transform: scale(0.9);
    transform-origin: bottom right;
  }

}
</style>
