<template>
  <div ref="shellRef" class="home-canvas-shell" :class="`theme-${resolvedTheme}`">
    <div class="home-base-layer"></div>
    <canvas
      ref="sceneCanvasRef"
      class="home-canvas"
      aria-label="世界观首页"
      @pointermove="handleCanvasPointerMove"
      @pointerleave="handleCanvasPointerLeave"
      @click="handleCanvasClick"
      @dblclick="handleCanvasDoubleClick"
      @contextmenu.prevent="handleCanvasContextMenu"
    ></canvas>

    <section
      class="world-index-layer"
      :class="{ 'is-open': worldIndexCardsVisible }"
      :style="{ '--world-index-card-progress': String(worldIndexCardProgress) }"
    >
      <article
        v-for="world in sortedWorlds"
        :key="world.id"
        class="world-index-card"
        role="button"
        tabindex="0"
        @click="openWorld(world.id)"
        @keydown.enter.prevent="openWorld(world.id)"
      >
        <div class="card-dots" aria-hidden="true"></div>
        <button class="card-close" type="button" aria-label="删除世界观" @click.stop="openDeleteConfirm(world)">×</button>
        <div class="world-index-card-body">
          <h3>{{ world.name }}</h3>
          <p>{{ world.summary || DEFAULT_WORLD_SUMMARY }}</p>
          <div class="world-index-card-actions">
            <button type="button" class="card-link" @click.stop="openWorld(world.id)">Enter</button>
            <button type="button" class="card-icon" @click.stop="openEditDialog(world)">E</button>
            <button type="button" class="card-icon danger" @click.stop="openDeleteConfirm(world)">D</button>
          </div>
        </div>
      </article>
    </section>

    <teleport to="body">
      <div v-if="showWorldDialog" class="dialog-backdrop" @click.self="closeWorldDialog">
        <div class="dialog-card">
          <div class="dialog-head">
            <div>
              <div class="eyebrow">{{ isEditingWorld ? 'Edit' : 'Create' }}</div>
              <h2>{{ isEditingWorld ? '编辑世界观' : '创建世界观' }}</h2>
            </div>
            <button class="close-btn" @click="closeWorldDialog">x</button>
          </div>

          <form class="dialog-form" @submit.prevent="handleSubmitWorld">
            <label class="form-label">
              世界观名字
              <input
                v-model.trim="newWorldName"
                class="field"
                type="text"
                maxlength="120"
                placeholder="例如：北境编年史"
                autofocus
              />
            </label>

            <label class="form-label">
              一句话摘要
              <textarea
                v-model.trim="newWorldSummary"
                class="field field-area"
                maxlength="300"
                placeholder="可选，后续也能继续修改"
              />
            </label>

            <div v-if="createError" class="error-text">{{ createError }}</div>

            <div class="dialog-actions">
              <button type="button" class="ghost-btn" @click="closeWorldDialog">取消</button>
              <button class="primary-btn" :disabled="creatingWorld || !newWorldName">
                {{ creatingWorld ? (isEditingWorld ? '保存中...' : '创建中...') : (isEditingWorld ? '保存修改' : '创建并进入') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </teleport>

    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="确认删除世界观？"
      :message="deleteConfirmMessage"
      confirm-text="删除"
      cancel-text="取消"
      loading-text="删除中..."
      size="sm"
      icon="danger"
      :danger="true"
      :loading="deletingWorld"
      @confirm="handleDeleteWorld"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { WorldPayload } from '@share/cache/worldbuilding/worldbuilding'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { worldbuildingClientService } from '../services/worldbuildingClientService'
import {
  drawHomeAssistantButton,
  HOME_ASSISTANT_BUTTON
} from '../features/worldbuilding/homeCanvas/assistantButton'
import {
  drawHomeCreateButton,
  HOME_CREATE_BUTTON
} from '../features/worldbuilding/homeCanvas/createButton'
import {
  clamp,
  getClampedTextLine,
  drawRoundRectPath,
  easeOutCubic,
  setCanvasFont
} from '../features/worldbuilding/homeCanvas/drawingPrimitives'
import { getHomeCanvasStageRegion } from '../features/worldbuilding/homeCanvas/layout'
import { HOME_CANVAS_THEMES } from '../features/worldbuilding/homeCanvas/theme'
import {
  drawHomeTopBars,
  HOME_TOP_BARS
} from '../features/worldbuilding/homeCanvas/topBars'
import {
  getWorldInstanceEnterStageProgress,
  getWorldInstanceExitStageElapsedProgress,
  hasWorldInstanceEnterStageStarted,
  WORLD_INSTANCE_ENTER_ANIMATION_MS,
  WORLD_INSTANCE_ENTER_TOTAL_MS,
  WORLD_INSTANCE_EXIT_TOTAL_MS
} from '../features/worldbuilding/homeCanvas/worldInstanceAnimation'
import { getWorldFragmentPieces } from '../features/worldbuilding/homeCanvas/worldInstanceFragments'
import {
  drawWorldInstanceDotDecor,
  drawWorldInstanceLineDecor,
  getWorldInstanceSecondLayerContent,
  WORLD_INSTANCE_SECOND_LAYER
} from '../features/worldbuilding/homeCanvas/worldInstanceSecondLayer'
import type {
  HomeCanvasPalette,
  HomeCanvasStageRegion,
  HomeCanvasTarget,
  HomeCanvasTheme
} from '../features/worldbuilding/homeCanvas/types'

const router = useRouter()

const shellRef = ref<HTMLElement | null>(null)
const sceneCanvasRef = ref<HTMLCanvasElement | null>(null)
const worlds = ref<WorldPayload[]>([])
const loadingWorlds = ref(false)
const creatingWorld = ref(false)
const deletingWorld = ref(false)

const showWorldDialog = ref(false)
const editingWorldId = ref('')
const pendingDeleteWorld = ref<WorldPayload | null>(null)
const showDeleteConfirm = ref(false)
const newWorldName = ref('')
const newWorldSummary = ref('')
const createError = ref('')
const resolvedTheme = ref<HomeCanvasTheme>('light')
const worldIndexModeOpen = ref(false)
const worldIndexCardProgress = ref(0)
const worldIndexCardsVisible = computed(() => worldIndexCardProgress.value > 0.02)

let sceneWidth = 0
let sceneHeight = 0
let sceneDpr = 1
let animationFrame = 0
let sceneStartTime = performance.now()
let sceneTargets: HomeCanvasTarget[] = []
let hoverTarget: HomeCanvasTarget | null = null
let previousFrameTime = performance.now()
let resizeObserver: ResizeObserver | null = null
let themeMediaQuery: MediaQueryList | null = null
let assistantHoverProgress = 0
let createHoverProgress = 0
let topBarsHoverProgress = 0
let topBarsWaveStartTime: number | null = null
const worldIndexModeProgress = ref(0)
const worldIndexScatterProgress = ref(1)
let worldIndexOpenDelayMs = 0
let worldIndexCloseDelayMs = 0
interface WorldMorphState {
  progress: number
  phase: 'enter' | 'exit'
  exitElapsedMs: number
}

const worldMorphStates = new Map<string, WorldMorphState>()
const clampedTextCache = new Map<
  string,
  {
    font: string
    maxWidth: number
    source: string
    output: string
  }
>()
const WORLD_ENTRY_ANIMATION_SECONDS = WORLD_INSTANCE_ENTER_TOTAL_MS / 1000
const WORLD_INDEX_LINE_ANIMATION_MS = 650
const WORLD_INDEX_CONTENT_DELAY_MS = 100 // 切换卡片延时
const WORLD_INDEX_CONTENT_FADE_MS = 1000
const DEFAULT_WORLD_SUMMARY = '进入世界实例继续编辑。'
const loggedWorldFragmentStages = new Map<string, string>()

const inverseEaseOutCubic = (value: number): number =>
  1 - Math.cbrt(1 - clamp(value, 0, 1))

const getWorldReentryProgressFromExit = (exitElapsedMs: number): number => {
  const contentFadeProgress = getWorldInstanceExitStageElapsedProgress(exitElapsedMs, 'contentFade')
  if (contentFadeProgress < 1) return 1

  const fragmentGatherProgress = getWorldInstanceExitStageElapsedProgress(exitElapsedMs, 'fragmentGather')
  if (fragmentGatherProgress > 0) {
    const currentMovementProgress = 1 - easeOutCubic(fragmentGatherProgress)
    const enterFragmentProgress = inverseEaseOutCubic(currentMovementProgress)
    return clamp(
      (WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentGather * enterFragmentProgress) /
        WORLD_INSTANCE_ENTER_TOTAL_MS,
      0,
      1
    )
  }

  const cornerCutProgress = getWorldInstanceExitStageElapsedProgress(exitElapsedMs, 'cornerCut')
  if (cornerCutProgress > 0) {
    const currentCutProgress = 1 - easeOutCubic(cornerCutProgress)
    const enterCornerProgress = inverseEaseOutCubic(currentCutProgress)
    return clamp(
      (WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentGather +
        WORLD_INSTANCE_ENTER_ANIMATION_MS.cornerCut * enterCornerProgress) /
        WORLD_INSTANCE_ENTER_TOTAL_MS,
      0,
      1
    )
  }

  return 1
}

const updateWorldIndexModeAnimation = (deltaMs: number): void => {
  if (worldIndexModeOpen.value) {
    worldIndexCloseDelayMs = 0
    worldIndexModeProgress.value = clamp(
      worldIndexModeProgress.value + deltaMs / WORLD_INDEX_LINE_ANIMATION_MS,
      0,
      1
    )
    worldIndexScatterProgress.value = 1 - easeOutCubic(worldIndexModeProgress.value)

    if (worldIndexModeProgress.value >= 1) {
      worldIndexOpenDelayMs += deltaMs
      if (worldIndexOpenDelayMs >= WORLD_INDEX_CONTENT_DELAY_MS) {
        worldIndexCardProgress.value = clamp(
          worldIndexCardProgress.value + deltaMs / WORLD_INDEX_CONTENT_FADE_MS,
          0,
          1
        )
      }
    } else {
      worldIndexOpenDelayMs = 0
      worldIndexCardProgress.value = 0
    }
    return
  }

  worldIndexOpenDelayMs = 0
  worldIndexCardProgress.value = clamp(
    worldIndexCardProgress.value - deltaMs / WORLD_INDEX_CONTENT_FADE_MS,
    0,
    1
  )
  worldIndexModeProgress.value = clamp(
    worldIndexModeProgress.value - deltaMs / WORLD_INDEX_LINE_ANIMATION_MS,
    0,
    1
  )

  if (worldIndexModeProgress.value <= 0) {
    worldIndexCloseDelayMs += deltaMs
    if (worldIndexCloseDelayMs >= WORLD_INDEX_CONTENT_DELAY_MS) {
      worldIndexScatterProgress.value = clamp(
        worldIndexScatterProgress.value + deltaMs / WORLD_INDEX_CONTENT_FADE_MS,
        0,
        1
      )
    }
  } else {
    worldIndexCloseDelayMs = 0
    worldIndexScatterProgress.value = 0
  }
}

const isEditingWorld = computed(() => editingWorldId.value !== '')
const deleteConfirmMessage = computed(() =>
  pendingDeleteWorld.value
    ? `将删除世界观「${pendingDeleteWorld.value.name}」及其下所有实体、组件和关系，此操作无法撤销。`
    : '确认删除该世界观吗？'
)

const activePalette = computed(() => HOME_CANVAS_THEMES[resolvedTheme.value])
const worldLookup = computed(() => new Map(worlds.value.map((world) => [world.id, world] as const)))
const sortedWorlds = computed(() =>
  worlds.value
    .slice()
    .sort((a, b) => {
      const left = Date.parse(String((b as { updatedAt?: string; createdAt?: string }).updatedAt || (b as { createdAt?: string }).createdAt || ''))
      const right = Date.parse(String((a as { updatedAt?: string; createdAt?: string }).updatedAt || (a as { createdAt?: string }).createdAt || ''))
      return (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0)
    })
)
const recentWorlds = computed(() =>
  sortedWorlds.value
    .slice(0, 3)
)

const loadWorlds = async (): Promise<void> => {
  loadingWorlds.value = true
  try {
    worlds.value = await worldbuildingClientService.listWorlds()
  } finally {
    loadingWorlds.value = false
  }
}

const resetWorldForm = (): void => {
  editingWorldId.value = ''
  newWorldName.value = ''
  newWorldSummary.value = ''
  createError.value = ''
}

const openCreateDialog = (): void => {
  resetWorldForm()
  showWorldDialog.value = true
  createError.value = ''
}

const closeWorldDialog = (): void => {
  showWorldDialog.value = false
  creatingWorld.value = false
  resetWorldForm()
}

const openWorld = async (worldId: string): Promise<void> => {
  await router.push({ name: 'WorldEditor', params: { worldId } })
}

const openEditDialog = (world: WorldPayload): void => {
  editingWorldId.value = world.id
  newWorldName.value = world.name
  newWorldSummary.value = world.summary || ''
  createError.value = ''
  showWorldDialog.value = true
}

const openDeleteConfirm = (world: WorldPayload): void => {
  pendingDeleteWorld.value = world
  showDeleteConfirm.value = true
}

const handleSubmitWorld = async (): Promise<void> => {
  const name = newWorldName.value.trim()
  if (!name) return

  creatingWorld.value = true
  createError.value = ''

  try {
    if (isEditingWorld.value) {
      await worldbuildingClientService.updateWorld({
        worldId: editingWorldId.value,
        name,
        summary: newWorldSummary.value.trim()
      })
      closeWorldDialog()
      await loadWorlds()
      return
    }

    const created = await worldbuildingClientService.createWorld({
      name,
      summary: newWorldSummary.value.trim()
    })
    closeWorldDialog()
    await loadWorlds()
    await router.push({ name: 'WorldEditor', params: { worldId: created.id } })
  } catch (error) {
    createError.value = error instanceof Error ? error.message : String(error)
    creatingWorld.value = false
  }
}

const handleDeleteWorld = async (): Promise<void> => {
  if (!pendingDeleteWorld.value || deletingWorld.value) return
  deletingWorld.value = true
  try {
    await worldbuildingClientService.deleteWorld(pendingDeleteWorld.value.id)
    pendingDeleteWorld.value = null
    showDeleteConfirm.value = false
    await loadWorlds()
  } finally {
    deletingWorld.value = false
  }
}

const detectTheme = (): HomeCanvasTheme => {
  const root = document.documentElement
  const body = document.body
  const explicit =
    root.dataset.theme ||
    body.dataset.theme ||
    root.getAttribute('data-color-scheme') ||
    body.getAttribute('data-color-scheme')
  if (explicit === 'dark' || root.classList.contains('dark') || body.classList.contains('dark')) return 'dark'
  if (explicit === 'light' || root.classList.contains('light') || body.classList.contains('light')) return 'light'
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const syncTheme = (): void => {
  resolvedTheme.value = detectTheme()
}

const addThemeListener = (): void => {
  if (!themeMediaQuery) return
  const legacyMediaQuery = themeMediaQuery as MediaQueryList & {
    addListener?: (listener: () => void) => void
    removeListener?: (listener: () => void) => void
  }
  if (typeof legacyMediaQuery.addEventListener === 'function') {
    legacyMediaQuery.addEventListener('change', syncTheme)
    return
  }
  legacyMediaQuery.addListener?.(syncTheme)
}

const removeThemeListener = (): void => {
  if (!themeMediaQuery) return
  const legacyMediaQuery = themeMediaQuery as MediaQueryList & {
    addListener?: (listener: () => void) => void
    removeListener?: (listener: () => void) => void
  }
  if (typeof legacyMediaQuery.removeEventListener === 'function') {
    legacyMediaQuery.removeEventListener('change', syncTheme)
    return
  }
  legacyMediaQuery.removeListener?.(syncTheme)
}

const resizeCanvas = (): void => {
  const canvas = sceneCanvasRef.value
  const shell = shellRef.value
  if (!canvas || !shell) return
  const rect = shell.getBoundingClientRect()
  const nextWidth = Math.max(1, rect.width)
  const nextHeight = Math.max(1, rect.height)
  const nextDpr = Math.min(window.devicePixelRatio || 1, 2)
  const nextCanvasWidth = Math.floor(nextWidth * nextDpr)
  const nextCanvasHeight = Math.floor(nextHeight * nextDpr)
  if (
    canvas.width === nextCanvasWidth &&
    canvas.height === nextCanvasHeight &&
    sceneWidth === nextWidth &&
    sceneHeight === nextHeight &&
    sceneDpr === nextDpr
  ) {
    return
  }
  sceneWidth = nextWidth
  sceneHeight = nextHeight
  sceneDpr = nextDpr
  canvas.width = nextCanvasWidth
  canvas.height = nextCanvasHeight
  canvas.style.width = `${sceneWidth}px`
  canvas.style.height = `${sceneHeight}px`
}

const rectContains = (target: HomeCanvasTarget, x: number, y: number): boolean =>
  x >= target.rect.x &&
  x <= target.rect.x + target.rect.w &&
  y >= target.rect.y &&
  y <= target.rect.y + target.rect.h

const getPointerPosition = (event: PointerEvent | MouseEvent): { x: number; y: number } => {
  const canvas = sceneCanvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  }
}

const findTargetAt = (x: number, y: number): HomeCanvasTarget | null => {
  for (let index = sceneTargets.length - 1; index >= 0; index -= 1) {
    const target = sceneTargets[index]
    if (rectContains(target, x, y)) return target
  }
  return null
}

const setCanvasCursor = (): void => {
  const canvas = sceneCanvasRef.value
  if (!canvas) return
  canvas.style.cursor = hoverTarget ? 'pointer' : 'default'
}

const handleCanvasPointerMove = (event: PointerEvent): void => {
  const point = getPointerPosition(event)
  hoverTarget = findTargetAt(point.x, point.y)
  setCanvasCursor()
}

const handleCanvasPointerLeave = (): void => {
  hoverTarget = null
  setCanvasCursor()
}

const findWorldById = (id: string | undefined): WorldPayload | null =>
  id ? worldLookup.value.get(id) ?? null : null

const getCachedClampedText = (
  ctx: CanvasRenderingContext2D,
  cacheKey: string,
  text: string,
  maxWidth: number
): string => {
  const source = String(text ?? '')
  const normalizedWidth = Math.max(0, Math.round(maxWidth))
  const cached = clampedTextCache.get(cacheKey)
  if (
    cached &&
    cached.font === ctx.font &&
    cached.maxWidth === normalizedWidth &&
    cached.source === source
  ) {
    return cached.output
  }

  const output = getClampedTextLine(ctx, source, maxWidth)
  if (clampedTextCache.size >= 64 && !clampedTextCache.has(cacheKey)) {
    clampedTextCache.clear()
  }
  clampedTextCache.set(cacheKey, {
    font: ctx.font,
    maxWidth: normalizedWidth,
    source,
    output
  })
  return output
}

const handleCanvasClick = async (event: MouseEvent): Promise<void> => {
  const point = getPointerPosition(event)
  const target = findTargetAt(point.x, point.y)
  if (!target) return
  if (target.kind === 'create') {
    openCreateDialog()
    return
  }
  if (target.kind === 'assistant') {
    await router.push({ name: 'AIChat' })
    return
  }
  if (target.kind === 'topBars') {
    worldIndexModeOpen.value = !worldIndexModeOpen.value
    topBarsWaveStartTime = performance.now() - sceneStartTime
    return
  }
  if (target.kind === 'world' && target.id) {
    await openWorld(target.id)
  }
}

const handleCanvasDoubleClick = (event: MouseEvent): void => {
  const point = getPointerPosition(event)
  const target = findTargetAt(point.x, point.y)
  if (target?.kind !== 'world') return
  const world = findWorldById(target.id)
  if (world) openEditDialog(world)
}

const handleCanvasContextMenu = (event: MouseEvent): void => {
  const point = getPointerPosition(event)
  const target = findTargetAt(point.x, point.y)
  if (target?.kind !== 'world') return
  const world = findWorldById(target.id)
  if (world) openDeleteConfirm(world)
}

const getStageRegion = (): HomeCanvasStageRegion => getHomeCanvasStageRegion(sceneWidth, sceneHeight)

const drawBackground = (
  ctx: CanvasRenderingContext2D,
  palette: HomeCanvasPalette,
  indexModeProgress: number
): void => {
  const stage = getStageRegion()
  const indexEase = easeOutCubic(indexModeProgress)
  const guideY = stage.guideY + (sceneHeight * 0.105 - stage.guideY) * indexEase
  const diagonalStartX = sceneWidth * (0.41 + 0.28 * indexEase)
  const diagonalEndX = sceneWidth * (0.92 + 0.05 * indexEase)
  ctx.fillStyle = palette.base
  ctx.fillRect(0, 0, sceneWidth, sceneHeight)

  const radial = ctx.createRadialGradient(
    sceneWidth * 0.52,
    sceneHeight * 0.54,
    sceneHeight * 0.05,
    sceneWidth * 0.52,
    sceneHeight * 0.54,
    sceneWidth * 0.68
  )
  radial.addColorStop(0, palette.mist)
  radial.addColorStop(1, palette.vignette)
  ctx.fillStyle = radial
  ctx.fillRect(0, 0, sceneWidth, sceneHeight)

  ctx.save()
  ctx.strokeStyle = palette.hairline
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(stage.left, 0)
  ctx.lineTo(stage.left, sceneHeight)
  ctx.moveTo(stage.left, guideY)
  ctx.lineTo(sceneWidth, guideY)
  ctx.moveTo(diagonalStartX, sceneHeight * 0.67)
  ctx.lineTo(diagonalEndX, sceneHeight * 0.18)
  ctx.stroke()
  ctx.restore()
}

const drawTechnicalDecor = (
  ctx: CanvasRenderingContext2D,
  palette: HomeCanvasPalette,
  time: number
): void => {
  ctx.save()
  ctx.strokeStyle = palette.line
  ctx.fillStyle = palette.dot
  ctx.lineWidth = 1

  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      ctx.globalAlpha = 0.42 + Math.sin(time * 0.001 + row + col) * 0.1
      ctx.beginPath()
      ctx.arc(22 + col * 11, 18 + row * 11, 1.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.globalAlpha = 0.9
  const leftX = 44
  const leftY = sceneHeight * 0.19
  ctx.beginPath()
  ctx.arc(leftX, leftY, 22, 0, Math.PI * 2)
  ctx.arc(leftX, leftY, 17, 0.2, Math.PI * 1.75)
  ctx.arc(leftX, leftY, 11, Math.PI * 0.3, Math.PI * 1.9)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(leftX, leftY + 46, 3, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(leftX, leftY + 49)
  ctx.lineTo(leftX, leftY + 180)
  ctx.stroke()
  for (const offset of [86, 132]) {
    ctx.beginPath()
    ctx.arc(leftX, leftY + offset, 2, 0, Math.PI * 2)
    ctx.fill()
  }

  ctx.globalAlpha = 0.62
  for (let index = 0; index < 3; index += 1) {
    ctx.beginPath()
    ctx.arc(18 + index * 22, sceneHeight - 40, 7, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillRect(72, sceneHeight - 40, 32, 1)

  ctx.restore()
}

const getWorldLayout = (): HomeCanvasTarget[] => {
  const visibleWorlds = recentWorlds.value
  const count = Math.max(visibleWorlds.length, 1)
  const stage = getStageRegion()
  const baseW = clamp(stage.width * 0.15, 170, 270)
  const baseH = clamp(sceneHeight * 0.22, 135, 200)
  const cardWidthBoost = 1.18
  const centerWidthBoost = 1.16
  const centerScale = 1.18 * 1.2
  const centerWidthExtraScale = 1.05  // 高度倍率
  const centerHeightExtraScale = 1.03 // 宽度倍率
  const sideScale = 0.95 * 1.1
  const sizeForIndex = (index: number): { w: number; h: number } => {
    if (visibleWorlds.length >= 3 && index === 1) {
      return {
        w: baseW * centerScale * cardWidthBoost * centerWidthBoost * centerWidthExtraScale,
        h: baseH * centerScale * centerHeightExtraScale
      }
    }
    return { w: baseW * sideScale * cardWidthBoost, h: baseH * sideScale }
  }
  const sizes = visibleWorlds.map((_, index) => sizeForIndex(index))
  const centerY = stage.guideY
  const gap = clamp(stage.width * 0.08, 91, 156)
  const groupWidth = sizes.reduce((sum, size) => sum + size.w, 0) + Math.max(0, count - 1) * gap
  const startX = stage.centerX - groupWidth / 2
  let cursorX = startX

  return visibleWorlds.map((world, index) => {
    const size = sizes[index]
    const x = cursorX
    const y = centerY - size.h / 2
    cursorX += size.w + gap
    return {
      kind: 'world',
      id: world.id,
      rect: { x, y, w: size.w, h: size.h }
    }
  })
}

const applyWorldFragmentFill = (
  ctx: CanvasRenderingContext2D,
  palette: HomeCanvasPalette,
  alpha = 1
): void => {
  ctx.fillStyle = palette.fragmentRgba
  ctx.globalAlpha = 0.64 * alpha
}

const getWorldFragmentDebugStage = (
  progress: number,
  isExiting: boolean,
  exitElapsedMs = 0
): string | null => {
  if (progress <= 0) return null

  if (isExiting) {
    if (getWorldInstanceExitStageElapsedProgress(exitElapsedMs, 'fragmentGather') > 0) return 'exit:fragmentGather'
    if (getWorldInstanceExitStageElapsedProgress(exitElapsedMs, 'cornerCut') > 0) return 'exit:cornerCut'
    if (getWorldInstanceExitStageElapsedProgress(exitElapsedMs, 'contentFade') > 0) return 'exit:contentFade'
    return 'exit:pending'
  }

  if (hasWorldInstanceEnterStageStarted(progress, 'enterFade')) return 'enter:enterFade'
  if (hasWorldInstanceEnterStageStarted(progress, 'textFade')) return 'enter:textFade'
  if (hasWorldInstanceEnterStageStarted(progress, 'lineFade')) return 'enter:lineFade'
  if (hasWorldInstanceEnterStageStarted(progress, 'dotFade')) return 'enter:dotFade'
  if (hasWorldInstanceEnterStageStarted(progress, 'brighten')) return 'enter:brighten'
  if (hasWorldInstanceEnterStageStarted(progress, 'cornerCut')) return 'enter:cornerCut'
  return 'enter:fragmentGather'
}

const logWorldFragmentRgbaStage = (
  target: HomeCanvasTarget,
  palette: HomeCanvasPalette,
  progress: number,
  movementProgress: number,
  index: number,
  isExiting: boolean,
  exitElapsedMs = 0
): void => {
  const logId = `${target.id}:${index}`
  const stage = getWorldFragmentDebugStage(progress, isExiting, exitElapsedMs)

  if (!stage) {
    loggedWorldFragmentStages.delete(logId)
    return
  }

  if (loggedWorldFragmentStages.get(logId) === stage) return
  loggedWorldFragmentStages.set(logId, stage)
  console.info('[homeCanvas] fragmentRgba stage', {
    worldId: target.id,
    index,
    stage,
    fragmentRgba: palette.fragmentRgba,
    progress,
    movementProgress
  })
}

const drawFragmentedWorld = (
  ctx: CanvasRenderingContext2D,
  palette: HomeCanvasPalette,
  target: HomeCanvasTarget,
  world: WorldPayload,
  hoverProgress: number,
  time: number,
  index: number,
  isExiting: boolean,
  exitElapsedMs: number,
  layerAlpha = 1
): void => {
  const { x, y, w, h } = target.rect
  const pieces = getWorldFragmentPieces(index)
  const exitFragmentProgress = isExiting
    ? getWorldInstanceExitStageElapsedProgress(exitElapsedMs, 'fragmentGather')
    : 0
  const movementProgress = isExiting
    ? 1 - easeOutCubic(exitFragmentProgress)
    : easeOutCubic(getWorldInstanceEnterStageProgress(hoverProgress, 'fragmentGather'))
  const panelStarted = isExiting
    ? exitFragmentProgress <= 0
    : hasWorldInstanceEnterStageStarted(hoverProgress, 'cornerCut')
  logWorldFragmentRgbaStage(
    target,
    palette,
    hoverProgress,
    movementProgress,
    index,
    isExiting,
    exitElapsedMs
  )
  const pieceFade = (isExiting ? (exitFragmentProgress > 0 ? 1 : 0) : panelStarted ? 0 : 1) * layerAlpha
  const seamOverlapFadeStart = 0.82
  const seamOverlapFadeOut = 1 - easeOutCubic(
    clamp((movementProgress - seamOverlapFadeStart) / (1 - seamOverlapFadeStart), 0, 1)
  )
  const seamOverlap = 2.4 * movementProgress * seamOverlapFadeOut
  const pieceRadius = 3 * (1 - movementProgress)
  const drawPieces = (passAlpha: number): void => {
    if (passAlpha <= 0) return

    ctx.save()
    for (const [pieceIndex, piece] of pieces.entries()) {
      const drift = Math.sin(time * 0.0014 + index * 1.8 + pieceIndex) * 5
      const float = Math.cos(time * 0.001 + pieceIndex * 2.2) * 4
      const px =
        x +
        piece.x * w +
        piece.dx * (1 - movementProgress) +
        drift * (1 - movementProgress) -
        seamOverlap / 2
      const py =
        y +
        piece.y * h +
        piece.dy * (1 - movementProgress) +
        float * (1 - movementProgress) -
        seamOverlap / 2
      const pw = piece.w * w + seamOverlap
      const ph = piece.h * h + seamOverlap
      drawRoundRectPath(ctx, px, py, pw, ph, pieceRadius)
      applyWorldFragmentFill(ctx, palette, passAlpha)
      ctx.fill()
    }

    ctx.restore()
  }

  ctx.save()
  drawPieces(pieceFade)

  ctx.globalAlpha = (0.16 + movementProgress * 0.5) * layerAlpha
  ctx.strokeStyle = palette.line

  if (panelStarted) {
    drawMergedWorldCard(ctx, palette, target, world, hoverProgress, isExiting, exitElapsedMs, layerAlpha)
  }
  ctx.restore()
}

const drawMergedWorldCardShapePath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cutProgress = 1
): void => {
  const cutX = clamp(Math.min(w, h) * 0.12, 16, 42) * cutProgress
  const cutY = clamp(Math.min(w, h) * 0.075, 10, 28) * cutProgress
  const radius = clamp(Math.min(w, h) * 0.035, 4, 10)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - cutX, y)
  if (cutX > 0 || cutY > 0) {
    ctx.lineTo(x + w, y + cutY)
  } else {
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  }
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + cutX, y + h)
  if (cutX > 0 || cutY > 0) {
    ctx.lineTo(x, y + h - cutY)
  } else {
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  }
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

const strokeMergedWorldCardShapeProgress = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  cutProgress: number,
  drawProgress: number
): void => {
  const estimatedLength = (w + h) * 2.15
  ctx.save()
  ctx.setLineDash([estimatedLength * clamp(drawProgress, 0, 1), estimatedLength])
  ctx.lineDashOffset = 0
  drawMergedWorldCardShapePath(ctx, x, y, w, h, cutProgress)
  ctx.stroke()
  ctx.restore()
}

const drawMergedWorldCard = (
  ctx: CanvasRenderingContext2D,
  palette: HomeCanvasPalette,
  target: HomeCanvasTarget,
  world: WorldPayload,
  revealProgress: number,
  isExiting: boolean,
  exitElapsedMs: number,
  layerAlpha = 1
): void => {
  if (revealProgress <= 0) return

  const { x, y, w, h } = target.rect
  const { contentX, contentW, titleY, summaryY, enterY } = getWorldInstanceSecondLayerContent(x, y, w, h)
  const exitContentProgress = isExiting
    ? getWorldInstanceExitStageElapsedProgress(exitElapsedMs, 'contentFade')
    : 0
  const exitCornerProgress = isExiting
    ? getWorldInstanceExitStageElapsedProgress(exitElapsedMs, 'cornerCut')
    : 0
  const contentExitAlpha = (isExiting
    ? 1 - easeOutCubic(exitContentProgress)
    : 1) * layerAlpha
  const panelAlpha = layerAlpha
  const cutProgress = isExiting
    ? 1 - easeOutCubic(exitCornerProgress)
    : easeOutCubic(getWorldInstanceEnterStageProgress(revealProgress, 'cornerCut'))
  const enterBrightnessProgress = easeOutCubic(
    getWorldInstanceEnterStageProgress(revealProgress, 'brighten')
  )
  const secondLayerProgress = easeOutCubic(getWorldInstanceEnterStageProgress(revealProgress, 'dotFade'))
  const secondLayerAlpha = secondLayerProgress * contentExitAlpha
  const brightnessProgress = enterBrightnessProgress * contentExitAlpha
  const dotProgress = secondLayerProgress
  const lineProgress = secondLayerProgress
  const dotAlpha = secondLayerAlpha
  const lineAlpha = secondLayerAlpha
  const infoAlpha = secondLayerAlpha
  const enterAlpha = secondLayerAlpha
  const shadowAlpha =
    easeOutCubic(getWorldInstanceEnterStageProgress(revealProgress, 'shadowFade')) *
    contentExitAlpha
  const finalPanelColor = resolvedTheme.value === 'dark' ? 'rgb(72, 74, 76)' : 'rgb(246, 246, 246)'

  ctx.save()

  if (shadowAlpha > 0) {
    drawMergedWorldCardShapePath(ctx, x, y, w, h, cutProgress)
    ctx.globalAlpha = shadowAlpha * 0.9
    ctx.fillStyle = resolvedTheme.value === 'dark' ? 'rgba(92, 94, 96, 0.18)' : 'rgba(248, 248, 246, 0.38)'
    ctx.shadowColor = resolvedTheme.value === 'dark' ? 'rgba(0,0,0,0.66)' : 'rgba(28,32,36,0.42)'
    ctx.shadowBlur = 44
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 30
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
  }

  drawMergedWorldCardShapePath(ctx, x, y, w, h, cutProgress)
  applyWorldFragmentFill(ctx, palette, panelAlpha)
  ctx.fill()
  if (brightnessProgress > 0) {
    drawMergedWorldCardShapePath(ctx, x, y, w, h, cutProgress)
    ctx.fillStyle = finalPanelColor
    ctx.globalAlpha = panelAlpha * brightnessProgress
    ctx.fill()
  }
  ctx.strokeStyle = palette.hairline
  ctx.globalAlpha = panelAlpha * contentExitAlpha * 0.8
  strokeMergedWorldCardShapeProgress(ctx, x, y, w, h, cutProgress, secondLayerProgress)

  if (dotAlpha > 0 || lineAlpha > 0) {
    ctx.save()
    drawMergedWorldCardShapePath(ctx, x, y, w, h, 1)
    ctx.clip()
    if (dotAlpha > 0) drawWorldInstanceDotDecor(ctx, palette, x, y, w, h, dotAlpha, dotProgress)
    if (lineAlpha > 0) {
      drawWorldInstanceLineDecor(ctx, palette, resolvedTheme.value, x, y, w, h, lineAlpha, lineProgress)
    }
    ctx.restore()
  }

  if (infoAlpha > 0) {
    ctx.globalAlpha = infoAlpha
    setCanvasFont(ctx, clamp(w * 0.06, 18, 30), 800)
    ctx.fillStyle = palette.ink
    ctx.fillText(
      getCachedClampedText(ctx, `${world.id}:name`, world.name, contentW),
      contentX,
      titleY
    )

    setCanvasFont(ctx, clamp(w * 0.032, 11, 14), 500)
    ctx.fillStyle = palette.muted
    ctx.fillText(
      getCachedClampedText(
        ctx,
        `${world.id}:summary`,
        world.summary || DEFAULT_WORLD_SUMMARY,
        contentW
      ),
      contentX,
      summaryY
    )
  }

  if (enterAlpha > 0) {
    const underlineEndX = contentX + contentW * WORLD_INSTANCE_SECOND_LAYER.enter.underlineWidth
    const enterClipWidth = contentW * WORLD_INSTANCE_SECOND_LAYER.enter.clipWidth * enterAlpha
    const enterUnderlineY = enterY + WORLD_INSTANCE_SECOND_LAYER.enter.underlineYOffset
    const arrowY = enterY + WORLD_INSTANCE_SECOND_LAYER.enter.arrowYOffset
    const arrowEndX = underlineEndX
    const arrowStartX = arrowEndX - contentW * WORLD_INSTANCE_SECOND_LAYER.enter.arrowLength
    ctx.strokeStyle = palette.ink
    ctx.lineWidth = 1
    ctx.globalAlpha = enterAlpha * 0.72
    ctx.beginPath()
    ctx.moveTo(contentX, enterUnderlineY)
    ctx.lineTo(contentX + (underlineEndX - contentX) * enterAlpha, enterUnderlineY)
    ctx.stroke()

    setCanvasFont(ctx, clamp(w * 0.038, 13, 16), 650)
    ctx.save()
    ctx.beginPath()
    ctx.rect(contentX, enterY - 22, enterClipWidth, 40)
    ctx.clip()
    ctx.globalAlpha = enterAlpha
    ctx.fillStyle = palette.ink
    ctx.fillText('Enter', contentX, enterY)
    ctx.strokeStyle = palette.ink
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(arrowStartX, arrowY)
    ctx.lineTo(arrowEndX, arrowY)
    ctx.lineTo(arrowEndX - 4, arrowY - 4)
    ctx.moveTo(arrowEndX, arrowY)
    ctx.lineTo(arrowEndX - 4, arrowY + 4)
    ctx.stroke()
    ctx.restore()
  }

  if (dotAlpha > 0) {
    const sideDots = WORLD_INSTANCE_SECOND_LAYER.sideDots
    ctx.fillStyle = palette.dot
    ctx.globalAlpha = dotAlpha * sideDots.alpha
    const dotX = x + w - clamp(w * sideDots.xFromRight, 16, 32)
    const dotY = y + h * sideDots.y
    for (let index = 0; index < sideDots.count; index += 1) {
      ctx.beginPath()
      ctx.arc(dotX, dotY + index * sideDots.gap, index === 0 ? 1.7 : 1.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.restore()
}

const drawEmptyWorldPreview = (
  ctx: CanvasRenderingContext2D,
  palette: HomeCanvasPalette,
  time: number,
  layerAlpha = 1
): void => {
  const stage = getStageRegion()
  const w = clamp(sceneWidth * 0.28, 260, 420)
  const h = clamp(sceneHeight * 0.24, 150, 220)
  const x = stage.centerX - w / 2
  const y = sceneHeight * 0.41 - h / 2
  ctx.save()
  ctx.globalAlpha = (0.54 + Math.sin(time * 0.002) * 0.08) * layerAlpha
  drawRoundRectPath(ctx, x, y, w, h, 4)
  ctx.fillStyle = palette.fragmentRgba
  ctx.fill()
  ctx.strokeStyle = palette.hairline
  ctx.stroke()
  setCanvasFont(ctx, 16, 600)
  ctx.fillStyle = palette.muted
  ctx.textAlign = 'center'
  ctx.fillText('等待一个世界观实例', x + w / 2, y + h / 2 + 5)
  ctx.restore()
  ctx.textAlign = 'left'
}

const drawCreateButton = (
  ctx: CanvasRenderingContext2D,
  palette: HomeCanvasPalette,
  time: number,
  deltaSeconds: number
): HomeCanvasTarget => {
  const stage = getStageRegion()
  const radius = clamp(Math.min(sceneWidth, sceneHeight) * 0.09, 54, 96)
  const x = stage.centerX
  const y = sceneHeight * 0.83
  const isHover = hoverTarget?.kind === 'create'
  createHoverProgress = clamp(
    createHoverProgress +
      (isHover ? 1 : -1) * deltaSeconds * HOME_CREATE_BUTTON.hover.progressSpeed,
    0,
    1
  )
  setCanvasFont(ctx, 14, 700)
  return drawHomeCreateButton(
    ctx,
    palette,
    resolvedTheme.value,
    x,
    y,
    radius,
    time,
    createHoverProgress
  )
}

const drawScene = (): void => {
  const canvas = sceneCanvasRef.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return

  const now = performance.now()
  const deltaMs = Math.min(50, now - previousFrameTime)
  const deltaSeconds = deltaMs / 1000
  previousFrameTime = now
  const time = now - sceneStartTime
  const palette = activePalette.value
  updateWorldIndexModeAnimation(deltaMs)
  const scatteredWorldAlpha = easeOutCubic(worldIndexScatterProgress.value)
  ctx.setTransform(sceneDpr, 0, 0, sceneDpr, 0, 0)
  ctx.clearRect(0, 0, sceneWidth, sceneHeight)
  sceneTargets = []

  drawBackground(ctx, palette, worldIndexModeProgress.value)
  drawTechnicalDecor(ctx, palette, time)

  setCanvasFont(ctx, 12, 500)
  ctx.fillStyle = palette.muted
  ctx.fillText('WORLD INDEX', getStageRegion().left + sceneWidth * 0.025, sceneHeight * 0.05)

  const topBarsIsHover = hoverTarget?.kind === 'topBars'
  topBarsHoverProgress = clamp(
    topBarsHoverProgress + (topBarsIsHover ? 1 : -1) * deltaSeconds * 5.5,
    0,
    1
  )
  const topBarsWaveProgress =
    topBarsWaveStartTime === null
      ? 0
      : clamp((time - topBarsWaveStartTime) / HOME_TOP_BARS.waveDuration, 0, 1)
  if (topBarsWaveStartTime !== null && topBarsWaveProgress >= 1) {
    topBarsWaveStartTime = null
  }
  const topBarsTarget = drawHomeTopBars(
    ctx,
    palette,
    sceneWidth,
    time,
    topBarsHoverProgress,
    topBarsWaveProgress
  )
  sceneTargets.push(topBarsTarget)

  const worldTargets = getWorldLayout()
  sceneTargets.push(...worldTargets)
  ctx.save()
  if (worldTargets.length) {
    const activeIds = new Set(worldTargets.map((target) => target.id).filter(Boolean) as string[])
    for (const key of Array.from(worldMorphStates.keys())) {
      if (!activeIds.has(key)) worldMorphStates.delete(key)
    }
    worldTargets.forEach((target, index) => {
      const world = findWorldById(target.id)
      if (!world) return
      const currentHover = hoverTarget
      const hovered =
        currentHover !== null &&
        currentHover.id === target.id &&
        currentHover.kind === 'world'
      const previous = worldMorphStates.get(world.id)

      if (hovered) {
        const previousProgress =
          previous?.phase === 'exit'
            ? getWorldReentryProgressFromExit(previous.exitElapsedMs)
            : previous?.progress ?? 0
        const progress = clamp(
          previousProgress + deltaSeconds / WORLD_ENTRY_ANIMATION_SECONDS,
          0,
          1
        )
        const state: WorldMorphState = { progress, phase: 'enter', exitElapsedMs: 0 }
        worldMorphStates.set(world.id, state)
        drawFragmentedWorld(
          ctx,
          palette,
          target,
          world,
          state.progress,
          time,
          index,
          false,
          0,
          scatteredWorldAlpha
        )
        return
      }

      if (!previous || previous.progress <= 0) {
        worldMorphStates.delete(world.id)
        drawFragmentedWorld(ctx, palette, target, world, 0, time, index, false, 0, scatteredWorldAlpha)
        return
      }

      if (!hasWorldInstanceEnterStageStarted(previous.progress, 'cornerCut')) {
        const progress = clamp(previous.progress - deltaSeconds / WORLD_ENTRY_ANIMATION_SECONDS, 0, 1)
        if (progress <= 0) {
          worldMorphStates.delete(world.id)
        } else {
          worldMorphStates.set(world.id, { progress, phase: 'enter', exitElapsedMs: 0 })
        }
        drawFragmentedWorld(ctx, palette, target, world, progress, time, index, false, 0, scatteredWorldAlpha)
        return
      }

      const exitElapsedMs =
        previous.phase === 'exit'
          ? Math.min(WORLD_INSTANCE_EXIT_TOTAL_MS, previous.exitElapsedMs + deltaMs)
          : deltaMs

      if (exitElapsedMs >= WORLD_INSTANCE_EXIT_TOTAL_MS) {
        worldMorphStates.delete(world.id)
        drawFragmentedWorld(ctx, palette, target, world, 0, time, index, false, 0, scatteredWorldAlpha)
        return
      }

      const state: WorldMorphState = {
        progress: previous.progress,
        phase: 'exit',
        exitElapsedMs
      }
      worldMorphStates.set(world.id, state)
      drawFragmentedWorld(
        ctx,
        palette,
        target,
        world,
        state.progress,
        time,
        index,
        true,
        state.exitElapsedMs,
        scatteredWorldAlpha
      )
    })
  } else if (!loadingWorlds.value) {
    drawEmptyWorldPreview(ctx, palette, time, scatteredWorldAlpha)
  }
  ctx.restore()

  const createTarget = drawCreateButton(ctx, palette, time, deltaSeconds)
  sceneTargets.push(createTarget)

  const assistantIsHover = hoverTarget?.kind === 'assistant'
  assistantHoverProgress = clamp(
    assistantHoverProgress +
      (assistantIsHover ? 1 : -1) *
        deltaSeconds *
        HOME_ASSISTANT_BUTTON.hover.progressSpeed,
    0,
    1
  )
  const assistantTarget = drawHomeAssistantButton(
    ctx,
    palette,
    sceneWidth - HOME_ASSISTANT_BUTTON.size - 16,
    8,
    time,
    assistantHoverProgress
  )
  sceneTargets.push(assistantTarget)

  if (loadingWorlds.value) {
    ctx.save()
    setCanvasFont(ctx, 13, 600)
    ctx.fillStyle = palette.muted
    ctx.textAlign = 'center'
    ctx.fillText('正在读取世界观实例', sceneWidth / 2, sceneHeight * 0.45)
    ctx.restore()
  }

  animationFrame = window.requestAnimationFrame(drawScene)
}

const startSceneAnimation = (): void => {
  if (animationFrame) window.cancelAnimationFrame(animationFrame)
  previousFrameTime = performance.now()
  animationFrame = window.requestAnimationFrame(drawScene)
}

watch(
  worlds,
  () => {
    hoverTarget = null
    clampedTextCache.clear()
    setCanvasCursor()
  }
)

onMounted(async () => {
  syncTheme()
  themeMediaQuery = window.matchMedia?.('(prefers-color-scheme: dark)') ?? null
  addThemeListener()

  await nextTick()
  resizeCanvas()
  resizeObserver = new ResizeObserver(resizeCanvas)
  if (shellRef.value) resizeObserver.observe(shellRef.value)

  sceneStartTime = performance.now()
  startSceneAnimation()
  await loadWorlds()
})

onBeforeUnmount(() => {
  if (animationFrame) window.cancelAnimationFrame(animationFrame)
  animationFrame = 0
  resizeObserver?.disconnect()
  removeThemeListener()
  clampedTextCache.clear()
  worldMorphStates.clear()
})
</script>

<style scoped>
.home-canvas-shell {
  --home-dialog-bg: #ffffff;
  --home-dialog-border: rgba(20, 24, 30, 0.12);
  --home-dialog-text: #12161d;
  --home-dialog-muted: #707782;
  --home-field-bg: rgba(248, 248, 246, 0.94);
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  color: var(--home-dialog-text);
}

.home-canvas-shell.theme-dark {
  --home-dialog-bg: #18191a;
  --home-dialog-border: rgba(255, 255, 255, 0.12);
  --home-dialog-text: #f1f2f2;
  --home-dialog-muted: #a4a8ad;
  --home-field-bg: rgba(255, 255, 255, 0.06);
}

.home-base-layer,
.home-canvas {
  position: absolute;
  inset: 0;
}

.home-base-layer {
  background:
    radial-gradient(circle at 50% 52%, rgba(255, 255, 255, 0.72), transparent 38%),
    linear-gradient(180deg, #f8f8f6 0%, #ececea 100%);
}

.theme-dark .home-base-layer {
  background:
    radial-gradient(circle at 50% 52%, rgba(255, 255, 255, 0.05), transparent 38%),
    linear-gradient(180deg, #111213 0%, #0c0d0e 100%);
}

.home-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.world-index-layer {
  --world-index-card-progress: 0;
  position: absolute;
  z-index: 3;
  top: 92px;
  right: 36px;
  bottom: 92px;
  left: 11.5%;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-auto-rows: 166px;
  gap: 24px 28px;
  align-content: start;
  padding: 26px 34px;
  overflow: auto;
  opacity: var(--world-index-card-progress);
  pointer-events: none;
  transform: none;
  transition: none;
}

.world-index-layer.is-open {
  pointer-events: auto;
}

.world-index-card {
  position: relative;
  isolation: isolate;
  border: 1px solid rgba(18, 22, 28, 0.12);
  border-radius: 8px;
  background:
    radial-gradient(circle at 22% 42%, rgba(32, 36, 40, 0.06), transparent 18%),
    linear-gradient(180deg, rgba(252, 252, 250, 0.92), rgba(238, 238, 235, 0.92));
  box-shadow: 0 22px 62px rgba(32, 36, 40, 0.12);
  clip-path: polygon(0 0, calc(100% - 28px) 0, 100% 22px, 100% 100%, 18px 100%, 0 calc(100% - 18px));
  overflow: hidden;
  transform: none;
  opacity: var(--world-index-card-progress);
  transition: none;
  cursor: pointer;
}

.world-index-card:focus-visible {
  outline: 2px solid rgba(20, 24, 30, 0.3);
  outline-offset: 4px;
}

.world-index-card::before {
  content: '';
  position: absolute;
  inset: 0 52% 0 0;
  border-right: 1px solid rgba(20, 24, 30, 0.08);
  background:
    linear-gradient(135deg, transparent 0 46%, rgba(18, 22, 28, 0.08) 47%, transparent 48%),
    radial-gradient(circle at 54% 52%, rgba(20, 24, 30, 0.08), transparent 23%);
  opacity: 0.82;
  z-index: -1;
}

.card-dots {
  display: none;
}

.world-index-card-body {
  position: relative;
  height: 100%;
  padding: 24px 28px 20px;
  display: flex;
  flex-direction: column;
}

.world-index-card h3 {
  margin: 0;
  font-size: 23px;
  line-height: 1.05;
  color: #12161d;
}

.world-index-card p {
  margin-top: 12px;
  color: #767d87;
  font-size: 13px;
  line-height: 1.55;
}

.world-index-card-actions {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 14px;
}

.card-link,
.card-icon,
.card-close {
  border: 0;
  color: #11151b;
  cursor: pointer;
  font: inherit;
}

.card-link {
  position: relative;
  min-width: 104px;
  padding: 0 0 9px;
  background: transparent;
  text-align: left;
  font-size: 13px;
  font-weight: 700;
}

.card-link::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: rgba(10, 13, 18, 0.58);
}

.card-link::before {
  content: '→';
  position: absolute;
  right: 0;
  top: 0;
  font-weight: 500;
}

.card-icon {
  width: 25px;
  height: 25px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 8px 24px rgba(20, 24, 30, 0.12);
  font-size: 11px;
  font-weight: 800;
}

.card-icon.danger {
  color: #c44545;
}

.card-close {
  position: absolute;
  top: 18px;
  right: 18px;
  width: 26px;
  height: 26px;
  background: transparent;
  color: rgba(20, 24, 30, 0.46);
  font-size: 22px;
  line-height: 1;
  z-index: 2;
}

.theme-dark .world-index-card {
  border-color: rgba(255, 255, 255, 0.1);
  background:
    radial-gradient(circle at 22% 42%, rgba(255, 255, 255, 0.07), transparent 18%),
    linear-gradient(180deg, rgba(36, 37, 38, 0.94), rgba(25, 26, 27, 0.94));
  box-shadow: 0 22px 62px rgba(0, 0, 0, 0.32);
}

.theme-dark .world-index-card h3,
.theme-dark .card-link,
.theme-dark .card-icon,
.theme-dark .card-close {
  color: #f1f2f2;
}

.theme-dark .world-index-card p {
  color: #a4a8ad;
}

.theme-dark .card-icon {
  background: rgba(255, 255, 255, 0.08);
}

.theme-dark .dialog-backdrop {
  background: rgba(16, 17, 18, 0.62);
}

.theme-dark .dialog-card {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(30, 31, 32, 0.96);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.34);
}

.theme-dark .field {
  background: rgba(255, 255, 255, 0.08);
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(245, 246, 246, 0.62);
  backdrop-filter: blur(8px);
}

.dialog-card {
  width: min(560px, 100%);
  border: 1px solid rgba(20, 24, 30, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 28px 90px rgba(40, 44, 50, 0.14);
  padding: 24px;
}

.dialog-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0;
  color: var(--home-dialog-muted);
}

h2,
p {
  margin: 0;
}

.dialog-head h2 {
  margin-top: 6px;
  font-size: 26px;
  color: var(--home-dialog-text);
}

.close-btn {
  width: 36px;
  height: 36px;
  border: 1px solid var(--home-dialog-border);
  border-radius: 50%;
  background: transparent;
  color: var(--home-dialog-text);
  cursor: pointer;
}

.dialog-form {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--home-dialog-text);
}

.field {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--home-dialog-border);
  background: rgba(255, 255, 255, 0.9);
  color: var(--home-dialog-text);
  border-radius: 6px;
  padding: 14px 16px;
  font: inherit;
}

.field:focus {
  outline: none;
  border-color: rgba(58, 62, 68, 0.55);
  box-shadow: 0 0 0 3px rgba(80, 84, 90, 0.14);
}

.field-area {
  min-height: 100px;
  resize: none;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 8px;
}

.ghost-btn,
.primary-btn {
  min-width: 108px;
  border-radius: 6px;
  padding: 12px 18px;
  font: inherit;
  cursor: pointer;
}

.ghost-btn {
  border: 1px solid var(--home-dialog-border);
  background: transparent;
  color: var(--home-dialog-text);
}

.primary-btn {
  border: 0;
  background: var(--home-dialog-text);
  color: var(--home-dialog-bg);
  font-weight: 700;
}

.primary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.error-text {
  color: #b42318;
  font-size: 13px;
}
</style>
