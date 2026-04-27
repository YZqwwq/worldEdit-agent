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
  clamp,
  getClampedTextLine,
  drawRoundRectPath,
  easeOutCubic,
  setCanvasFont
} from '../features/worldbuilding/homeCanvas/drawingPrimitives'
import { getHomeCanvasStageRegion } from '../features/worldbuilding/homeCanvas/layout'
import { HOME_CANVAS_THEMES } from '../features/worldbuilding/homeCanvas/theme'
import {
  getWorldInstanceEnterStageProgress,
  getWorldInstanceExitStageProgress,
  hasWorldInstanceEnterStageStarted,
  WORLD_INSTANCE_ENTER_TOTAL_MS,
  WORLD_INSTANCE_EXIT_TOTAL_MS
} from '../features/worldbuilding/homeCanvas/worldInstanceAnimation'
import { getWorldFragmentPieces } from '../features/worldbuilding/homeCanvas/worldInstanceFragments'
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
const worldMorphProgress = new Map<string, number>()
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
const WORLD_EXIT_ANIMATION_SECONDS = WORLD_INSTANCE_EXIT_TOTAL_MS / 1000
const DEFAULT_WORLD_SUMMARY = '进入世界实例继续编辑。'

const isEditingWorld = computed(() => editingWorldId.value !== '')
const deleteConfirmMessage = computed(() =>
  pendingDeleteWorld.value
    ? `将删除世界观「${pendingDeleteWorld.value.name}」及其下所有实体、组件和关系，此操作无法撤销。`
    : '确认删除该世界观吗？'
)

const activePalette = computed(() => HOME_CANVAS_THEMES[resolvedTheme.value])
const worldLookup = computed(() => new Map(worlds.value.map((world) => [world.id, world] as const)))
const recentWorlds = computed(() =>
  worlds.value
    .slice()
    .sort((a, b) => {
      const left = Date.parse(String((b as { updatedAt?: string; createdAt?: string }).updatedAt || (b as { createdAt?: string }).createdAt || ''))
      const right = Date.parse(String((a as { updatedAt?: string; createdAt?: string }).updatedAt || (a as { createdAt?: string }).createdAt || ''))
      return (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0)
    })
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

const drawBackground = (ctx: CanvasRenderingContext2D, palette: HomeCanvasPalette): void => {
  const stage = getStageRegion()
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
  ctx.moveTo(stage.left, stage.guideY)
  ctx.lineTo(sceneWidth, stage.guideY)
  ctx.moveTo(sceneWidth * 0.41, sceneHeight * 0.67)
  ctx.lineTo(sceneWidth * 0.92, sceneHeight * 0.18)
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

  const cornerX = sceneWidth - 38
  ctx.beginPath()
  ctx.arc(cornerX, 42, 12, 0, Math.PI * 2)
  ctx.arc(cornerX, 42, 8, 0, Math.PI * 2)
  ctx.stroke()

  for (let index = 0; index < 11; index += 1) {
    ctx.globalAlpha = index % 2 ? 0.22 : 0.5
    ctx.fillRect(sceneWidth * 0.815 + index * 8, 34, 1, 8)
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
  const sideScale = 0.95 * 1.1
  const sizeForIndex = (index: number): { w: number; h: number } => {
    if (visibleWorlds.length >= 3 && index === 1) {
      return {
        w: baseW * centerScale * cardWidthBoost * centerWidthBoost,
        h: baseH * centerScale
      }
    }
    return { w: baseW * sideScale * cardWidthBoost, h: baseH * sideScale }
  }
  const sizes = visibleWorlds.map((_, index) => sizeForIndex(index))
  const centerY = stage.guideY
  const gap = clamp(stage.width * 0.105, 96, 164)
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

const drawFragmentedWorld = (
  ctx: CanvasRenderingContext2D,
  palette: HomeCanvasPalette,
  target: HomeCanvasTarget,
  world: WorldPayload,
  hoverProgress: number,
  time: number,
  index: number,
  isExiting: boolean
): void => {
  const { x, y, w, h } = target.rect
  const pieces = getWorldFragmentPieces(index)
  const exitFragmentProgress = getWorldInstanceExitStageProgress(hoverProgress, 'fragmentGather')
  const movementProgress = easeOutCubic(getWorldInstanceEnterStageProgress(hoverProgress, 'fragmentGather'))
  const panelStarted = isExiting || hasWorldInstanceEnterStageStarted(hoverProgress, 'cornerCut')
  const pieceFade = isExiting ? easeOutCubic(exitFragmentProgress) : panelStarted ? 0 : 1
  const pieceShadowFade = 1 - movementProgress
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
      ctx.fillStyle = hoverProgress > 0.2 ? palette.fragmentHover : palette.fragment
      ctx.globalAlpha = 0.64 * passAlpha
      ctx.shadowColor = palette.panelShadow
      ctx.shadowBlur = (4 + 18 * movementProgress) * pieceShadowFade * passAlpha
      ctx.shadowOffsetY = (4 + 12 * movementProgress) * pieceShadowFade * passAlpha
      ctx.fill()
    }

    ctx.restore()
  }

  ctx.save()
  drawPieces(pieceFade)

  ctx.globalAlpha = 0.16 + movementProgress * 0.5
  ctx.strokeStyle = palette.line

  if (panelStarted) {
    drawMergedWorldCard(ctx, palette, target, world, hoverProgress, isExiting)
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
  const cut = clamp(Math.min(w, h) * 0.08, 10, 28) * cutProgress
  const radius = clamp(Math.min(w, h) * 0.035, 4, 10)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - cut, y)
  if (cut > 0) {
    ctx.lineTo(x + w, y + cut)
  } else {
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  }
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + cut, y + h)
  if (cut > 0) {
    ctx.lineTo(x, y + h - cut)
  } else {
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  }
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

const drawMergedWorldLineDecor = (
  ctx: CanvasRenderingContext2D,
  palette: HomeCanvasPalette,
  x: number,
  y: number,
  w: number,
  h: number,
  opacity: number
): void => {
  const decorW = w * 0.42
  const orbX = x + decorW * 0.55
  const orbY = y + h * 0.45
  const orbRadius = clamp(Math.min(w, h) * 0.13, 18, 44)

  ctx.save()

  ctx.strokeStyle = palette.line
  ctx.lineWidth = 1
  ctx.globalAlpha = 0.42 * opacity
  ctx.beginPath()
  ctx.arc(x + decorW * 0.05, y + h * 0.66, decorW * 0.68, Math.PI * 1.05, Math.PI * 1.9)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x + decorW * 0.1, y + h * 0.48, decorW * 0.42, Math.PI * 1.08, Math.PI * 2.02)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(x + decorW * 0.08, y + h * 0.7)
  ctx.lineTo(x + decorW * 0.86, y + h * 0.18)
  ctx.stroke()

  ctx.globalAlpha = 0.18 * opacity
  ctx.fillStyle = resolvedTheme.value === 'dark' ? 'rgba(255,255,255,0.22)' : 'rgba(40,44,48,0.18)'
  ctx.beginPath()
  ctx.arc(orbX, orbY, orbRadius, 0, Math.PI * 2)
  ctx.fill()

  ctx.globalAlpha = 0.5 * opacity
  ctx.fillRect(x + decorW * 0.16, y + h * 0.22, clamp(w * 0.012, 2, 4), clamp(w * 0.012, 2, 4))
  ctx.fillRect(x + decorW * 0.64, y + h * 0.28, clamp(w * 0.01, 2, 3), clamp(w * 0.01, 2, 3))
  ctx.fillRect(x + decorW * 0.78, y + h * 0.72, clamp(w * 0.008, 1.5, 2.5), clamp(w * 0.008, 1.5, 2.5))

  ctx.strokeStyle = palette.hairline
  ctx.globalAlpha = 0.78 * opacity
  ctx.beginPath()
  ctx.moveTo(x + decorW, y)
  ctx.lineTo(x + decorW, y + h)
  ctx.stroke()
  ctx.restore()
}

const drawMergedWorldDotDecor = (
  ctx: CanvasRenderingContext2D,
  palette: HomeCanvasPalette,
  x: number,
  y: number,
  w: number,
  h: number,
  opacity: number
): void => {
  const decorW = w * 0.42
  const dotGap = clamp(w * 0.022, 5, 8)
  const dotSize = clamp(w * 0.006, 0.8, 1.4)
  const gridX = x + decorW * 0.2
  const gridY = y + h * 0.12

  ctx.save()
  ctx.fillStyle = palette.dot
  ctx.globalAlpha = 0.38 * opacity
  for (let row = 0; row < 6; row += 1) {
    for (let col = 0; col < 6; col += 1) {
      ctx.beginPath()
      ctx.arc(gridX + col * dotGap, gridY + row * dotGap, dotSize, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

const drawMergedWorldCard = (
  ctx: CanvasRenderingContext2D,
  palette: HomeCanvasPalette,
  target: HomeCanvasTarget,
  world: WorldPayload,
  revealProgress: number,
  isExiting: boolean
): void => {
  if (revealProgress <= 0) return

  const { x, y, w, h } = target.rect
  const contentX = x + w * 0.52
  const contentW = w * 0.38
  const enterY = y + h * 0.78
  const exitContentProgress = getWorldInstanceExitStageProgress(revealProgress, 'contentFade')
  const exitFragmentProgress = getWorldInstanceExitStageProgress(revealProgress, 'fragmentGather')
  const contentExitAlpha = 1 - easeOutCubic(exitContentProgress)
  const panelAlpha = isExiting ? 1 - easeOutCubic(exitFragmentProgress) : 1
  const cutProgress = isExiting
    ? 1 - easeOutCubic(getWorldInstanceExitStageProgress(revealProgress, 'cornerCut'))
    : easeOutCubic(getWorldInstanceEnterStageProgress(revealProgress, 'cornerCut'))
  const brightnessProgress = isExiting
    ? contentExitAlpha
    : easeOutCubic(getWorldInstanceEnterStageProgress(revealProgress, 'brighten'))
  const dotAlpha = isExiting
    ? contentExitAlpha
    : easeOutCubic(getWorldInstanceEnterStageProgress(revealProgress, 'dotFade'))
  const lineAlpha = isExiting
    ? contentExitAlpha
    : easeOutCubic(getWorldInstanceEnterStageProgress(revealProgress, 'lineFade'))
  const infoAlpha = isExiting
    ? contentExitAlpha
    : easeOutCubic(getWorldInstanceEnterStageProgress(revealProgress, 'textFade'))
  const enterAlpha = isExiting
    ? contentExitAlpha
    : easeOutCubic(getWorldInstanceEnterStageProgress(revealProgress, 'enterFade'))
  const shadowAlpha = isExiting
    ? contentExitAlpha
    : easeOutCubic(getWorldInstanceEnterStageProgress(revealProgress, 'shadowFade'))
  const fragmentEffectiveAlpha = resolvedTheme.value === 'dark' ? 0.64 * 0.94 : 0.64 * 0.96
  const lightPanelColor =
    resolvedTheme.value === 'dark'
      ? `rgba(${86 + brightnessProgress * 6}, ${88 + brightnessProgress * 6}, ${90 + brightnessProgress * 6}, ${fragmentEffectiveAlpha + brightnessProgress * (0.96 - fragmentEffectiveAlpha)})`
      : `rgba(${226 + brightnessProgress * 22}, ${226 + brightnessProgress * 22}, ${223 + brightnessProgress * 23}, ${fragmentEffectiveAlpha + brightnessProgress * (0.98 - fragmentEffectiveAlpha)})`

  ctx.save()

  if (shadowAlpha > 0) {
    drawMergedWorldCardShapePath(ctx, x, y, w, h, cutProgress)
    ctx.globalAlpha = shadowAlpha * 0.5
    ctx.fillStyle = resolvedTheme.value === 'dark' ? 'rgba(92, 94, 96, 0.18)' : 'rgba(248, 248, 246, 0.38)'
    ctx.shadowColor = resolvedTheme.value === 'dark' ? 'rgba(0,0,0,0.52)' : 'rgba(28,32,36,0.24)'
    ctx.shadowBlur = 22
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 18
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
  }

  drawMergedWorldCardShapePath(ctx, x, y, w, h, cutProgress)
  ctx.globalAlpha = panelAlpha
  ctx.fillStyle = lightPanelColor
  ctx.fill()
  ctx.strokeStyle = palette.hairline
  ctx.globalAlpha = panelAlpha * brightnessProgress * 0.8
  ctx.stroke()

  if (dotAlpha > 0 || lineAlpha > 0) {
    ctx.save()
    drawMergedWorldCardShapePath(ctx, x, y, w, h, 1)
    ctx.clip()
    if (dotAlpha > 0) drawMergedWorldDotDecor(ctx, palette, x, y, w, h, dotAlpha)
    if (lineAlpha > 0) drawMergedWorldLineDecor(ctx, palette, x, y, w, h, lineAlpha)
    ctx.restore()
  }

  if (infoAlpha > 0) {
    ctx.globalAlpha = infoAlpha
    setCanvasFont(ctx, clamp(w * 0.06, 18, 30), 800)
    ctx.fillStyle = palette.ink
    ctx.fillText(
      getCachedClampedText(ctx, `${world.id}:name`, world.name, contentW),
      contentX,
      y + h * 0.36
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
      y + h * 0.48
    )
  }

  if (enterAlpha > 0) {
    ctx.strokeStyle = palette.ink
    ctx.lineWidth = 1
    ctx.globalAlpha = enterAlpha * 0.72
    ctx.beginPath()
    ctx.moveTo(contentX, enterY + 14)
    ctx.lineTo(contentX + contentW * 0.45, enterY + 14)
    ctx.stroke()

    setCanvasFont(ctx, clamp(w * 0.03, 11, 13), 600)
    ctx.globalAlpha = enterAlpha
    ctx.fillStyle = palette.ink
    ctx.fillText('进入', contentX, enterY)
    ctx.fillText('→', contentX + contentW * 0.42, enterY)
  }

  if (infoAlpha > 0) {
    ctx.strokeStyle = palette.muted
    ctx.globalAlpha = infoAlpha * 0.72
    ctx.lineWidth = 1
    const closeX = x + w - clamp(w * 0.085, 24, 42)
    const closeY = y + clamp(h * 0.14, 22, 42)
    const closeSize = clamp(w * 0.025, 8, 12)
    ctx.beginPath()
    ctx.moveTo(closeX - closeSize / 2, closeY - closeSize / 2)
    ctx.lineTo(closeX + closeSize / 2, closeY + closeSize / 2)
    ctx.moveTo(closeX + closeSize / 2, closeY - closeSize / 2)
    ctx.lineTo(closeX - closeSize / 2, closeY + closeSize / 2)
    ctx.stroke()
  }

  if (dotAlpha > 0) {
    ctx.fillStyle = palette.dot
    ctx.globalAlpha = dotAlpha * 0.62
    const dotX = x + w - clamp(w * 0.06, 16, 32)
    const dotY = y + h * 0.46
    for (let index = 0; index < 4; index += 1) {
      ctx.beginPath()
      ctx.arc(dotX, dotY + index * 9, index === 0 ? 1.7 : 1.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.restore()
}

const drawEmptyWorldPreview = (ctx: CanvasRenderingContext2D, palette: HomeCanvasPalette, time: number): void => {
  const stage = getStageRegion()
  const w = clamp(sceneWidth * 0.28, 260, 420)
  const h = clamp(sceneHeight * 0.24, 150, 220)
  const x = stage.centerX - w / 2
  const y = sceneHeight * 0.41 - h / 2
  ctx.save()
  ctx.globalAlpha = 0.54 + Math.sin(time * 0.002) * 0.08
  drawRoundRectPath(ctx, x, y, w, h, 4)
  ctx.fillStyle = palette.fragment
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
  time: number
): HomeCanvasTarget => {
  const stage = getStageRegion()
  const radius = clamp(Math.min(sceneWidth, sceneHeight) * 0.09, 54, 96)
  const x = stage.centerX
  const y = sceneHeight * 0.83
  const target = {
    kind: 'create' as const,
    rect: {
      x: x - radius,
      y: y - radius,
      w: radius * 2,
      h: radius * 2
    }
  }
  const isHover = hoverTarget?.kind === 'create'
  const pulse = isHover ? 0 : (Math.sin(time * 0.004) + 1) / 2

  ctx.save()
  ctx.strokeStyle = palette.line
  ctx.fillStyle = palette.ink
  ctx.lineWidth = 1
  ctx.translate(x, y)
  for (let ring = 1; ring <= 5; ring += 1) {
    ctx.globalAlpha = isHover ? 0.48 : 0.14 + ring * 0.06 + pulse * 0.12
    ctx.beginPath()
    ctx.arc(0, 0, (radius * ring) / 5, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.globalAlpha = isHover ? 0.2 : 0.1
  ctx.beginPath()
  ctx.moveTo(-radius * 0.95, 0)
  ctx.lineTo(radius * 0.95, 0)
  ctx.moveTo(0, -radius * 0.95)
  ctx.lineTo(0, radius * 0.95)
  ctx.stroke()

  if (isHover) {
    ctx.shadowColor = palette.panelShadow
    ctx.shadowBlur = 30
    ctx.shadowOffsetY = 10
    ctx.beginPath()
    ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2)
    ctx.fillStyle = resolvedTheme.value === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.92)'
    ctx.fill()
  }

  ctx.globalAlpha = 1
  ctx.strokeStyle = palette.ink
  ctx.beginPath()
  ctx.moveTo(-9, 0)
  ctx.lineTo(9, 0)
  ctx.moveTo(0, -9)
  ctx.lineTo(0, 9)
  ctx.stroke()

  if (isHover) {
    setCanvasFont(ctx, 14, 700)
    ctx.fillStyle = palette.ink
    ctx.textAlign = 'center'
    ctx.fillText('创建世界观', 0, radius + 30)
  }
  ctx.restore()
  ctx.textAlign = 'left'
  return target
}

const drawScene = (): void => {
  const canvas = sceneCanvasRef.value
  const ctx = canvas?.getContext('2d')
  if (!canvas || !ctx) return

  const now = performance.now()
  const deltaSeconds = Math.min(0.05, (now - previousFrameTime) / 1000)
  previousFrameTime = now
  const time = now - sceneStartTime
  const palette = activePalette.value
  ctx.setTransform(sceneDpr, 0, 0, sceneDpr, 0, 0)
  ctx.clearRect(0, 0, sceneWidth, sceneHeight)
  sceneTargets = []

  drawBackground(ctx, palette)
  drawTechnicalDecor(ctx, palette, time)

  setCanvasFont(ctx, 12, 500)
  ctx.fillStyle = palette.muted
  ctx.fillText('WORLD INDEX', getStageRegion().left + sceneWidth * 0.012, sceneHeight * 0.18)

  const worldTargets = getWorldLayout()
  sceneTargets.push(...worldTargets)
  if (worldTargets.length) {
    const activeIds = new Set(worldTargets.map((target) => target.id).filter(Boolean) as string[])
    for (const key of Array.from(worldMorphProgress.keys())) {
      if (!activeIds.has(key)) worldMorphProgress.delete(key)
    }
    worldTargets.forEach((target, index) => {
      const world = findWorldById(target.id)
      if (!world) return
      const currentHover = hoverTarget
      const hovered =
        currentHover !== null &&
        currentHover.id === target.id &&
        currentHover.kind === 'world'
      const previous = worldMorphProgress.get(world.id) ?? 0
      const targetValue = hovered ? 1 : 0
      const direction = targetValue > previous ? 1 : -1
      const animationSeconds =
        direction > 0 ? WORLD_ENTRY_ANIMATION_SECONDS : WORLD_EXIT_ANIMATION_SECONDS
      const next =
        targetValue === previous
          ? previous
          : clamp(previous + (direction * deltaSeconds) / animationSeconds, 0, 1)
      worldMorphProgress.set(world.id, next)
      drawFragmentedWorld(ctx, palette, target, world, next, time, index, direction < 0)
    })
  } else if (!loadingWorlds.value) {
    drawEmptyWorldPreview(ctx, palette, time)
  }

  const createTarget = drawCreateButton(ctx, palette, time)
  sceneTargets.push(createTarget)

  const assistantTarget: HomeCanvasTarget = {
    kind: 'assistant',
    rect: {
      x: sceneWidth - 58,
      y: 24,
      w: 34,
      h: 34
    }
  }
  sceneTargets.push(assistantTarget)
  ctx.save()
  ctx.strokeStyle = palette.line
  ctx.fillStyle = hoverTarget?.kind === 'assistant' ? palette.panelHover : 'transparent'
  ctx.beginPath()
  ctx.arc(assistantTarget.rect.x + 17, assistantTarget.rect.y + 17, 12, 0, Math.PI * 2)
  ctx.fill()
  ctx.stroke()
  setCanvasFont(ctx, 9, 700)
  ctx.fillStyle = palette.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('AI', assistantTarget.rect.x + 17, assistantTarget.rect.y + 17)
  ctx.restore()

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
  worldMorphProgress.clear()
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

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(17, 19, 22, 0.28);
  backdrop-filter: blur(10px);
}

.dialog-card {
  width: min(560px, 100%);
  border: 1px solid var(--home-dialog-border);
  border-radius: 8px;
  background: var(--home-dialog-bg);
  box-shadow: 0 28px 90px rgba(0, 0, 0, 0.18);
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
  background: var(--home-field-bg);
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
  resize: vertical;
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
