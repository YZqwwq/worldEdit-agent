<template>
  <div class="worldbuilding-white-theme profile-editor-page">
    <main class="editor-main">
      <section
        v-if="entityDetail && isCharacter"
        ref="stageViewportRef"
        class="profile-stage"
        :class="{ 'profile-stage-transforming': transformModeActive }"
      >
        <canvas ref="backgroundCanvasRef" class="stage-canvas stage-canvas-bg"></canvas>

        <div
          class="character-layer-wrap"
          :class="{ 'character-layer-wrap-transforming': transformModeActive }"
        >
          <div
            ref="characterTransformRef"
            class="character-transform-layer"
            :class="{ transforming: transformModeActive }"
            :style="characterLayerStyle"
            @mousedown="handleCharacterDragStart"
            @wheel.prevent="handleCharacterWheelScale"
          >
            <img
              v-if="characterPortraitUrl"
              :src="characterPortraitUrl"
              alt=""
              class="character-layer-image"
              draggable="false"
            />
            <div v-else class="character-layer-placeholder">
              <div class="placeholder-badge">PNG</div>
              <div class="placeholder-copy">人物层待导入</div>
            </div>

            <template v-if="transformModeActive">
              <button
                v-for="handle in transformHandles"
                :key="handle"
                type="button"
                class="transform-handle"
                :class="`transform-handle-${handle}`"
                tabindex="-1"
                @mousedown.stop.prevent="handleTransformScaleStart($event)"
              ></button>
            </template>
          </div>
        </div>

        <canvas ref="overlayCanvasRef" class="stage-canvas stage-canvas-overlay"></canvas>

        <div class="stage-dom-layer">
          <div class="stage-toolbar">
            <router-link
              v-if="worldId"
              :to="{ name: 'WorldEditor', params: { worldId } }"
              class="stage-toolbar-link"
            >
              返回世界实例
            </router-link>
            <router-link
              :to="{ name: 'WorldEntityEditor', params: { worldId, entityId } }"
              class="stage-toolbar-link stage-toolbar-link-muted"
            >
              返回功能选择
            </router-link>
            <router-link to="/chat" class="stage-toolbar-link stage-toolbar-link-muted">
              AI 助手
            </router-link>
          </div>

          <section class="identity-panel">
            <div class="identity-race">{{ leftRaceLabel }}</div>
            <div v-if="characterTitleInput" class="identity-caption">{{ characterTitleInput }}</div>
            <h1 class="identity-name">{{ displayName }}</h1>
          </section>

          <section class="dossier-panel">
            <header class="dossier-static-head">
              <span class="dossier-static-icon">▣</span>
              <span class="dossier-static-line"></span>
              <span class="dossier-static-title">人物资料</span>
            </header>

            <div class="dossier-static-section">基础信息</div>
            <div class="dossier-static-body dossier-basic-info-body">
              <div
                v-for="row in basicInfoRows"
                :key="row.key"
                class="basic-info-row"
                :class="{ empty: !row.value }"
              >
                <span class="basic-info-label">[ {{ row.label }} ]</span>
                <span v-if="row.value" class="basic-info-value">{{ row.value }}</span>
              </div>
            </div>

            <div class="dossier-static-section">能力评估</div>
            <div class="dossier-static-body dossier-static-body-fill"></div>
          </section>

        </div>
      </section>

      <section v-else-if="entityDetail" class="fallback-panel">
        <h2>当前实体不是人物</h2>
        <p>该页面仅用于人物简介编辑，请返回实体入口页继续操作。</p>
      </section>

      <section v-else class="fallback-panel">
        <h2>正在读取实体信息</h2>
        <p>请稍候，我正在加载当前人物数据。</p>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type {
  UpdateWorldEntityInput,
  UpsertWorldEntityComponentInput,
  WorldEntityComponentPayload,
  WorldEntityDetailPayload
} from '@share/cache/worldbuilding/worldbuilding'
import { worldbuildingClientService } from '../services/worldbuildingClientService'
import { toPlainIpcPayload } from '../utils/ipcPayload'
import { useKeyboardShortcut } from '../utils/useKeyboardShortcut'
import {
  CHARACTER_BASIC_INFO_DEFAULT_FIELDS,
  CHARACTER_BASIC_INFO_DEFAULT_ORDER,
  getCharacterBasicInfoValue,
  getCharacterComponentByType,
  type CharacterDemographicData,
  type CharacterProfileData
} from '../features/worldbuilding/character/shared'
import '../styles/worldbuildingWhiteTheme.css'

const route = useRoute()

const backgroundCanvasRef = ref<HTMLCanvasElement | null>(null)
const overlayCanvasRef = ref<HTMLCanvasElement | null>(null)
const stageViewportRef = ref<HTMLElement | null>(null)
const characterTransformRef = ref<HTMLElement | null>(null)
const entityDetail = ref<WorldEntityDetailPayload | null>(null)
const relatedEntityNameMap = ref(new Map<string, string>())
const characterNameInput = ref('')
const characterTitleInput = ref('')
const characterSummaryInput = ref('')
const savingProfile = ref(false)
const profileSaveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const transformModeActive = ref(false)
const committedCharacterTransform = ref({ x: 0.5, y: 0.58, scale: 1 })
const draftCharacterTransform = ref({ x: 0.5, y: 0.58, scale: 1 })

let syncingFromDetail = false
let profileAutosaveTimer: ReturnType<typeof setTimeout> | null = null
let profileSaveQueued = false
let stageResizeObserver: ResizeObserver | null = null
let lastSavedProfileSignature = ''
let previousBodyOverflow = ''
let previousHtmlOverflow = ''
let activeTransformPointer:
  | {
      mode: 'drag' | 'scale'
      pointerId: number
      startClientX: number
      startClientY: number
      startX: number
      startY: number
      startScale: number
      startDistance: number
      centerX: number
      centerY: number
    }
  | null = null
const transformHandles = ['nw', 'ne', 'sw', 'se'] as const

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const worldId = computed(() => String(route.params.worldId || ''))
const entityId = computed(() => String(route.params.entityId || ''))
const isCharacter = computed(() => entityDetail.value?.entity.type === 'character')
const canSaveProfile = computed(() => Boolean(entityDetail.value) && isCharacter.value)

const profileComponent = computed(() =>
  getCharacterComponentByType<CharacterProfileData>(entityDetail.value, 'character_profile')
)
const demographicComponent = computed(() =>
  getCharacterComponentByType<CharacterDemographicData>(entityDetail.value, 'character_demographic')
)

const displayName = computed(() => characterNameInput.value || entityDetail.value?.entity.name || '未命名角色')
const leftRaceLabel = computed(() => {
  const raceName = resolveReferencedEntityName(
    getCharacterBasicInfoValue(demographicComponent.value?.data, 'race'),
    ''
  )
  return raceName ? `种族：${raceName}` : '种族：'
})

const basicInfoRows = computed(() => {
  const basicInfo = demographicComponent.value?.data?.basicInfo
  const orderedKeys = [
    ...new Set([
      'name',
      ...CHARACTER_BASIC_INFO_DEFAULT_ORDER.filter((key) => key !== 'height'),
      ...(basicInfo?.order ?? [])
    ])
  ]

  return orderedKeys
    .map((key) => {
      if (key === 'name') {
        return {
          key,
          label: basicInfo?.fields?.name?.label || '姓名',
          value: displayName.value
        }
      }

      const field = basicInfo?.fields?.[key] ?? CHARACTER_BASIC_INFO_DEFAULT_FIELDS[
        key as keyof typeof CHARACTER_BASIC_INFO_DEFAULT_FIELDS
      ]
      if (!field) return null
      const rawFieldValue = 'value' in field ? field.value : ''
      const rawValue = rawFieldValue == null ? '' : String(rawFieldValue).trim()
      const value = field.kind === 'entity_ref'
        ? resolveReferencedEntityName(rawValue, '')
        : rawValue

      return {
        key,
        label: field.label || key,
        value
      }
    })
    .filter((row): row is { key: string; label: string; value: string } => Boolean(row))
})

const characterPortraitUrl = computed(() => String(profileComponent.value?.data?.portraitResourceUrl || ''))
const activeCharacterTransform = computed(() =>
  transformModeActive.value ? draftCharacterTransform.value : committedCharacterTransform.value
)

const characterLayerStyle = computed(() => ({
  left: `${(activeCharacterTransform.value.x * 100).toFixed(2)}%`,
  top: `${(activeCharacterTransform.value.y * 100).toFixed(2)}%`,
  transform: `translate(-50%, -50%) scale(${activeCharacterTransform.value.scale})`
}))

const resolveReferencedEntityName = (entityIdValue: string | undefined, emptyLabel: string): string => {
  const normalizedId = String(entityIdValue || '').trim()
  if (!normalizedId) return emptyLabel
  return relatedEntityNameMap.value.get(normalizedId) || normalizedId
}

const profileAutosaveSignature = computed(() =>
  JSON.stringify({
    entityId: entityDetail.value?.entity.id || '',
    name: characterNameInput.value,
    title: characterTitleInput.value,
    summary: characterSummaryInput.value
  })
)

const createCharacterTransformFromProfile = (): { x: number; y: number; scale: number } => {
  const portraitTransform = profileComponent.value?.data?.portraitTransform
  return {
    x: clamp(0.5 + Number(portraitTransform?.offsetX ?? 0) / 100, 0.16, 0.72),
    y: clamp(0.58 + Number(portraitTransform?.offsetY ?? 0) / 100, 0.18, 0.88),
    scale: clamp(Number(portraitTransform?.scale ?? 1), 0.45, 1.9)
  }
}

const cloneCharacterTransform = (value: { x: number; y: number; scale: number }) => ({
  x: value.x,
  y: value.y,
  scale: value.scale
})

const syncProfileFromDetail = (): void => {
  const profile = profileComponent.value
  characterNameInput.value = String(entityDetail.value?.entity.name || '')
  characterTitleInput.value = String(profile?.data?.title || entityDetail.value?.entity.title || '')
  characterSummaryInput.value = String(profile?.data?.summary || entityDetail.value?.entity.summary || '')
  const nextTransform = createCharacterTransformFromProfile()
  committedCharacterTransform.value = cloneCharacterTransform(nextTransform)
  draftCharacterTransform.value = cloneCharacterTransform(nextTransform)
  transformModeActive.value = false
  lastSavedProfileSignature = profileAutosaveSignature.value
  profileSaveState.value = 'saved'
}

const resizeCanvas = (canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null => {
  const context = canvas.getContext('2d')
  if (!context) return null
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const nextWidth = Math.max(1, Math.floor(width * dpr))
  const nextHeight = Math.max(1, Math.floor(height * dpr))
  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth
    canvas.height = nextHeight
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0)
  context.clearRect(0, 0, width, height)
  return context
}

const drawStageBackground = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
  ctx.fillStyle = '#d6d6d4'
  ctx.fillRect(0, 0, width, height)
}

const getDossierPanelWidth = (width: number): number => {
  if (width <= 760) return Math.min(width * 0.76, 320)
  if (width <= 1024) return 360
  if (width <= 1280) return Math.max(Math.min(width * 0.43, 540), 360)
  return Math.max(Math.min(width * 0.39, 560), 420)
}

const drawDossierPanelBackground = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
  const panelWidth = getDossierPanelWidth(width)
  const left = width - panelWidth
  const headHeight = 64
  const sectionHeight = 36
  const basicBodyHeight = 310
  const abilityTop = headHeight + sectionHeight + basicBodyHeight

  ctx.save()
  ctx.fillStyle = 'rgba(202, 202, 200, 0.72)'
  ctx.fillRect(left, 0, panelWidth, height)

  ctx.fillStyle = 'rgba(43, 43, 43, 0.94)'
  ctx.fillRect(left, 0, panelWidth, headHeight)

  ctx.fillStyle = 'rgba(120, 120, 118, 0.78)'
  ctx.fillRect(left, headHeight, panelWidth, sectionHeight)
  ctx.fillRect(left, abilityTop, panelWidth, sectionHeight)

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(left, headHeight + sectionHeight + basicBodyHeight)
  ctx.lineTo(width, headHeight + sectionHeight + basicBodyHeight)
  ctx.stroke()

  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.fillRect(left + panelWidth * 0.86, headHeight, panelWidth * 0.14, height - headHeight)
  ctx.restore()
}

const drawStageOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
  drawDossierPanelBackground(ctx, width, height)

  ctx.save()
  ctx.fillStyle = 'rgba(255,255,255,0.78)'
  ctx.fillRect(width * 0.016, height * 0.1, width * 0.012, 4)
  ctx.fillRect(width * 0.973, height * 0.1, width * 0.012, 4)
  ctx.fillRect(width * 0.016, height * 0.93, width * 0.012, 4)
  ctx.fillRect(width * 0.973, height * 0.93, width * 0.012, 4)
  ctx.restore()

  ctx.save()
  ctx.strokeStyle = 'rgba(255,255,255,0.1)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(width * 0.27, height * 0.2)
  ctx.bezierCurveTo(width * 0.33, height * 0.12, width * 0.46, height * 0.14, width * 0.53, height * 0.23)
  ctx.stroke()
  ctx.restore()
}

const renderStage = (): void => {
  const viewport = stageViewportRef.value
  const backgroundCanvas = backgroundCanvasRef.value
  const overlayCanvas = overlayCanvasRef.value
  if (!viewport || !backgroundCanvas || !overlayCanvas) return

  const rect = viewport.getBoundingClientRect()
  const width = Math.max(1, rect.width)
  const height = Math.max(1, rect.height)

  const backgroundContext = resizeCanvas(backgroundCanvas, width, height)
  const overlayContext = resizeCanvas(overlayCanvas, width, height)
  if (!backgroundContext || !overlayContext) return

  drawStageBackground(backgroundContext, width, height)
  drawStageOverlay(overlayContext, width, height)
}

const commitTransformMode = async (): Promise<void> => {
  committedCharacterTransform.value = cloneCharacterTransform(draftCharacterTransform.value)
  transformModeActive.value = false
  activeTransformPointer = null
  clearProfileAutosave()
  await saveProfile(true).catch(() => undefined)
}

const cancelTransformMode = (): void => {
  draftCharacterTransform.value = cloneCharacterTransform(committedCharacterTransform.value)
  transformModeActive.value = false
  activeTransformPointer = null
}

const handleTransformModeKeydown = (event: KeyboardEvent): void => {
  if (!transformModeActive.value) return

  const key = event.key.toLowerCase()

  if (key === 'escape') {
    event.preventDefault()
    cancelTransformMode()
    return
  }

  if (key === 'enter') {
    event.preventDefault()
    void commitTransformMode()
    return
  }
}

const clearActiveTransformPointer = (): void => {
  activeTransformPointer = null
}

const handleTransformPointerMove = (event: MouseEvent): void => {
  if (!transformModeActive.value || !activeTransformPointer || !stageViewportRef.value) return

  const stageRect = stageViewportRef.value.getBoundingClientRect()
  if (activeTransformPointer.mode === 'drag') {
    const deltaX = (event.clientX - activeTransformPointer.startClientX) / Math.max(stageRect.width, 1)
    const deltaY = (event.clientY - activeTransformPointer.startClientY) / Math.max(stageRect.height, 1)
    draftCharacterTransform.value = {
      x: clamp(activeTransformPointer.startX + deltaX, 0.12, 0.82),
      y: clamp(activeTransformPointer.startY + deltaY, 0.12, 0.9),
      scale: activeTransformPointer.startScale
    }
    return
  }

  const distance = Math.hypot(
    event.clientX - activeTransformPointer.centerX,
    event.clientY - activeTransformPointer.centerY
  )
  const ratio =
    activeTransformPointer.startDistance > 0 ? distance / activeTransformPointer.startDistance : 1
  draftCharacterTransform.value = {
    x: activeTransformPointer.startX,
    y: activeTransformPointer.startY,
    scale: clamp(activeTransformPointer.startScale * ratio, 0.45, 2.4)
  }
}

const handleTransformPointerUp = (): void => {
  clearActiveTransformPointer()
}

const handleCharacterDragStart = (event: MouseEvent): void => {
  if (!transformModeActive.value || event.button !== 0 || !stageViewportRef.value) return

  const target = event.target as HTMLElement | null
  if (target?.closest('.transform-handle')) return

  event.preventDefault()
  activeTransformPointer = {
    mode: 'drag',
    pointerId: event.button,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: draftCharacterTransform.value.x,
    startY: draftCharacterTransform.value.y,
    startScale: draftCharacterTransform.value.scale,
    startDistance: 0,
    centerX: 0,
    centerY: 0
  }
}

const handleTransformScaleStart = (event: MouseEvent): void => {
  if (!transformModeActive.value || event.button !== 0 || !characterTransformRef.value) return

  const rect = characterTransformRef.value.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const startDistance = Math.hypot(event.clientX - centerX, event.clientY - centerY)
  event.preventDefault()
  activeTransformPointer = {
    mode: 'scale',
    pointerId: event.button,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: draftCharacterTransform.value.x,
    startY: draftCharacterTransform.value.y,
    startScale: draftCharacterTransform.value.scale,
    startDistance,
    centerX,
    centerY
  }
}

const handleCharacterWheelScale = (event: WheelEvent): void => {
  if (!transformModeActive.value) return

  const delta = event.deltaY
  const scaleStep = event.shiftKey ? 0.08 : 0.035
  const direction = delta < 0 ? 1 : -1
  draftCharacterTransform.value = {
    x: draftCharacterTransform.value.x,
    y: draftCharacterTransform.value.y,
    scale: clamp(draftCharacterTransform.value.scale + direction * scaleStep, 0.45, 2.4)
  }
}

const loadEntityDetail = async (): Promise<void> => {
  if (!entityId.value) {
    entityDetail.value = null
    relatedEntityNameMap.value = new Map()
    return
  }

  syncingFromDetail = true
  try {
    const [detail, relatedEntities] = await Promise.all([
      worldbuildingClientService.getEntityDetail(entityId.value),
      worldId.value ? worldbuildingClientService.listEntities(worldId.value).catch(() => []) : Promise.resolve([])
    ])
    entityDetail.value = detail
    relatedEntityNameMap.value = new Map(
      relatedEntities.map((entity) => [entity.id, entity.name] as const)
    )
    syncProfileFromDetail()
    await nextTick()
    renderStage()
  } finally {
    syncingFromDetail = false
  }
}

const replaceCharacterProfileComponent = (
  components: WorldEntityComponentPayload[],
  nextComponent: WorldEntityComponentPayload<CharacterProfileData>
): WorldEntityComponentPayload[] => {
  const nextComponents = components.filter((component) => component.componentType !== nextComponent.componentType)
  nextComponents.push(nextComponent)
  return nextComponents
}

const saveProfile = async (force = false): Promise<void> => {
  if (!canSaveProfile.value || !entityDetail.value) return
  if (!force && profileAutosaveSignature.value === lastSavedProfileSignature) return
  if (savingProfile.value) {
    profileSaveQueued = true
    return
  }

  const profile = profileComponent.value
  const entityInput: UpdateWorldEntityInput = {
    entityId: entityDetail.value.entity.id,
    name: characterNameInput.value || entityDetail.value.entity.name,
    title: characterTitleInput.value,
    summary: characterSummaryInput.value
  }
  const profileInput: UpsertWorldEntityComponentInput<CharacterProfileData> = {
    entityId: entityDetail.value.entity.id,
    componentType: 'character_profile',
    schemaVersion: profile?.schemaVersion ?? 1,
    data: {
      ...toPlainIpcPayload(profile?.data ?? {}),
      title: characterTitleInput.value,
      summary: characterSummaryInput.value,
      portraitTransform: {
        offsetX: Number(((committedCharacterTransform.value.x - 0.5) * 100).toFixed(3)),
        offsetY: Number(((committedCharacterTransform.value.y - 0.58) * 100).toFixed(3)),
        scale: Number(committedCharacterTransform.value.scale.toFixed(3))
      }
    }
  }

  savingProfile.value = true
  profileSaveState.value = 'saving'
  const signatureAtSave = profileAutosaveSignature.value
  try {
    const [updatedEntity, updatedProfile] = await Promise.all([
      worldbuildingClientService.updateEntity(entityInput),
      worldbuildingClientService.upsertComponent(profileInput)
    ])

    entityDetail.value = {
      entity: updatedEntity,
      components: replaceCharacterProfileComponent(entityDetail.value.components, updatedProfile),
      relations: entityDetail.value.relations
    }
    lastSavedProfileSignature = signatureAtSave
    profileSaveState.value = 'saved'
  } catch (error) {
    profileSaveState.value = 'error'
    throw error
  } finally {
    savingProfile.value = false
    if (profileSaveQueued || profileAutosaveSignature.value !== lastSavedProfileSignature) {
      profileSaveQueued = false
      scheduleProfileAutosave(120)
    }
  }
}

const clearProfileAutosave = (): void => {
  if (profileAutosaveTimer) {
    clearTimeout(profileAutosaveTimer)
    profileAutosaveTimer = null
  }
}

const scheduleProfileAutosave = (delay = 700): void => {
  if (syncingFromDetail || !entityDetail.value) return
  clearProfileAutosave()
  if (!canSaveProfile.value || profileAutosaveSignature.value === lastSavedProfileSignature) return
  profileSaveState.value = 'idle'
  profileAutosaveTimer = setTimeout(() => {
    profileAutosaveTimer = null
    void saveProfile()
  }, delay)
}

onMounted(async () => {
  previousBodyOverflow = document.body.style.overflow
  previousHtmlOverflow = document.documentElement.style.overflow
  document.body.style.overflow = 'hidden'
  document.documentElement.style.overflow = 'hidden'
  window.addEventListener('keydown', handleTransformModeKeydown)
  window.addEventListener('mousemove', handleTransformPointerMove)
  window.addEventListener('mouseup', handleTransformPointerUp)
  await loadEntityDetail()
  await nextTick()
  renderStage()

  if (typeof ResizeObserver !== 'undefined' && stageViewportRef.value) {
    stageResizeObserver = new ResizeObserver(() => {
      renderStage()
    })
    stageResizeObserver.observe(stageViewportRef.value)
  }
})

watch(profileAutosaveSignature, () => {
  scheduleProfileAutosave()
})

watch(characterPortraitUrl, async () => {
  await nextTick()
  renderStage()
})

onBeforeUnmount(() => {
  clearProfileAutosave()
  stageResizeObserver?.disconnect()
  window.removeEventListener('keydown', handleTransformModeKeydown)
  window.removeEventListener('mousemove', handleTransformPointerMove)
  window.removeEventListener('mouseup', handleTransformPointerUp)
  document.body.style.overflow = previousBodyOverflow
  document.documentElement.style.overflow = previousHtmlOverflow
})

useKeyboardShortcut(
  {
    key: 's',
    ctrlOrMeta: true,
    preventDefault: true,
    enabled: () => canSaveProfile.value && !savingProfile.value
  },
  async () => {
    clearProfileAutosave()
    await saveProfile(true)
  }
)

useKeyboardShortcut(
  {
    key: 't',
    ctrlOrMeta: true,
    preventDefault: true,
    enabled: () => Boolean(entityDetail.value) && isCharacter.value
  },
  () => {
    if (transformModeActive.value) return
    draftCharacterTransform.value = cloneCharacterTransform(committedCharacterTransform.value)
    transformModeActive.value = true
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement) activeElement.blur()
  }
)
</script>

<style scoped>
.profile-editor-page {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  min-height: 100vh;
  padding: 0;
  box-sizing: border-box;
  background: #efefee;
  color: var(--wb-text-primary);
  overflow: hidden;
}

.editor-main {
  width: 100%;
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
}

.profile-stage {
  --dossier-panel-width: min(39vw, 560px);
  --dossier-panel-min-width: 420px;

  position: relative;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  overflow: hidden;
  border-radius: 0;
  border: 0;
  background: #d8d7d4;
  box-shadow: none;
}

.profile-stage-transforming {
  cursor: crosshair;
}

.stage-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.stage-canvas-bg {
  z-index: 0;
}

.stage-canvas-overlay {
  z-index: 2;
}

.character-layer-wrap {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.character-layer-wrap-transforming {
  z-index: 5;
}

.character-transform-layer {
  position: absolute;
  width: min(38vw, 560px);
  max-width: 38%;
  transform-origin: center center;
  pointer-events: none;
  user-select: none;
}

.character-transform-layer.transforming {
  pointer-events: auto;
  cursor: move;
}

.character-transform-layer.transforming::after {
  content: '';
  position: absolute;
  inset: -1px;
  border: 1px dashed rgba(0, 0, 0, 0.65);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.65) inset;
  pointer-events: none;
}

.character-layer-image,
.character-layer-placeholder {
  display: block;
  width: 100%;
  filter: drop-shadow(0 24px 20px rgba(0, 0, 0, 0.18));
}

.character-layer-placeholder {
  aspect-ratio: 0.72;
  border: 2px dashed rgba(0, 0, 0, 0.26);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.38);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: rgba(0, 0, 0, 0.58);
}

.placeholder-badge {
  padding: 8px 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.08);
  font-weight: 700;
  letter-spacing: 0.08em;
}

.stage-dom-layer {
  position: relative;
  z-index: 3;
  width: 100%;
  height: 100%;
  min-height: 100vh;
  padding: 0;
  box-sizing: border-box;
}

.stage-toolbar {
  position: absolute;
  top: 0;
  left: 0;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 74px;
  padding: 0 16px;
  border: 1px solid rgba(0, 0, 0, 0.22);
  border-left: 0;
  border-top: 0;
  background: rgba(42, 42, 42, 0.9);
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.16);
}

.stage-toolbar-link {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 14px;
  color: rgba(255, 255, 255, 0.95);
  text-decoration: none;
  font-weight: 600;
}

.stage-toolbar-link + .stage-toolbar-link {
  border-left: 1px solid rgba(255, 255, 255, 0.18);
}

.stage-toolbar-link-muted {
  color: rgba(255, 255, 255, 0.72);
}

.identity-panel {
  position: absolute;
  left: 64px;
  bottom: 118px;
  width: min(46vw, 760px);
}

.identity-race {
  margin-bottom: 28px;
  min-height: 48px;
  display: flex;
  align-items: center;
  color: rgba(18, 18, 18, 0.86);
  font-size: 28px;
  font-weight: 800;
}

.identity-caption {
  font-size: clamp(24px, 2.2vw, 42px);
  font-weight: 700;
  color: rgba(255, 255, 255, 0.88);
  text-shadow: 0 2px 0 rgba(0, 0, 0, 0.18);
}

.identity-name {
  margin: 6px 0 0;
  font-size: clamp(42px, 4.2vw, 72px);
  line-height: 0.96;
  font-weight: 900;
  color: rgba(255, 255, 255, 0.98);
  text-shadow:
    3px 3px 0 rgba(0, 0, 0, 0.14),
    8px 8px 0 rgba(255, 255, 255, 0.22);
}

.dossier-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: var(--dossier-panel-width);
  min-width: var(--dossier-panel-min-width);
  height: 100vh;
  box-sizing: border-box;
  background: transparent;
  color: rgba(24, 24, 24, 0.86);
  overflow: hidden;
  pointer-events: auto;
}

.dossier-static-head {
  display: grid;
  grid-template-columns: auto minmax(72px, 1fr) auto;
  align-items: center;
  gap: 14px;
  height: 64px;
  padding: 0 30px 0 20px;
  box-sizing: border-box;
  background: transparent;
  color: rgba(255, 255, 255, 0.94);
  font-size: 20px;
  font-weight: 800;
}

.dossier-static-icon {
  font-size: 24px;
}

.dossier-static-line {
  height: 1px;
  background: rgba(255, 255, 255, 0.52);
}

.dossier-static-title {
  white-space: nowrap;
}

.dossier-static-section {
  height: 36px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  box-sizing: border-box;
  background: transparent;
  color: rgba(255, 255, 255, 0.96);
  font-size: 18px;
  font-weight: 800;
}

.dossier-static-body {
  min-height: 310px;
  box-sizing: border-box;
}

.dossier-static-body-fill {
  min-height: calc(100vh - 64px - 72px - 310px);
  border-bottom: 0;
}

.dossier-basic-info-body {
  padding: 16px 22px;
  overflow: auto;
}

.basic-info-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-height: 30px;
  color: rgba(24, 24, 24, 0.86);
  font-size: 16px;
  font-weight: 800;
}

.basic-info-row.empty {
  color: rgba(24, 24, 24, 0.72);
}

.basic-info-label {
  white-space: nowrap;
}

.basic-info-value {
  word-break: break-word;
}

.transform-handle {
  position: absolute;
  width: 10px;
  height: 10px;
  border: 1px solid rgba(0, 0, 0, 0.74);
  background: rgba(255, 255, 255, 0.92);
  padding: 0;
  pointer-events: auto;
  cursor: nwse-resize;
}

.transform-handle-nw {
  top: -6px;
  left: -6px;
}

.transform-handle-ne {
  top: -6px;
  right: -6px;
}

.transform-handle-sw {
  bottom: -6px;
  left: -6px;
}

.transform-handle-se {
  right: -6px;
  bottom: -6px;
}

.fallback-panel {
  max-width: 720px;
  margin: 32px auto 0;
  padding: 26px 28px;
  border-radius: 24px;
  border: 1px solid var(--wb-panel-line);
  background: var(--wb-panel-bg);
  box-shadow: var(--wb-shadow-soft);
}

.fallback-panel h2 {
  margin: 0;
  font-size: 28px;
}

.fallback-panel p {
  margin: 14px 0 0;
  color: var(--wb-text-secondary);
  line-height: 1.75;
}

@media (max-width: 1280px) {
  .profile-stage {
    --dossier-panel-width: min(43vw, 540px);
    --dossier-panel-min-width: 360px;
  }

  .identity-panel {
    left: 40px;
    bottom: 110px;
  }
}

@media (max-width: 1024px) {
  .profile-stage {
    --dossier-panel-width: 360px;
    --dossier-panel-min-width: 360px;
  }

  .character-layer-image,
  .character-transform-layer {
    width: min(48vw, 440px);
    max-width: 48%;
  }

  .identity-panel {
    left: 36px;
    bottom: 450px;
    width: min(42vw, 360px);
  }
}

@media (max-width: 760px) {
  .profile-stage {
    --dossier-panel-width: min(76vw, 320px);
    --dossier-panel-min-width: 0px;
  }

  .stage-dom-layer {
    padding: 0;
  }

  .stage-toolbar {
    display: flex;
    flex-wrap: wrap;
    width: 100%;
    box-sizing: border-box;
  }

  .stage-toolbar-link + .stage-toolbar-link {
    border-left: 0;
  }

  .character-layer-image,
  .character-transform-layer {
    width: min(68vw, 360px);
    max-width: 68%;
  }

  .identity-panel {
    left: 24px;
    right: 24px;
    bottom: 460px;
    width: auto;
  }

  .identity-race {
    margin-bottom: 18px;
    font-size: 22px;
  }
}
</style>
