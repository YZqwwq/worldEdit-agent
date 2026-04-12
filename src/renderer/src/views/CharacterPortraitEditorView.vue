<template>
  <div class="entity-shell">
    <main v-if="entityDetail" class="entity-main">
      <article class="character-stage" :class="`layout-${characterLayoutVariant}`">
        <div class="character-base-layer">
          <div class="character-stage-noise" />
          <div class="character-stage-blur" />
          <div class="character-stage-glow" />
        </div>

        <div class="canvas-floating-nav">
          <div class="topbar-links">
            <router-link
              :to="{ name: 'WorldEntityEditor', params: { worldId, entityId } }"
              class="nav-segment-link"
              aria-label="返回人物实例"
              title="返回人物实例"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" class="nav-icon">
                <path
                  d="M15.5 4.5L8 12l7.5 7.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
              </svg>
            </router-link>
            <span class="nav-segment-divider" aria-hidden="true" />
            <router-link
              v-if="worldId"
              :to="{ name: 'WorldEditor', params: { worldId } }"
              class="nav-segment-link"
              aria-label="回到世界实例"
              title="回到世界实例"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" class="nav-icon">
                <path
                  d="M4 10.7L12 4l8 6.7"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
                <path
                  d="M7 10.8V20h10v-9.2"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
              </svg>
            </router-link>
          </div>

          <router-link to="/chat" class="assistant-link">AI 助手</router-link>
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
          <div class="stage-heading">
            <div class="eyebrow accent">Character Frame</div>
            <div class="autosave-hint" :class="{ saving: savingCharacter, error: characterSaveState === 'error' }">
              {{ characterSaveHint }}
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
            <input v-model.number="characterAgeInput" class="stage-meta-input" type="number" min="0" max="100000" />
          </label>

          <label class="stage-meta stage-meta-race">
            <span class="stage-meta-label">race</span>
            <input v-model.trim="characterRaceIdInput" class="stage-meta-input" type="text" maxlength="120" />
          </label>

          <label class="stage-meta stage-meta-height">
            <span class="stage-meta-label">height</span>
            <input v-model.trim="characterHeightInput" class="stage-meta-input" type="text" maxlength="120" />
          </label>

          <label class="stage-meta stage-meta-gender">
            <span class="stage-meta-label">gender</span>
            <input v-model.trim="characterGenderInput" class="stage-meta-input" type="text" maxlength="60" />
          </label>

          <div class="stage-footer-stack">
            <div class="floating-toolbar">
              <div class="floating-toolbar-group">
                <button type="button" class="ghost-stage-btn" @click="pickCharacterPortrait">
                  {{ characterPortraitUrl ? '更换立绘' : '添加立绘' }}
                </button>
                <button
                  type="button"
                  class="ghost-stage-btn subtle"
                  :disabled="!characterPortraitUrl"
                  @click="resetPortraitTransform"
                >
                  重置视图
                </button>
                <router-link
                  :to="{ name: 'CharacterNarrativeEditor', params: { worldId, entityId } }"
                  class="ghost-stage-link"
                >
                  文本编辑页
                </router-link>
              </div>

              <div class="floating-toolbar-group compact">
                <div class="layout-selector">
                  <button
                    v-for="variant in CHARACTER_LAYOUT_VARIANTS"
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

            <div class="stage-footer-grid">
              <label class="footer-chip">
                <span>势力</span>
                <input v-model.trim="characterFactionIdInput" class="footer-chip-input" type="text" maxlength="120" />
              </label>
              <label class="footer-chip">
                <span>出生地</span>
                <input v-model.trim="characterBirthplaceInput" class="footer-chip-input" type="text" maxlength="120" />
              </label>
              <label class="footer-chip">
                <span>国属</span>
                <input v-model.trim="characterNationIdInput" class="footer-chip-input" type="text" maxlength="120" />
              </label>
            </div>
          </div>
        </div>
      </article>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type {
  UpdateWorldEntityInput,
  UpsertWorldEntityComponentInput,
  WorldEntityDetailPayload
} from '@share/cache/worldbuilding/worldbuilding'
import { worldbuildingClientService } from '../services/worldbuildingClientService'
import { isFilePickerCancelled } from '../utils/filePicker'
import { toPlainIpcPayload } from '../utils/ipcPayload'
import { useKeyboardShortcut } from '../utils/useKeyboardShortcut'
import {
  CHARACTER_LAYOUT_VARIANTS,
  DEFAULT_PORTRAIT_TRANSFORM,
  getCharacterComponentByType,
  type CharacterDemographicData,
  type CharacterProfileData
} from '../features/worldbuilding/character/shared'
import {
  DEFAULT_WORLD_RICH_TEXT_APPEARANCE,
  normalizeWorldRichTextAppearance
} from '../features/worldbuilding/editor/model/editorAppearance'

const route = useRoute()

const entityDetail = ref<WorldEntityDetailPayload | null>(null)
const savingCharacter = ref(false)
const characterSaveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const characterNameInput = ref('')
const characterTitleInput = ref('')
const characterSummaryInput = ref('')
const characterDescriptionValue = ref('')
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
const portraitZoneRef = ref<HTMLElement | null>(null)

let syncingFromDetail = false
let characterAutosaveTimer: ReturnType<typeof setTimeout> | null = null
let characterSaveQueued = false
let lastSavedCharacterSignature = ''
let activePortraitPointerId: number | null = null
let portraitDragStartX = 0
let portraitDragStartY = 0
let portraitDragOriginX = 0
let portraitDragOriginY = 0

const worldId = computed(() => String(route.params.worldId || ''))
const entityId = computed(() => String(route.params.entityId || ''))

const canSaveCharacter = computed(() => Boolean(entityDetail.value && characterNameInput.value.trim()))
const characterSaveHint = computed(() => {
  if (characterSaveState.value === 'saving') return '自动保存中...'
  if (characterSaveState.value === 'saved') return '已自动保存'
  if (characterSaveState.value === 'error') return '自动保存失败'
  return '自动保存'
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
    description: characterDescriptionValue.value,
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
    birthplaceEntityId: characterBirthplaceInput.value.trim()
  })
)

const syncCharacterFormFromDetail = (): void => {
  if (!entityDetail.value) return
  const profile = getCharacterComponentByType<CharacterProfileData>(entityDetail.value, 'character_profile')
  const demographic = getCharacterComponentByType<CharacterDemographicData>(entityDetail.value, 'character_demographic')
  characterNameInput.value = entityDetail.value.entity.name || ''
  characterTitleInput.value = String(profile?.data?.title || '')
  characterSummaryInput.value = String(profile?.data?.summary || entityDetail.value.entity.summary || '')
  characterDescriptionValue.value = String(profile?.data?.description || '')
  characterPortraitUrl.value = String(profile?.data?.portraitResourceUrl || '')
  const portraitTransform = profile?.data?.portraitTransform
  portraitOffsetX.value = typeof portraitTransform?.offsetX === 'number' ? portraitTransform.offsetX : DEFAULT_PORTRAIT_TRANSFORM.offsetX
  portraitOffsetY.value = typeof portraitTransform?.offsetY === 'number' ? portraitTransform.offsetY : DEFAULT_PORTRAIT_TRANSFORM.offsetY
  portraitScale.value = typeof portraitTransform?.scale === 'number' ? portraitTransform.scale : DEFAULT_PORTRAIT_TRANSFORM.scale
  characterLayoutVariant.value = profile?.data?.layoutVariant === 'v2' || profile?.data?.layoutVariant === 'v3' ? profile.data.layoutVariant : 'v1'
  characterAgeInput.value = typeof demographic?.data?.age === 'number' ? demographic.data.age : null
  characterHeightInput.value = String(demographic?.data?.heightLabel || '')
  characterGenderInput.value = String(demographic?.data?.gender || '')
  characterRaceIdInput.value = String(demographic?.data?.raceEntityId || '')
  characterFactionIdInput.value = String(demographic?.data?.factionEntityId || '')
  characterNationIdInput.value = String(demographic?.data?.nationEntityId || '')
  characterBirthplaceInput.value = String(demographic?.data?.birthplaceEntityId || '')
  lastSavedCharacterSignature = characterAutosaveSignature.value
  characterSaveState.value = 'saved'
}

const loadEntityDetail = async (): Promise<void> => {
  if (!entityId.value) {
    entityDetail.value = null
    return
  }
  syncingFromDetail = true
  try {
    entityDetail.value = await worldbuildingClientService.getEntityDetail(entityId.value)
    syncCharacterFormFromDetail()
  } finally {
    syncingFromDetail = false
  }
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
    if (isFilePickerCancelled(error)) return
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

const resetPortraitTransform = (): void => {
  portraitOffsetX.value = DEFAULT_PORTRAIT_TRANSFORM.offsetX
  portraitOffsetY.value = DEFAULT_PORTRAIT_TRANSFORM.offsetY
  portraitScale.value = DEFAULT_PORTRAIT_TRANSFORM.scale
}

const saveCharacter = async (force = false): Promise<void> => {
  if (!canSaveCharacter.value || !entityDetail.value) return
  if (!force && characterAutosaveSignature.value === lastSavedCharacterSignature) return
  if (savingCharacter.value) {
    characterSaveQueued = true
    return
  }
  const profile = getCharacterComponentByType<CharacterProfileData>(entityDetail.value, 'character_profile')
  const demographic = getCharacterComponentByType<CharacterDemographicData>(entityDetail.value, 'character_demographic')
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
      description: characterDescriptionValue.value,
      descriptionFormat: 'html',
      portraitResourceUrl: characterPortraitUrl.value,
      portraitTransform: { offsetX: portraitOffsetX.value, offsetY: portraitOffsetY.value, scale: portraitScale.value },
      layoutVariant: characterLayoutVariant.value,
      editorAppearance: normalizeWorldRichTextAppearance(profile?.data?.editorAppearance ?? DEFAULT_WORLD_RICH_TEXT_APPEARANCE)
    }
  }
  const demographicInput: UpsertWorldEntityComponentInput<CharacterDemographicData> = {
    entityId: entityDetail.value.entity.id,
    componentType: 'character_demographic',
    schemaVersion: demographic?.schemaVersion ?? 1,
    data: {
      ...toPlainIpcPayload(demographic?.data ?? {}),
      age: typeof characterAgeInput.value === 'number' && Number.isFinite(characterAgeInput.value) ? characterAgeInput.value : null,
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

const scheduleCharacterAutosave = (delay = 700): void => {
  if (syncingFromDetail || !entityDetail.value) return
  clearCharacterAutosave()
  if (!canSaveCharacter.value || characterAutosaveSignature.value === lastSavedCharacterSignature) return
  characterSaveState.value = 'idle'
  characterAutosaveTimer = setTimeout(() => {
    characterAutosaveTimer = null
    void saveCharacter()
  }, delay)
}

onMounted(async () => {
  await loadEntityDetail()
})

watch(characterAutosaveSignature, () => {
  scheduleCharacterAutosave()
})

onBeforeUnmount(() => {
  clearCharacterAutosave()
})

useKeyboardShortcut(
  {
    key: 's',
    ctrlOrMeta: true,
    preventDefault: true,
    enabled: () => canSaveCharacter.value && !savingCharacter.value
  },
  async () => {
    clearCharacterAutosave()
    await saveCharacter(true)
  }
)
</script>

<style scoped>
.entity-shell {
  min-height: 100vh;
  padding: 0;
  box-sizing: border-box;
  background: linear-gradient(180deg, #0d1118 0%, #141a24 100%);
  color: #edf2f7;
}

.entity-main {
  display: flex;
  min-height: calc(100vh - 28px);
}

.character-stage {
  position: relative;
  flex: 1;
  min-height: 100vh;
  overflow: hidden;
  background: linear-gradient(180deg, #161c26 0%, #0b1017 100%);
  box-shadow: 0 30px 80px rgba(2, 4, 8, 0.42);
}

.character-base-layer,
.character-image-layer,
.character-content-layer {
  position: absolute;
  inset: 0;
}

.character-content-layer {
  z-index: 4;
  pointer-events: none;
}

.canvas-floating-nav,
.stage-heading,
.character-hero-copy,
.stage-meta,
.stage-footer-stack {
  pointer-events: auto;
}

.character-content-layer > * {
  pointer-events: auto;
}

.canvas-floating-nav {
  position: absolute;
  top: 22px;
  left: 22px;
  right: 22px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
  z-index: 6;
}

.topbar-links {
  display: flex;
  align-items: center;
  min-height: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(39, 41, 46, 0.82);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    0 18px 36px rgba(2, 4, 8, 0.24);
  backdrop-filter: blur(14px);
}

.nav-segment-link,
.assistant-link,
.ghost-stage-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 20px;
  min-width: 140px;
  padding: 0 22px;
  background: transparent;
  color: #f3f4f6;
  line-height: 1;
  text-decoration: none;
  font: inherit;
}

.nav-segment-link:hover {
  background: rgba(255, 255, 255, 0.04);
}

.nav-segment-divider {
  width: 2px;
  align-self: stretch;
  background: rgba(15, 16, 20, 0.92);
  box-shadow: 1px 0 0 rgba(255, 255, 255, 0.06);
}

.nav-icon {
  width: 26px;
  height: 20px;
  flex: none;
}

.assistant-link,
.ghost-stage-link {
  min-height: 46px;
  min-width: auto;
  padding: 8px 16px;
  border-radius: 16px;
  border: 1px solid rgba(185, 150, 93, 0.22);
  background: rgba(11, 15, 22, 0.78);
  backdrop-filter: blur(16px);
  color: #e7d2ad;
}

.character-stage-art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center bottom;
  transform-origin: center center;
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

.character-stage-noise,
.character-stage-blur,
.character-stage-glow {
  position: absolute;
  inset: 0;
}

.character-stage-noise {
  opacity: 0.18;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.75), transparent 92%);
}

.character-stage-blur {
  background: none;
}

.character-stage-glow {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent 18%),
    linear-gradient(0deg, rgba(7, 11, 18, 0.22), transparent 20%);
}

.portrait-design-backdrop {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(180deg, rgba(18, 23, 32, 0.02), rgba(8, 12, 18, 0.08)),
    radial-gradient(circle at 50% 86%, rgba(0, 0, 0, 0.26), transparent 62%);
}

.portrait-upload-placeholder {
  position: absolute;
  inset: 0;
  width: 100%;
  border: 1px dashed rgba(205, 161, 92, 0.28);
  background: rgba(8, 12, 18, 0.46);
  color: #e7d2ad;
  font: inherit;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
}

.stage-heading {
  position: absolute;
  top: 108px;
  left: 38px;
  z-index: 5;
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(10, 13, 20, 0.52);
  backdrop-filter: blur(18px);
  box-shadow: 0 12px 40px rgba(2, 4, 8, 0.22);
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

.autosave-hint {
  margin-top: 6px;
  font-size: 12px;
  color: #8f99ab;
}

.autosave-hint.saving {
  color: #d7b272;
}

.autosave-hint.error {
  color: #ef8f8f;
}

.ghost-stage-btn {
  border: 1px solid rgba(205, 161, 92, 0.18);
  border-radius: 16px;
  min-height: 46px;
  padding: 8px 16px;
  background: rgba(11, 15, 22, 0.78);
  backdrop-filter: blur(16px);
  color: #e7d2ad;
  font: inherit;
  cursor: pointer;
}

.ghost-stage-btn.subtle {
  color: #d7dce5;
}

.ghost-stage-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.layout-selector {
  display: inline-flex;
  gap: 10px;
  padding: 0 4px;
}

.layout-dot {
  width: 12px;
  height: 12px;
  border: 0;
  border-radius: 999px;
  background: rgba(148, 160, 183, 0.42);
  cursor: pointer;
}

.layout-dot.active {
  background: #d2a35d;
  box-shadow: 0 0 0 4px rgba(210, 163, 93, 0.14);
}

.character-hero-copy {
  position: absolute;
  top: 186px;
  left: 40px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(34%, 360px);
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
  outline: none;
}

.hero-name-input {
  font-size: clamp(48px, 5vw, 88px);
  line-height: 0.95;
  font-weight: 800;
  letter-spacing: -0.04em;
  text-shadow: 0 12px 30px rgba(2, 4, 8, 0.28);
}

.hero-title-input {
  font-size: 18px;
  font-weight: 600;
  color: #d8dfea;
}

.hero-summary-input {
  min-height: 84px;
  resize: none;
  font-size: 15px;
  line-height: 1.7;
  color: #cad3df;
}

.stage-meta {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 160px;
  z-index: 5;
  padding: 10px 12px;
  border-radius: 16px;
  background: rgba(9, 13, 19, 0.34);
  backdrop-filter: blur(12px);
}

.stage-meta-age { top: 43%; left: 40px; }
.stage-meta-race { top: 54%; left: 40px; }
.stage-meta-height { top: 65%; left: 40px; }
.stage-meta-gender { top: 76%; left: 40px; }

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
}

.stage-footer-stack {
  position: absolute;
  left: 24px;
  right: 24px;
  bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  z-index: 5;
}

.floating-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  border-radius: 22px;
  border: 1px solid rgba(205, 161, 92, 0.12);
  background: rgba(9, 13, 19, 0.62);
  backdrop-filter: blur(18px);
  box-shadow: 0 18px 40px rgba(2, 4, 8, 0.26);
}

.floating-toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.floating-toolbar-group.compact {
  flex-shrink: 0;
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
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.footer-chip-input {
  font-size: 16px;
  font-weight: 700;
}

@media (max-width: 720px) {
  .entity-main,
  .character-stage {
    min-height: 100vh;
  }

  .canvas-floating-nav,
  .floating-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .character-hero-copy {
    top: 210px;
    left: 24px;
    width: calc(100% - 48px);
  }

  .stage-footer-grid {
    grid-template-columns: 1fr;
  }

  .stage-meta-age,
  .stage-meta-race,
  .stage-meta-height,
  .stage-meta-gender {
    left: 24px;
    right: 24px;
    min-width: 0;
  }

  .stage-meta-age { top: 48%; }
  .stage-meta-race { top: 58%; }
  .stage-meta-height { top: 68%; }
  .stage-meta-gender { top: 78%; }
}
</style>
