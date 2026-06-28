<template>
  <div class="worldbuilding-white-theme portrait-editor-page">
    <main v-if="entityDetail" class="portrait-editor-shell">
      <aside class="panel sidebar-panel">
        <div class="sidebar-nav-shell">
          <div class="sidebar-nav">
            <button
              v-if="worldId"
              type="button"
              class="icon-nav-btn"
              aria-label="返回世界实例"
              title="返回世界实例"
              @click="navigateToWorldEditor"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" class="icon-nav-svg">
                <path
                  d="M4 10.6L12 4l8 6.6"
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
            </button>
            <button
              type="button"
              class="icon-nav-btn subtle"
              aria-label="返回人物实例"
              title="返回人物实例"
              @click="navigateToEntityEditor"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" class="icon-nav-svg">
                <path
                  d="M15.5 4.5L8 12l7.5 7.5"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
              </svg>
            </button>
          </div>
        </div>

        <div class="attribute-list-shell">
          <div class="attribute-list">
            <button
              v-for="field in availableFields"
              :key="field.key"
              type="button"
              class="attribute-chip"
              :class="{ used: isFieldUsed(field.key), active: selectedFieldKey === field.key }"
              draggable="true"
              @dragstart="handleFieldDragStart($event, field.key)"
              @click="selectField(field.key)"
            >
              <span class="attribute-chip-label">{{ field.label }}</span>
            </button>
          </div>

          <div class="attribute-list-fade" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="attribute-list-fade-icon">
              <path
                d="M6 9.5L12 15.5L18 9.5"
                fill="none"
                stroke="currentColor"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.8"
              />
            </svg>
          </div>
        </div>
      </aside>

      <section class="panel stage-panel">
        <div class="stage-caption">
          <span class="stage-caption-label">当前编辑人物</span>
          <span class="stage-caption-name">{{ entityDetail.entity.name }}</span>
        </div>

        <div
          ref="stageViewportRef"
          class="stage-viewport"
          :class="[`mode-${studio.mode}`, `active-layer-${selectedVisualLayer || 'none'}`]"
          @dragover.prevent
          @drop.prevent="handleStageDrop"
          @wheel.prevent="handleStageWheel"
        >
          <div ref="stageFrameRef" class="stage-frame" :style="stageFrameStyle">
            <div
              class="stage-layer stage-layer-background"
              :class="{ selected: selectedVisualLayer === 'background' }"
              @pointerdown.stop="selectVisualLayer('background')"
              @click.stop="selectedVisualLayer = 'background'"
            >
              <img
                v-if="studio.background.imageUrl"
                :src="studio.background.imageUrl"
                alt="背景层"
                class="stage-image"
                :style="getVisualLayerStyle(studio.background)"
              />
            </div>

            <div
              class="stage-layer stage-layer-character"
              :class="{ selected: selectedVisualLayer === 'character' }"
              @pointerdown.stop="selectVisualLayer('character')"
              @click.stop="selectedVisualLayer = 'character'"
            >
              <img
                v-if="studio.character.imageUrl"
                :src="studio.character.imageUrl"
                alt="人物层"
                class="stage-image stage-image-character"
                :style="getVisualLayerStyle(studio.character)"
              />
            </div>

            <div
              v-if="activeTransformBounds"
              class="transform-overlay"
              :style="activeTransformBounds.overlayStyle"
              @pointerdown.stop="startTransformMove"
            >
              <div class="transform-overlay-frame"></div>
              <div class="transform-overlay-crosshair" aria-hidden="true"></div>
              <button
                v-for="handle in TRANSFORM_HANDLES"
                :key="handle.key"
                type="button"
                class="transform-handle"
                :class="[`handle-${handle.key}`]"
                :style="handle.style"
                :aria-label="`${handle.label}缩放`"
                @pointerdown.stop="startTransformScale(handle.key, $event)"
              />
            </div>

            <div class="stage-layer stage-layer-text" @click="clearBlockSelection">
              <button
                v-for="block in studio.textBlocks"
                :key="block.id"
                type="button"
                class="text-block"
                :class="[
                  `box-${block.boxStyle}`,
                  { selected: selectedBlockId === block.id }
                ]"
                :style="getTextBlockStyle(block)"
                @pointerdown.stop="startTextBlockDrag(block.id, $event)"
                @click.stop="selectBlock(block.id)"
              >
                <span class="text-block-label">{{ getFieldLabel(block.fieldKey) }}</span>
                <span class="text-block-content">{{ getBlockContent(block) || '待填写' }}</span>
              </button>
            </div>
          </div>
        </div>

      </section>

      <aside class="panel inspector-panel">
        <div class="panel-head">
          <div>
            <div class="eyebrow">属性编辑区域</div>
            <h2>{{ selectedField?.label || '未选中属性' }}</h2>
          </div>
          <p>右侧维护实例内容与画布样式。</p>
        </div>

        <section class="inspector-section">
          <div class="section-title">实例内容</div>
          <label v-if="selectedField" class="field-stack">
            <span>{{ selectedField.label }}</span>
            <textarea
              v-model.trim="fieldFormValue"
              class="text-input multiline"
              :placeholder="`填写${selectedField.label}`"
              @change="applyFieldForm"
              @blur="applyFieldForm"
            />
          </label>
          <div v-else class="empty-card">先从左侧选择一个实例属性。</div>
        </section>

        <section class="inspector-section">
          <div class="section-title">画布控制</div>

          <div class="field-stack">
            <span>画幅模式</span>
            <div class="mode-switch inspector-switch">
              <button
                type="button"
                class="mode-switch-btn"
                :class="{ active: activeStudioMode === 'portrait' }"
                @click="switchStudioMode('portrait')"
              >
                竖屏
              </button>
              <button
                type="button"
                class="mode-switch-btn"
                :class="{ active: activeStudioMode === 'landscape' }"
                @click="switchStudioMode('landscape')"
              >
                横屏
              </button>
            </div>
          </div>

          <div class="field-stack">
            <span>当前图层</span>
            <div class="toolbar-group inspector-group">
              <button
                type="button"
                class="toolbar-chip"
                :class="{ active: selectedVisualLayer === 'background' }"
                @click="selectedVisualLayer = 'background'"
              >
                背景层
              </button>
              <button
                type="button"
                class="toolbar-chip"
                :class="{ active: selectedVisualLayer === 'character' }"
                @click="selectedVisualLayer = 'character'"
              >
                人物层
              </button>
            </div>
          </div>

          <div class="field-stack">
            <span>文字层</span>
            <div class="toolbar-group inspector-group">
              <button type="button" class="toolbar-chip" :disabled="!selectedFieldKey" @click="addSelectedFieldToStage">
                放入选中属性
              </button>
              <button type="button" class="toolbar-chip subtle" :disabled="!selectedBlock" @click="removeSelectedBlock">
                移除文字块
              </button>
            </div>
          </div>
        </section>

        <section class="inspector-section">
          <div class="section-title">图层导入</div>
          <div class="action-grid">
            <button type="button" class="action-btn" @click="pickLayerImage('background')">
              导入背景
            </button>
            <button type="button" class="action-btn" @click="pickLayerImage('character')">
              导入人物
            </button>
            <button
              type="button"
              class="action-btn subtle"
              :disabled="!activeVisualState?.imageUrl"
              @click="clearSelectedVisualLayer"
            >
              清空当前图层
            </button>
            <button
              type="button"
              class="action-btn subtle"
              :disabled="!activeVisualState"
              @click="resetSelectedVisualLayerTransform"
            >
              重置图层位姿
            </button>
          </div>
        </section>

        <section v-if="selectedBlock" class="inspector-section">
          <div class="section-title">文字层样式</div>

          <label class="field-stack">
            <span>字体选择</span>
            <select v-model="selectedBlock.fontFamily" class="text-input">
              <option v-for="font in fontOptions" :key="font.value" :value="font.value">
                {{ font.label }}
              </option>
            </select>
          </label>

          <div class="dual-grid">
            <label class="field-stack">
              <span>字重</span>
              <select v-model="selectedBlock.fontWeight" class="text-input">
                <option value="400">常规</option>
                <option value="500">中等</option>
                <option value="600">偏粗</option>
                <option value="700">加粗</option>
              </select>
            </label>

            <label class="field-stack">
              <span>字体效果</span>
              <select v-model="selectedBlock.fontStyle" class="text-input">
                <option value="normal">正常</option>
                <option value="italic">倾斜</option>
              </select>
            </label>
          </div>

          <div class="dual-grid">
            <label class="field-stack">
              <span>文字对齐</span>
              <select v-model="selectedBlock.textAlign" class="text-input">
                <option value="left">左对齐</option>
                <option value="center">居中</option>
                <option value="right">右对齐</option>
              </select>
            </label>

            <label class="field-stack">
              <span>内容框效果</span>
              <select v-model="selectedBlock.boxStyle" class="text-input">
                <option value="none">默认透明</option>
                <option value="frosted">磨砂玻璃</option>
                <option value="fill">颜色填充</option>
              </select>
            </label>
          </div>

          <label class="field-stack">
            <span>文字颜色</span>
            <input v-model="selectedBlock.textColor" class="text-input" type="color" />
          </label>

          <div class="range-grid">
            <label class="field-stack">
              <span>内容框宽度 {{ toPercentLabel(selectedBlock.rect.w) }}</span>
              <input v-model.number="selectedBlock.rect.w" class="range-input" type="range" min="0.12" max="0.72" step="0.01" />
            </label>
            <label class="field-stack">
              <span>内容框高度 {{ toPercentLabel(selectedBlock.rect.h) }}</span>
              <input v-model.number="selectedBlock.rect.h" class="range-input" type="range" min="0.08" max="0.36" step="0.01" />
            </label>
            <label class="field-stack">
              <span>X 位置 {{ toPercentLabel(selectedBlock.rect.x) }}</span>
              <input v-model.number="selectedBlock.rect.x" class="range-input" type="range" min="0" max="1" step="0.01" />
            </label>
            <label class="field-stack">
              <span>Y 位置 {{ toPercentLabel(selectedBlock.rect.y) }}</span>
              <input v-model.number="selectedBlock.rect.y" class="range-input" type="range" min="0" max="1" step="0.01" />
            </label>
          </div>
        </section>
        <section v-else class="inspector-section">
          <div class="section-title">文字层样式</div>
          <div class="empty-card">把左侧属性拖入中间文字层，再在这里微调字体与内容框。</div>
        </section>
      </aside>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
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
  DEFAULT_PORTRAIT_TRANSFORM,
  getCharacterBasicInfoValue,
  getCharacterComponentByType,
  updateCharacterBasicInfoValues,
  type CharacterDemographicData,
  type CharacterProfileData
} from '../features/worldbuilding/character/shared'
import {
  PORTRAIT_DOCUMENT_FORMAT,
  PORTRAIT_DOCUMENT_FILE_EXTENSION,
  PORTRAIT_DOCUMENT_VERSION,
  type PortraitDocument,
  type PortraitDocumentAssetId,
  type PortraitDocumentImageAsset
} from '@share/cache/worldbuilding/portraitDocument'
import '../styles/worldbuildingWhiteTheme.css'

type StageMode = 'portrait' | 'landscape'
type VisualLayerKey = 'background' | 'character'
type BoxStyle = 'none' | 'frosted' | 'fill'
type PortraitFieldKey =
  | 'name'
  | 'title'
  | 'summary'
  | 'age'
  | 'gender'
  | 'race'
  | 'faction'
  | 'nation'
  | 'birthplace'
  | 'height'

type VisualLayerState = {
  imageUrl: string
  resourceUrl?: string
  x: number
  y: number
  scale: number
  width?: number
  height?: number
}

type PortraitTextBlock = {
  id: string
  fieldKey: PortraitFieldKey
  rect: {
    x: number
    y: number
    w: number
    h: number
  }
  fontFamily: string
  fontWeight: '400' | '500' | '600' | '700'
  fontStyle: 'normal' | 'italic'
  textAlign: 'left' | 'center' | 'right'
  textColor: string
  boxStyle: BoxStyle
}

type PortraitStudioState = {
  mode: StageMode
  background: VisualLayerState
  character: VisualLayerState
  textBlocks: PortraitTextBlock[]
}

type PortraitStudiosByMode = Record<StageMode, PortraitStudioState>

type CharacterPortraitStudioProfileData = CharacterProfileData & {
  portraitStudio?: Partial<PortraitStudioState>
  portraitStudiosByMode?: Partial<Record<StageMode, Partial<PortraitStudioState>>>
}

type AvailableField = {
  key: PortraitFieldKey
  label: string
  value: string
}

type StageDragState =
  | {
      kind: 'visual-move'
      layer: VisualLayerKey
      pointerId: number
      startClientX: number
      startClientY: number
      originX: number
      originY: number
    }
  | {
      kind: 'visual-scale'
      layer: VisualLayerKey
      pointerId: number
      originScale: number
      centerClientX: number
      centerClientY: number
      startDistance: number
    }
  | {
      kind: 'text'
      blockId: string
      pointerId: number
      startClientX: number
      startClientY: number
      originX: number
      originY: number
    }
  | null

const FONT_OPTIONS = [
  { value: '"Noto Serif SC", "Source Han Serif SC", serif', label: '衬线' },
  { value: '"Noto Sans SC", "Microsoft YaHei", sans-serif', label: '无衬线' },
  { value: '"LXGW WenKai", "KaiTi", cursive', label: '文楷' }
] as const

const CHARACTER_LAYER_BASE_WIDTH_RATIO = 0.72

const TRANSFORM_HANDLES = [
  { key: 'nw', label: '左上', style: { left: '0%', top: '0%', cursor: 'nwse-resize' } },
  { key: 'n', label: '上', style: { left: '50%', top: '0%', cursor: 'ns-resize' } },
  { key: 'ne', label: '右上', style: { left: '100%', top: '0%', cursor: 'nesw-resize' } },
  { key: 'e', label: '右', style: { left: '100%', top: '50%', cursor: 'ew-resize' } },
  { key: 'se', label: '右下', style: { left: '100%', top: '100%', cursor: 'nwse-resize' } },
  { key: 's', label: '下', style: { left: '50%', top: '100%', cursor: 'ns-resize' } },
  { key: 'sw', label: '左下', style: { left: '0%', top: '100%', cursor: 'nesw-resize' } },
  { key: 'w', label: '左', style: { left: '0%', top: '50%', cursor: 'ew-resize' } }
] as const

const STAGE_MODE_RATIO: Record<StageMode, string> = {
  portrait: '9 / 16',
  landscape: '16 / 9'
}

const AVAILABLE_FIELD_ORDER: PortraitFieldKey[] = [
  'name',
  'title',
  'summary',
  'age',
  'gender',
  'race',
  'faction',
  'nation',
  'birthplace',
  'height'
]

const DEFAULT_STUDIO_STATE = (): PortraitStudioState => ({
  mode: 'portrait',
  background: { imageUrl: '', resourceUrl: '', x: 0.5, y: 0.5, scale: 1.08 },
  character: { imageUrl: '', resourceUrl: '', x: 0.5, y: 0.56, scale: DEFAULT_PORTRAIT_TRANSFORM.scale },
  textBlocks: []
})

const DEFAULT_STUDIOS_BY_MODE = (): PortraitStudiosByMode => ({
  portrait: DEFAULT_STUDIO_STATE(),
  landscape: {
    ...DEFAULT_STUDIO_STATE(),
    mode: 'landscape',
    character: {
      ...DEFAULT_STUDIO_STATE().character,
      y: 0.54,
      scale: 1
    }
  }
})

const DOCUMENT_ASSET_IDS: Record<StageMode, Record<VisualLayerKey, PortraitDocumentAssetId>> = {
  portrait: {
    background: 'portrait_background',
    character: 'portrait_character'
  },
  landscape: {
    background: 'landscape_background',
    character: 'landscape_character'
  }
}

const route = useRoute()
const router = useRouter()

const entityDetail = ref<WorldEntityDetailPayload | null>(null)
const savingPortrait = ref(false)
const portraitSaveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const stageViewportRef = ref<HTMLElement | null>(null)
const stageFrameRef = ref<HTMLElement | null>(null)
const stageViewportSize = ref({ width: 0, height: 0 })

const characterNameInput = ref('')
const characterTitleInput = ref('')
const characterSummaryInput = ref('')
const characterAgeInput = ref<number | null>(null)
const characterAgeLabelInput = ref('')
const characterHeightInput = ref('')
const characterGenderInput = ref('')
const characterRaceIdInput = ref('')
const characterFactionIdInput = ref('')
const characterNationIdInput = ref('')
const characterBirthplaceInput = ref('')

const studio = ref<PortraitStudioState>(DEFAULT_STUDIOS_BY_MODE().portrait)
const studiosByMode = ref<PortraitStudiosByMode>(DEFAULT_STUDIOS_BY_MODE())
const activeStudioMode = ref<StageMode>('portrait')
const selectedFieldKey = ref<PortraitFieldKey | null>('name')
const selectedBlockId = ref<string | null>(null)
const selectedVisualLayer = ref<VisualLayerKey>('character')
const transformEditingLayer = ref<VisualLayerKey | null>(null)
const fieldFormValue = ref('')

let syncingFromDetail = false
let portraitAutosaveTimer: ReturnType<typeof setTimeout> | null = null
let portraitSaveQueued = false
let lastSavedPortraitSignature = ''
let stageDragState: StageDragState = null
let stageViewportObserver: ResizeObserver | null = null

const worldId = computed(() => String(route.params.worldId || ''))
const entityId = computed(() => String(route.params.entityId || ''))

const availableFields = computed<AvailableField[]>(() => [
  { key: 'name', label: '姓名', value: characterNameInput.value },
  { key: 'title', label: '称号', value: characterTitleInput.value },
  { key: 'summary', label: '概述', value: characterSummaryInput.value },
  {
    key: 'age',
    label: '年龄',
    value: characterAgeLabelInput.value || (characterAgeInput.value == null ? '' : String(characterAgeInput.value))
  },
  { key: 'gender', label: '性别', value: characterGenderInput.value },
  { key: 'race', label: '种族', value: characterRaceIdInput.value },
  { key: 'faction', label: '隶属势力', value: characterFactionIdInput.value },
  { key: 'nation', label: '国属', value: characterNationIdInput.value },
  { key: 'birthplace', label: '出生地', value: characterBirthplaceInput.value },
  { key: 'height', label: '身高', value: characterHeightInput.value }
])

const selectedField = computed(() =>
  availableFields.value.find((field) => field.key === selectedFieldKey.value) ?? null
)

const selectedBlock = computed(() =>
  studio.value.textBlocks.find((block) => block.id === selectedBlockId.value) ?? null
)

const activeVisualState = computed(() =>
  selectedVisualLayer.value ? studio.value[selectedVisualLayer.value] : null
)

const stageFrameMetrics = computed(() => {
  const ratio = studio.value.mode === 'portrait' ? 9 / 16 : 16 / 9
  const maxWidth = stageViewportSize.value.width
  const maxHeight = stageViewportSize.value.height
  if (!maxWidth || !maxHeight) {
    return {
      width: 0,
      height: 0,
      aspectRatio: STAGE_MODE_RATIO[studio.value.mode]
    }
  }

  let width = maxWidth
  let height = width / ratio
  if (height > maxHeight) {
    height = maxHeight
    width = height * ratio
  }

  return {
    width,
    height,
    aspectRatio: STAGE_MODE_RATIO[studio.value.mode]
  }
})

const stageFrameStyle = computed(() => {
  if (!stageFrameMetrics.value.width || !stageFrameMetrics.value.height) {
    return {
      aspectRatio: stageFrameMetrics.value.aspectRatio
    }
  }

  return {
    width: `${stageFrameMetrics.value.width}px`,
    height: `${stageFrameMetrics.value.height}px`,
    aspectRatio: stageFrameMetrics.value.aspectRatio
  }
})

const getVisualLayerBounds = (
  layerKey: VisualLayerKey
): {
  widthPx: number
  heightPx: number
  centerXPx: number
  centerYPx: number
  overlayStyle: Record<string, string>
} | null => {
  const layer = studio.value[layerKey]
  if (!layer.imageUrl || !stageFrameMetrics.value.width || !stageFrameMetrics.value.height) return null

  const aspect =
    layer.width && layer.height && layer.width > 0 && layer.height > 0 ? layer.width / layer.height : 1
  const baseWidthPx =
    stageFrameMetrics.value.width * (layerKey === 'background' ? 1 : CHARACTER_LAYER_BASE_WIDTH_RATIO)
  const widthPx = Math.max(24, baseWidthPx * layer.scale)
  const heightPx = Math.max(24, widthPx / aspect)
  const centerXPx = stageFrameMetrics.value.width * layer.x
  const centerYPx = stageFrameMetrics.value.height * layer.y

  return {
    widthPx,
    heightPx,
    centerXPx,
    centerYPx,
    overlayStyle: {
      left: `${centerXPx - widthPx / 2}px`,
      top: `${centerYPx - heightPx / 2}px`,
      width: `${widthPx}px`,
      height: `${heightPx}px`
    }
  }
}

const activeTransformBounds = computed(() =>
  transformEditingLayer.value ? getVisualLayerBounds(transformEditingLayer.value) : null
)

const portraitAutosaveSignature = computed(() =>
  JSON.stringify({
    entityId: entityDetail.value?.entity.id || '',
    entityName: characterNameInput.value,
    entitySummary: characterSummaryInput.value,
    title: characterTitleInput.value,
    basicInfo: {
      age: characterAgeLabelInput.value || characterAgeInput.value,
      height: characterHeightInput.value,
      gender: characterGenderInput.value,
      race: characterRaceIdInput.value,
      faction: characterFactionIdInput.value,
      nation: characterNationIdInput.value,
      birthplace: characterBirthplaceInput.value
    },
    activeMode: activeStudioMode.value,
    studiosByMode: toPlainIpcPayload(getPersistedStudiosByModeSnapshot())
  })
)

const fontOptions = FONT_OPTIONS

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const isAppResourceUrl = (value: string | undefined): boolean => String(value || '').startsWith('app-resource://')

const toPersistedStudioSnapshot = (value: PortraitStudioState): PortraitStudioState => ({
  mode: value.mode,
  background: {
    ...value.background,
    imageUrl: value.background.resourceUrl || (isAppResourceUrl(value.background.imageUrl) ? value.background.imageUrl : ''),
    resourceUrl: value.background.resourceUrl || (isAppResourceUrl(value.background.imageUrl) ? value.background.imageUrl : '')
  },
  character: {
    ...value.character,
    imageUrl: value.character.resourceUrl || (isAppResourceUrl(value.character.imageUrl) ? value.character.imageUrl : ''),
    resourceUrl: value.character.resourceUrl || (isAppResourceUrl(value.character.imageUrl) ? value.character.imageUrl : '')
  },
  textBlocks: value.textBlocks.map((block) => ({
    ...block,
    rect: { ...block.rect }
  }))
})

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

const parseDataUrl = (
  value: string
): {
  mimeType: string
  buffer: ArrayBuffer
  fileName: string
} | null => {
  const match = /^data:([^;]+);base64,(.+)$/u.exec(value)
  if (!match) return null
  const mimeType = match[1] || 'application/octet-stream'
  const extension =
    mimeType === 'image/png'
      ? 'png'
      : mimeType === 'image/jpeg'
        ? 'jpg'
        : mimeType === 'image/webp'
          ? 'webp'
          : mimeType === 'image/svg+xml'
            ? 'svg'
            : 'bin'
  return {
    mimeType,
    buffer: base64ToArrayBuffer(match[2]),
    fileName: `embedded.${extension}`
  }
}

const readBinaryFromSourceUrl = async (
  sourceUrl: string
): Promise<{
  fileName: string
  mimeType?: string
  data: ArrayBuffer
}> => {
  const dataUrl = parseDataUrl(sourceUrl)
  if (dataUrl) {
    return {
      fileName: dataUrl.fileName,
      mimeType: dataUrl.mimeType,
      data: dataUrl.buffer
    }
  }
  if (isAppResourceUrl(sourceUrl)) {
    return window.api.readResourceBinary(sourceUrl)
  }
  const response = await fetch(sourceUrl)
  if (!response.ok) {
    throw new Error('无法读取图层资源')
  }
  const blob = await response.blob()
  return {
    fileName: sourceUrl.split('/').pop() || 'resource.bin',
    mimeType: blob.type || undefined,
    data: await blob.arrayBuffer()
  }
}

const guessAssetFileName = (assetId: PortraitDocumentAssetId, sourceUrl: string, mimeType: string): string => {
  if (isAppResourceUrl(sourceUrl)) {
    const pathPart = sourceUrl.split('/').pop()
    if (pathPart) return decodeURIComponent(pathPart)
  }
  if (mimeType === 'image/png') return `${assetId}.png`
  if (mimeType === 'image/webp') return `${assetId}.webp`
  if (mimeType === 'image/jpeg') return `${assetId}.jpg`
  if (mimeType === 'image/svg+xml') return `${assetId}.svg`
  return `${assetId}.bin`
}

const buildPortraitDocumentAsset = async (
  assetId: PortraitDocumentAssetId,
  layer: VisualLayerState
): Promise<PortraitDocumentImageAsset | null> => {
  const sourceUrl = layer.resourceUrl || layer.imageUrl
  if (!sourceUrl) return null
  const binary = await readBinaryFromSourceUrl(sourceUrl)
  const buffer = binary.data
  const mimeType = binary.mimeType || 'application/octet-stream'
  return {
    assetId,
    kind: 'image',
    fileName: guessAssetFileName(assetId, binary.fileName || sourceUrl, mimeType),
    mimeType,
    width: layer.width,
    height: layer.height,
    byteLength: buffer.byteLength,
    dataBase64: arrayBufferToBase64(buffer),
    resourceUrl: layer.resourceUrl || (isAppResourceUrl(layer.imageUrl) ? layer.imageUrl : undefined)
  }
}

const createPortraitDocument = async (
  studiosSnapshot: PortraitStudiosByMode,
  activeMode: StageMode
): Promise<PortraitDocument> => {
  const assetsEntries = await Promise.all([
    buildPortraitDocumentAsset(DOCUMENT_ASSET_IDS.portrait.background, studiosSnapshot.portrait.background),
    buildPortraitDocumentAsset(DOCUMENT_ASSET_IDS.portrait.character, studiosSnapshot.portrait.character),
    buildPortraitDocumentAsset(DOCUMENT_ASSET_IDS.landscape.background, studiosSnapshot.landscape.background),
    buildPortraitDocumentAsset(DOCUMENT_ASSET_IDS.landscape.character, studiosSnapshot.landscape.character)
  ])
  const assets: PortraitDocument['assets'] = {}
  for (const asset of assetsEntries) {
    if (asset) assets[asset.assetId] = asset
  }

  return {
    format: PORTRAIT_DOCUMENT_FORMAT,
    version: PORTRAIT_DOCUMENT_VERSION,
    savedAt: new Date().toISOString(),
    entity: {
      worldId: worldId.value || undefined,
      entityId: entityId.value || undefined,
      name: characterNameInput.value || entityDetail.value?.entity.name || ''
    },
    activeMode,
    assets,
    canvases: {
      portrait: {
        mode: 'portrait',
        ratio: '9:16',
        background: {
          assetId: assets.portrait_background ? 'portrait_background' : null,
          x: studiosSnapshot.portrait.background.x,
          y: studiosSnapshot.portrait.background.y,
          scale: studiosSnapshot.portrait.background.scale,
          width: studiosSnapshot.portrait.background.width,
          height: studiosSnapshot.portrait.background.height,
          resourceUrl: studiosSnapshot.portrait.background.resourceUrl
        },
        character: {
          assetId: assets.portrait_character ? 'portrait_character' : null,
          x: studiosSnapshot.portrait.character.x,
          y: studiosSnapshot.portrait.character.y,
          scale: studiosSnapshot.portrait.character.scale,
          width: studiosSnapshot.portrait.character.width,
          height: studiosSnapshot.portrait.character.height,
          resourceUrl: studiosSnapshot.portrait.character.resourceUrl
        },
        textBlocks: studiosSnapshot.portrait.textBlocks
      },
      landscape: {
        mode: 'landscape',
        ratio: '16:9',
        background: {
          assetId: assets.landscape_background ? 'landscape_background' : null,
          x: studiosSnapshot.landscape.background.x,
          y: studiosSnapshot.landscape.background.y,
          scale: studiosSnapshot.landscape.background.scale,
          width: studiosSnapshot.landscape.background.width,
          height: studiosSnapshot.landscape.background.height,
          resourceUrl: studiosSnapshot.landscape.background.resourceUrl
        },
        character: {
          assetId: assets.landscape_character ? 'landscape_character' : null,
          x: studiosSnapshot.landscape.character.x,
          y: studiosSnapshot.landscape.character.y,
          scale: studiosSnapshot.landscape.character.scale,
          width: studiosSnapshot.landscape.character.width,
          height: studiosSnapshot.landscape.character.height,
          resourceUrl: studiosSnapshot.landscape.character.resourceUrl
        },
        textBlocks: studiosSnapshot.landscape.textBlocks
      },
    }
  }
}

const dataUrlFromAsset = (asset: PortraitDocumentImageAsset): string =>
  `data:${asset.mimeType};base64,${asset.dataBase64}`

const compressPortraitDocumentText = async (text: string): Promise<ArrayBuffer> => {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return await new Response(stream).arrayBuffer()
}

const decodePortraitDocumentBuffer = async (buffer: ArrayBuffer): Promise<string> => {
  try {
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))
    return await new Response(stream).text()
  } catch {
    return new TextDecoder().decode(buffer)
  }
}

const isPortraitDocument = (value: unknown): value is PortraitDocument => {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as PortraitDocument).format === PORTRAIT_DOCUMENT_FORMAT &&
      (value as PortraitDocument).version === PORTRAIT_DOCUMENT_VERSION &&
      (value as PortraitDocument).canvases?.portrait &&
      (value as PortraitDocument).canvases?.landscape
  )
}

const loadPortraitDocumentFromResource = async (
  resourceUrl: string
): Promise<{ studiosByMode: PortraitStudiosByMode; activeMode: StageMode } | null> => {
  const encoded = isAppResourceUrl(resourceUrl)
    ? (await window.api.readResourceBinary(resourceUrl)).data
    : await fetch(resourceUrl).then(async (response) => {
        if (!response.ok) throw new Error('读取立绘工程失败')
        return response.arrayBuffer()
      })
  const documentText = await decodePortraitDocumentBuffer(encoded)
  const documentData = JSON.parse(documentText) as unknown
  if (!isPortraitDocument(documentData)) return null

  return {
    activeMode: documentData.activeMode === 'landscape' ? 'landscape' : 'portrait',
    studiosByMode: {
      portrait: normalizeStudio({
        mode: 'portrait',
        background: {
          imageUrl: documentData.canvases.portrait.background.assetId
            ? dataUrlFromAsset(documentData.assets[documentData.canvases.portrait.background.assetId]!)
            : '',
          resourceUrl:
            documentData.assets[documentData.canvases.portrait.background.assetId || 'portrait_background']
              ?.resourceUrl || '',
          x: documentData.canvases.portrait.background.x,
          y: documentData.canvases.portrait.background.y,
          scale: documentData.canvases.portrait.background.scale,
          width:
            documentData.assets[documentData.canvases.portrait.background.assetId || 'portrait_background']
              ?.width ?? documentData.canvases.portrait.background.width,
          height:
            documentData.assets[documentData.canvases.portrait.background.assetId || 'portrait_background']
              ?.height ?? documentData.canvases.portrait.background.height
        },
        character: {
          imageUrl: documentData.canvases.portrait.character.assetId
            ? dataUrlFromAsset(documentData.assets[documentData.canvases.portrait.character.assetId]!)
            : '',
          resourceUrl:
            documentData.assets[documentData.canvases.portrait.character.assetId || 'portrait_character']
              ?.resourceUrl || '',
          x: documentData.canvases.portrait.character.x,
          y: documentData.canvases.portrait.character.y,
          scale: documentData.canvases.portrait.character.scale,
          width:
            documentData.assets[documentData.canvases.portrait.character.assetId || 'portrait_character']
              ?.width ?? documentData.canvases.portrait.character.width,
          height:
            documentData.assets[documentData.canvases.portrait.character.assetId || 'portrait_character']
              ?.height ?? documentData.canvases.portrait.character.height
        },
        textBlocks: documentData.canvases.portrait.textBlocks.map((block) => ({
          ...block,
          fieldKey: AVAILABLE_FIELD_ORDER.includes(block.fieldKey as PortraitFieldKey)
            ? (block.fieldKey as PortraitFieldKey)
            : 'name'
        }))
      }),
      landscape: normalizeStudio({
        mode: 'landscape',
        background: {
          imageUrl: documentData.canvases.landscape.background.assetId
            ? dataUrlFromAsset(documentData.assets[documentData.canvases.landscape.background.assetId]!)
            : '',
          resourceUrl:
            documentData.assets[documentData.canvases.landscape.background.assetId || 'landscape_background']
              ?.resourceUrl || '',
          x: documentData.canvases.landscape.background.x,
          y: documentData.canvases.landscape.background.y,
          scale: documentData.canvases.landscape.background.scale,
          width:
            documentData.assets[documentData.canvases.landscape.background.assetId || 'landscape_background']
              ?.width ?? documentData.canvases.landscape.background.width,
          height:
            documentData.assets[documentData.canvases.landscape.background.assetId || 'landscape_background']
              ?.height ?? documentData.canvases.landscape.background.height
        },
        character: {
          imageUrl: documentData.canvases.landscape.character.assetId
            ? dataUrlFromAsset(documentData.assets[documentData.canvases.landscape.character.assetId]!)
            : '',
          resourceUrl:
            documentData.assets[documentData.canvases.landscape.character.assetId || 'landscape_character']
              ?.resourceUrl || '',
          x: documentData.canvases.landscape.character.x,
          y: documentData.canvases.landscape.character.y,
          scale: documentData.canvases.landscape.character.scale,
          width:
            documentData.assets[documentData.canvases.landscape.character.assetId || 'landscape_character']
              ?.width ?? documentData.canvases.landscape.character.width,
          height:
            documentData.assets[documentData.canvases.landscape.character.assetId || 'landscape_character']
              ?.height ?? documentData.canvases.landscape.character.height
        },
        textBlocks: documentData.canvases.landscape.textBlocks.map((block) => ({
          ...block,
          fieldKey: AVAILABLE_FIELD_ORDER.includes(block.fieldKey as PortraitFieldKey)
            ? (block.fieldKey as PortraitFieldKey)
            : 'name'
        }))
      })
    }
  }
}

const normalizeStudio = (value: Partial<PortraitStudioState> | undefined): PortraitStudioState => {
  const defaults = DEFAULT_STUDIO_STATE()
  return {
    mode: value?.mode === 'landscape' ? 'landscape' : defaults.mode,
    background: {
      imageUrl: String(value?.background?.imageUrl || ''),
      resourceUrl: String(value?.background?.resourceUrl || ''),
      x: clamp(Number(value?.background?.x ?? defaults.background.x), 0, 1),
      y: clamp(Number(value?.background?.y ?? defaults.background.y), 0, 1),
      scale: clamp(Number(value?.background?.scale ?? defaults.background.scale), 0.4, 2.4),
      width: typeof value?.background?.width === 'number' ? value.background.width : undefined,
      height: typeof value?.background?.height === 'number' ? value.background.height : undefined
    },
    character: {
      imageUrl: String(value?.character?.imageUrl || ''),
      resourceUrl: String(value?.character?.resourceUrl || ''),
      x: clamp(Number(value?.character?.x ?? defaults.character.x), 0, 1),
      y: clamp(Number(value?.character?.y ?? defaults.character.y), 0, 1),
      scale: clamp(Number(value?.character?.scale ?? defaults.character.scale), 0.4, 2.4),
      width: typeof value?.character?.width === 'number' ? value.character.width : undefined,
      height: typeof value?.character?.height === 'number' ? value.character.height : undefined
    },
    textBlocks: Array.isArray(value?.textBlocks)
      ? value!.textBlocks
          .map((item) => ({
            id: String(item?.id || `block_${Math.random().toString(36).slice(2, 10)}`),
            fieldKey: AVAILABLE_FIELD_ORDER.includes(item?.fieldKey as PortraitFieldKey)
              ? (item?.fieldKey as PortraitFieldKey)
              : 'name',
            rect: {
              x: clamp(Number(item?.rect?.x ?? 0.16), 0, 1),
              y: clamp(Number(item?.rect?.y ?? 0.14), 0, 1),
              w: clamp(Number(item?.rect?.w ?? 0.32), 0.12, 0.72),
              h: clamp(Number(item?.rect?.h ?? 0.14), 0.08, 0.36)
            },
            fontFamily: String(item?.fontFamily || FONT_OPTIONS[0].value),
            fontWeight: (item?.fontWeight as PortraitTextBlock['fontWeight']) || '600',
            fontStyle: (item?.fontStyle as PortraitTextBlock['fontStyle']) || 'normal',
            textAlign: (item?.textAlign as PortraitTextBlock['textAlign']) || 'left',
            textColor: String(item?.textColor || '#111111'),
            boxStyle: (item?.boxStyle as BoxStyle) || 'frosted'
          }))
          .slice(0, AVAILABLE_FIELD_ORDER.length)
      : []
  }
}

const cloneStudio = (value: PortraitStudioState): PortraitStudioState => ({
  mode: value.mode,
  background: { ...value.background },
  character: { ...value.character },
  textBlocks: value.textBlocks.map((block) => ({
    ...block,
    rect: { ...block.rect }
  }))
})

const syncCurrentStudioIntoModeStore = (): void => {
  studiosByMode.value[activeStudioMode.value] = cloneStudio(studio.value)
}

const getPersistedStudiosByModeSnapshot = (): PortraitStudiosByMode => {
  const drafts = {
    portrait: cloneStudio(studiosByMode.value.portrait),
    landscape: cloneStudio(studiosByMode.value.landscape)
  }
  drafts[activeStudioMode.value] = cloneStudio(studio.value)
  drafts.portrait.mode = 'portrait'
  drafts.landscape.mode = 'landscape'
  return {
    portrait: toPersistedStudioSnapshot(drafts.portrait),
    landscape: toPersistedStudioSnapshot(drafts.landscape)
  }
}

const switchStudioMode = (nextMode: StageMode): void => {
  if (activeStudioMode.value === nextMode) return
  syncCurrentStudioIntoModeStore()
  activeStudioMode.value = nextMode
  studio.value = cloneStudio(studiosByMode.value[nextMode])
  transformEditingLayer.value = null
  selectedBlockId.value = studio.value.textBlocks[0]?.id ?? null
}

const syncPortraitFromDetail = async (): Promise<void> => {
  const profile = getCharacterComponentByType<CharacterPortraitStudioProfileData>(entityDetail.value, 'character_profile')
  const demographic = getCharacterComponentByType<CharacterDemographicData>(entityDetail.value, 'character_demographic')
  const combinedPortraitDocument =
    profile?.data?.portraitDocumentResourceUrl
      ? await loadPortraitDocumentFromResource(profile.data.portraitDocumentResourceUrl).catch(() => null)
      : null
  const storedStudiosByMode = profile?.data?.portraitStudiosByMode
  const normalizedStudiosByMode: PortraitStudiosByMode = {
    portrait: normalizeStudio(
      combinedPortraitDocument?.studiosByMode.portrait ?? storedStudiosByMode?.portrait ?? profile?.data?.portraitStudio
    ),
    landscape: normalizeStudio(combinedPortraitDocument?.studiosByMode.landscape ?? storedStudiosByMode?.landscape)
  }

  if (!normalizedStudiosByMode.portrait.character.imageUrl && profile?.data?.portraitResourceUrl) {
    normalizedStudiosByMode.portrait.character.imageUrl = String(profile.data.portraitResourceUrl)
    normalizedStudiosByMode.portrait.character.resourceUrl = String(profile.data.portraitResourceUrl)
  }
  if (profile?.data?.portraitTransform) {
    normalizedStudiosByMode.portrait.character.scale = clamp(
      Number(profile.data.portraitTransform.scale ?? normalizedStudiosByMode.portrait.character.scale),
      0.4,
      2.4
    )
    normalizedStudiosByMode.portrait.character.x = clamp(
      0.5 + Number(profile.data.portraitTransform.offsetX ?? 0) / 100,
      0,
      1
    )
    normalizedStudiosByMode.portrait.character.y = clamp(
      0.56 + Number(profile.data.portraitTransform.offsetY ?? 0) / 100,
      0,
      1
    )
  }

  characterNameInput.value = String(entityDetail.value?.entity.name || '')
  characterTitleInput.value = String(profile?.data?.title || entityDetail.value?.entity.title || '')
  characterSummaryInput.value = String(profile?.data?.summary || entityDetail.value?.entity.summary || '')
  characterAgeInput.value = null
  characterAgeLabelInput.value = getCharacterBasicInfoValue(demographic?.data, 'age')
  characterHeightInput.value = getCharacterBasicInfoValue(demographic?.data, 'height')
  characterGenderInput.value = getCharacterBasicInfoValue(demographic?.data, 'gender')
  characterRaceIdInput.value = getCharacterBasicInfoValue(demographic?.data, 'race')
  characterFactionIdInput.value = getCharacterBasicInfoValue(demographic?.data, 'faction')
  characterNationIdInput.value = getCharacterBasicInfoValue(demographic?.data, 'nation')
  characterBirthplaceInput.value = getCharacterBasicInfoValue(demographic?.data, 'birthplace')
  studiosByMode.value = {
    portrait: cloneStudio(normalizedStudiosByMode.portrait),
    landscape: cloneStudio(normalizedStudiosByMode.landscape)
  }
  activeStudioMode.value =
    combinedPortraitDocument?.activeMode === 'landscape' || profile?.data?.portraitActiveMode === 'landscape'
      ? 'landscape'
      : 'portrait'
  studio.value = cloneStudio(studiosByMode.value[activeStudioMode.value])
  selectedFieldKey.value = 'name'
  selectedBlockId.value = studio.value.textBlocks[0]?.id ?? null
  fieldFormValue.value = characterNameInput.value
  lastSavedPortraitSignature = portraitAutosaveSignature.value
  portraitSaveState.value = 'saved'
}

const loadEntityDetail = async (): Promise<void> => {
  if (!entityId.value) {
    entityDetail.value = null
    return
  }

  syncingFromDetail = true
  try {
    entityDetail.value = await worldbuildingClientService.getEntityDetail(entityId.value)
    await syncPortraitFromDetail()
  } finally {
    syncingFromDetail = false
  }
}

const navigateToWorldEditor = async (): Promise<void> => {
  if (!worldId.value) return
  await savePortrait(true).catch(() => undefined)
  await router.push({ name: 'WorldEditor', params: { worldId: worldId.value } })
}

const navigateToEntityEditor = async (): Promise<void> => {
  await savePortrait(true).catch(() => undefined)
  await router.push({ name: 'CharacterProfileEditor', params: { worldId: worldId.value, entityId: entityId.value } })
}

const savePortrait = async (force = false): Promise<void> => {
  if (!entityDetail.value) return
  if (!force && portraitAutosaveSignature.value === lastSavedPortraitSignature) return
  if (savingPortrait.value) {
    portraitSaveQueued = true
    return
  }

  const profile = getCharacterComponentByType<CharacterPortraitStudioProfileData>(entityDetail.value, 'character_profile')
  const demographic = getCharacterComponentByType<CharacterDemographicData>(entityDetail.value, 'character_demographic')
  const persistedStudios = getPersistedStudiosByModeSnapshot()
  const previousPortraitDocumentUrl = String(profile?.data?.portraitDocumentResourceUrl || '')
  let portraitDocumentResourceUrl = previousPortraitDocumentUrl

  const portraitDir = `portrait-documents/${entityId.value || 'draft'}`
  const hasPortraitContent = (mode: StageMode): boolean =>
    Boolean(
      persistedStudios[mode].background.imageUrl ||
        persistedStudios[mode].character.imageUrl ||
        persistedStudios[mode].textBlocks.length
    )

  if (hasPortraitContent('portrait') || hasPortraitContent('landscape')) {
    const portraitDocument = await createPortraitDocument(persistedStudios, activeStudioMode.value)
    const payload = await compressPortraitDocumentText(JSON.stringify(portraitDocument, null, 2))
    const uploadedPortraitDocument = await window.api.uploadResourceData({
      fileName: `portrait.${PORTRAIT_DOCUMENT_FILE_EXTENSION}`,
      mimeType: 'application/x-fmlrp',
      relativeDir: portraitDir,
      data: payload
    })
    portraitDocumentResourceUrl = uploadedPortraitDocument.resourceUrl
  } else if (portraitDocumentResourceUrl) {
    await window.api.deleteFile(portraitDocumentResourceUrl).catch(() => undefined)
    portraitDocumentResourceUrl = ''
  }

  const entityInput: UpdateWorldEntityInput = {
    entityId: entityDetail.value.entity.id,
    name: characterNameInput.value || entityDetail.value.entity.name,
    title: characterTitleInput.value,
    summary: characterSummaryInput.value
  }

  const profileInput: UpsertWorldEntityComponentInput<CharacterPortraitStudioProfileData> = {
    entityId: entityDetail.value.entity.id,
    componentType: 'character_profile',
    schemaVersion: profile?.schemaVersion ?? 1,
    data: {
      ...toPlainIpcPayload(profile?.data ?? {}),
      title: characterTitleInput.value,
      summary: characterSummaryInput.value,
      portraitResourceUrl: persistedStudios.portrait.character.imageUrl,
      portraitDocumentResourceUrl,
      portraitDocumentResourceUrls: {
        portrait: '',
        landscape: ''
      },
      portraitTransform: {
        offsetX: Number(((persistedStudios.portrait.character.x - 0.5) * 100).toFixed(3)),
        offsetY: Number(((persistedStudios.portrait.character.y - 0.56) * 100).toFixed(3)),
        scale: Number(persistedStudios.portrait.character.scale.toFixed(3))
      },
      portraitStudio: toPlainIpcPayload(persistedStudios[activeStudioMode.value]),
      portraitStudiosByMode: toPlainIpcPayload(persistedStudios),
      portraitActiveMode: activeStudioMode.value
    }
  }

  const demographicInput: UpsertWorldEntityComponentInput<CharacterDemographicData> = {
    entityId: entityDetail.value.entity.id,
    componentType: 'character_demographic',
    schemaVersion: 2,
    data: {
      basicInfo: updateCharacterBasicInfoValues(demographic?.data?.basicInfo, {
        name: characterNameInput.value,
        age: characterAgeLabelInput.value || characterAgeInput.value,
        height: characterHeightInput.value,
        gender: characterGenderInput.value,
        race: characterRaceIdInput.value,
        faction: characterFactionIdInput.value,
        nation: characterNationIdInput.value,
        birthplace: characterBirthplaceInput.value
      })
    }
  }

  savingPortrait.value = true
  portraitSaveState.value = 'saving'
  const signatureAtSave = portraitAutosaveSignature.value

  try {
    await worldbuildingClientService.updateEntity(entityInput)
    await worldbuildingClientService.upsertComponent(profileInput)
    await worldbuildingClientService.upsertComponent(demographicInput)
    lastSavedPortraitSignature = signatureAtSave
    portraitSaveState.value = 'saved'
  } catch (error) {
    portraitSaveState.value = 'error'
    throw error
  } finally {
    savingPortrait.value = false
    if (portraitSaveQueued || portraitAutosaveSignature.value !== lastSavedPortraitSignature) {
      portraitSaveQueued = false
      schedulePortraitAutosave(120)
    }
  }
}

const clearPortraitAutosave = (): void => {
  if (portraitAutosaveTimer) {
    clearTimeout(portraitAutosaveTimer)
    portraitAutosaveTimer = null
  }
}

const schedulePortraitAutosave = (delay = 700): void => {
  if (syncingFromDetail || !entityDetail.value) return
  clearPortraitAutosave()
  if (portraitAutosaveSignature.value === lastSavedPortraitSignature) return
  portraitSaveState.value = 'idle'
  portraitAutosaveTimer = setTimeout(() => {
    portraitAutosaveTimer = null
    void savePortrait()
  }, delay)
}

const getFieldValue = (key: PortraitFieldKey): string => {
  switch (key) {
    case 'name':
      return characterNameInput.value
    case 'title':
      return characterTitleInput.value
    case 'summary':
      return characterSummaryInput.value
    case 'age':
      return characterAgeLabelInput.value || (characterAgeInput.value == null ? '' : String(characterAgeInput.value))
    case 'gender':
      return characterGenderInput.value
    case 'race':
      return characterRaceIdInput.value
    case 'faction':
      return characterFactionIdInput.value
    case 'nation':
      return characterNationIdInput.value
    case 'birthplace':
      return characterBirthplaceInput.value
    case 'height':
      return characterHeightInput.value
  }
}

const setFieldValue = (key: PortraitFieldKey, value: string): void => {
  switch (key) {
    case 'name':
      characterNameInput.value = value
      break
    case 'title':
      characterTitleInput.value = value
      break
    case 'summary':
      characterSummaryInput.value = value
      break
    case 'age':
      characterAgeLabelInput.value = value
      break
    case 'gender':
      characterGenderInput.value = value
      break
    case 'race':
      characterRaceIdInput.value = value
      break
    case 'faction':
      characterFactionIdInput.value = value
      break
    case 'nation':
      characterNationIdInput.value = value
      break
    case 'birthplace':
      characterBirthplaceInput.value = value
      break
    case 'height':
      characterHeightInput.value = value
      break
  }
}

const selectField = (key: PortraitFieldKey): void => {
  selectedFieldKey.value = key
  fieldFormValue.value = getFieldValue(key)
}

const applyFieldForm = (): void => {
  if (!selectedFieldKey.value) return
  setFieldValue(selectedFieldKey.value, fieldFormValue.value)
}

const isFieldUsed = (fieldKey: PortraitFieldKey): boolean =>
  studio.value.textBlocks.some((block) => block.fieldKey === fieldKey)

const getFieldLabel = (fieldKey: PortraitFieldKey): string =>
  availableFields.value.find((field) => field.key === fieldKey)?.label || fieldKey

const getBlockContent = (block: PortraitTextBlock): string => getFieldValue(block.fieldKey)

const createTextBlock = (fieldKey: PortraitFieldKey, x: number, y: number): PortraitTextBlock => {
  const defaults = studio.value.mode === 'portrait' ? { w: 0.34, h: 0.14 } : { w: 0.26, h: 0.18 }
  return {
    id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    fieldKey,
    rect: {
      x: clamp(x, 0.04, 0.96),
      y: clamp(y, 0.04, 0.96),
      w: defaults.w,
      h: defaults.h
    },
    fontFamily: FONT_OPTIONS[0].value,
    fontWeight: '600',
    fontStyle: 'normal',
    textAlign: 'left',
    textColor: '#111111',
    boxStyle: 'frosted'
  }
}

const addFieldToStage = (fieldKey: PortraitFieldKey, x = 0.18, y = 0.16): void => {
  const existing = studio.value.textBlocks.find((block) => block.fieldKey === fieldKey)
  if (existing) {
    selectedBlockId.value = existing.id
    selectedFieldKey.value = fieldKey
    fieldFormValue.value = getFieldValue(fieldKey)
    return
  }
  const block = createTextBlock(fieldKey, x, y)
  studio.value.textBlocks.push(block)
  selectedBlockId.value = block.id
  selectField(fieldKey)
}

const addSelectedFieldToStage = (): void => {
  if (selectedFieldKey.value) addFieldToStage(selectedFieldKey.value)
}

const removeSelectedBlock = (): void => {
  if (!selectedBlockId.value) return
  studio.value.textBlocks = studio.value.textBlocks.filter((block) => block.id !== selectedBlockId.value)
  selectedBlockId.value = null
}

const clearBlockSelection = (): void => {
  selectedBlockId.value = null
}

const selectVisualLayer = (layer: VisualLayerKey): void => {
  selectedVisualLayer.value = layer
  selectedBlockId.value = null
}

const selectBlock = (blockId: string): void => {
  selectedBlockId.value = blockId
  const block = studio.value.textBlocks.find((item) => item.id === blockId)
  if (block) selectField(block.fieldKey)
}

const toPercentLabel = (value: number): string => `${Math.round(value * 100)}%`

const getVisualLayerStyle = (layer: VisualLayerState) => ({
  left: `${layer.x * 100}%`,
  top: `${layer.y * 100}%`,
  transform: `translate(-50%, -50%) scale(${layer.scale})`
})

const getTextBlockStyle = (block: PortraitTextBlock) => ({
  left: `${block.rect.x * 100}%`,
  top: `${block.rect.y * 100}%`,
  width: `${block.rect.w * 100}%`,
  minHeight: `${block.rect.h * 100}%`,
  '--font-ratio': String(block.rect.h),
  '--text-color': block.textColor,
  fontFamily: block.fontFamily,
  fontWeight: block.fontWeight,
  fontStyle: block.fontStyle,
  textAlign: block.textAlign
})

const getInteractiveStageRect = (): DOMRect | null => {
  const host = stageFrameRef.value ?? stageViewportRef.value
  if (!host) return null
  const rect = host.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  return rect
}

const getStagePoint = (event: PointerEvent | DragEvent): { x: number; y: number } | null => {
  const rect = getInteractiveStageRect()
  if (!rect) return null
  const clientX = event.clientX
  const clientY = event.clientY
  return {
    x: clamp((clientX - rect.left) / rect.width, 0, 1),
    y: clamp((clientY - rect.top) / rect.height, 0, 1)
  }
}

const syncStageViewportSize = (): void => {
  const host = stageViewportRef.value
  if (!host) return
  const rect = host.getBoundingClientRect()
  stageViewportSize.value = {
    width: rect.width,
    height: rect.height
  }
}

const handleFieldDragStart = (event: DragEvent, fieldKey: PortraitFieldKey): void => {
  if (!event.dataTransfer) return
  event.dataTransfer.setData('text/plain', fieldKey)
  event.dataTransfer.effectAllowed = 'copy'
  selectField(fieldKey)
}

const handleStageDrop = (event: DragEvent): void => {
  const fieldKey = event.dataTransfer?.getData('text/plain') as PortraitFieldKey
  if (!fieldKey) return
  const point = getStagePoint(event)
  if (!point) return
  addFieldToStage(fieldKey, point.x, point.y)
}

const startTransformMove = (event: PointerEvent): void => {
  if (!transformEditingLayer.value) return
  const layerState = studio.value[transformEditingLayer.value]
  stageDragState = {
    kind: 'visual-move',
    layer: transformEditingLayer.value,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    originX: layerState.x,
    originY: layerState.y
  }
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
}

const startTransformScale = (
  _handle: (typeof TRANSFORM_HANDLES)[number]['key'],
  event: PointerEvent
): void => {
  if (!transformEditingLayer.value) return
  const bounds = getVisualLayerBounds(transformEditingLayer.value)
  const frameRect = getInteractiveStageRect()
  if (!bounds || !frameRect) return

  const centerClientX = frameRect.left + bounds.centerXPx
  const centerClientY = frameRect.top + bounds.centerYPx
  const startDistance = Math.max(
    12,
    Math.hypot(event.clientX - centerClientX, event.clientY - centerClientY)
  )
  stageDragState = {
    kind: 'visual-scale',
    layer: transformEditingLayer.value,
    pointerId: event.pointerId,
    originScale: studio.value[transformEditingLayer.value].scale,
    centerClientX,
    centerClientY,
    startDistance
  }
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
}

const startTextBlockDrag = (blockId: string, event: PointerEvent): void => {
  const block = studio.value.textBlocks.find((item) => item.id === blockId)
  if (!block) return
  selectedBlockId.value = blockId
  selectField(block.fieldKey)
  stageDragState = {
    kind: 'text',
    blockId,
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    originX: block.rect.x,
    originY: block.rect.y
  }
  ;(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId)
}

const handleStagePointerMove = (event: PointerEvent): void => {
  if (!stageDragState || stageDragState.pointerId !== event.pointerId) return
  const dragState = stageDragState
  const rect = getInteractiveStageRect()
  if (!rect) return

  if (dragState.kind === 'visual-move') {
    const deltaX = rect.width ? (event.clientX - dragState.startClientX) / rect.width : 0
    const deltaY = rect.height ? (event.clientY - dragState.startClientY) / rect.height : 0
    const target = studio.value[dragState.layer]
    target.x = clamp(dragState.originX + deltaX, 0, 1)
    target.y = clamp(dragState.originY + deltaY, 0, 1)
    return
  }

  if (dragState.kind === 'visual-scale') {
    const current = studio.value[dragState.layer]
    const currentDistance = Math.max(
      12,
      Math.hypot(event.clientX - dragState.centerClientX, event.clientY - dragState.centerClientY)
    )
    const ratio = currentDistance / dragState.startDistance
    current.scale = clamp(Number((dragState.originScale * ratio).toFixed(3)), 0.4, 2.4)
    return
  }

  const block = studio.value.textBlocks.find((item) => item.id === dragState.blockId)
  if (!block) return
  const deltaX = rect.width ? (event.clientX - dragState.startClientX) / rect.width : 0
  const deltaY = rect.height ? (event.clientY - dragState.startClientY) / rect.height : 0
  block.rect.x = clamp(dragState.originX + deltaX, 0, 1)
  block.rect.y = clamp(dragState.originY + deltaY, 0, 1)
}

const endStageInteraction = (): void => {
  stageDragState = null
}

const handleGlobalPointerUp = (event: PointerEvent): void => {
  if (!stageDragState || stageDragState.pointerId !== event.pointerId) return
  endStageInteraction()
}

const handleStageWheel = (event: WheelEvent): void => {
  if (!transformEditingLayer.value) return
  const current = studio.value[transformEditingLayer.value]
  const nextScale = event.deltaY < 0 ? current.scale + 0.05 : current.scale - 0.05
  current.scale = clamp(Number(nextScale.toFixed(3)), 0.4, 2.4)
}

const pickLayerImage = async (layer: VisualLayerKey): Promise<void> => {
  try {
    const picked = await window.api.pickImageAsset()
    const uploaded = await window.api.uploadImageAsset(picked.sourcePath)
    studio.value[layer].imageUrl = uploaded.resourceUrl
    studio.value[layer].resourceUrl = uploaded.resourceUrl
    studio.value[layer].width = uploaded.width
    studio.value[layer].height = uploaded.height
    selectedVisualLayer.value = layer
  } catch (error) {
    if (!isFilePickerCancelled(error)) {
      console.error(`Failed to pick ${layer} image`, error)
    }
  }
}

const clearSelectedVisualLayer = (): void => {
  if (!selectedVisualLayer.value) return
  studio.value[selectedVisualLayer.value].imageUrl = ''
  studio.value[selectedVisualLayer.value].resourceUrl = ''
  if (transformEditingLayer.value === selectedVisualLayer.value) {
    transformEditingLayer.value = null
  }
}

const resetSelectedVisualLayerTransform = (): void => {
  if (!selectedVisualLayer.value) return
  if (selectedVisualLayer.value === 'background') {
    studio.value.background = {
      imageUrl: studio.value.background.imageUrl,
      resourceUrl: studio.value.background.resourceUrl,
      x: 0.5,
      y: 0.5,
      scale: 1.08,
      width: studio.value.background.width,
      height: studio.value.background.height
    }
    return
  }
  studio.value.character = {
    imageUrl: studio.value.character.imageUrl,
    resourceUrl: studio.value.character.resourceUrl,
    x: 0.5,
    y: 0.56,
    scale: 1,
    width: studio.value.character.width,
    height: studio.value.character.height
  }
}

watch(selectedField, (value) => {
  fieldFormValue.value = value?.value || ''
})

watch(portraitAutosaveSignature, () => {
  schedulePortraitAutosave()
})

watch(
  () => studio.value.mode,
  () => {
    studio.value.textBlocks = studio.value.textBlocks.map((block) => ({
      ...block,
      rect: {
        ...block.rect,
        w: clamp(block.rect.w, 0.12, studio.value.mode === 'portrait' ? 0.72 : 0.62),
        h: clamp(block.rect.h, 0.08, studio.value.mode === 'portrait' ? 0.36 : 0.42)
      }
    }))
  }
)

watch(selectedVisualLayer, (nextLayer) => {
  if (transformEditingLayer.value && transformEditingLayer.value !== nextLayer) {
    transformEditingLayer.value = null
  }
})

onMounted(async () => {
  window.addEventListener('pointermove', handleStagePointerMove)
  window.addEventListener('pointerup', handleGlobalPointerUp)
  window.addEventListener('pointercancel', handleGlobalPointerUp)
  await loadEntityDetail()
  syncStageViewportSize()
  if (typeof ResizeObserver !== 'undefined' && stageViewportRef.value) {
    stageViewportObserver = new ResizeObserver(() => {
      syncStageViewportSize()
    })
    stageViewportObserver.observe(stageViewportRef.value)
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', handleStagePointerMove)
  window.removeEventListener('pointerup', handleGlobalPointerUp)
  window.removeEventListener('pointercancel', handleGlobalPointerUp)
  clearPortraitAutosave()
  stageDragState = null
  stageViewportObserver?.disconnect()
  stageViewportObserver = null
})

useKeyboardShortcut(
  {
    key: 's',
    ctrlOrMeta: true,
    preventDefault: true,
    enabled: () => Boolean(entityDetail.value) && !savingPortrait.value
  },
  async () => {
    clearPortraitAutosave()
    await savePortrait(true)
  }
)

useKeyboardShortcut(
  {
    key: 't',
    shift: true,
    preventDefault: true,
    enabled: () => Boolean(entityDetail.value)
  },
  () => {
    if (!selectedVisualLayer.value) return
    const currentLayer = studio.value[selectedVisualLayer.value]
    if (!currentLayer.imageUrl) return
    transformEditingLayer.value =
      transformEditingLayer.value === selectedVisualLayer.value ? null : selectedVisualLayer.value
  }
)

useKeyboardShortcut(
  {
    key: 'enter',
    preventDefault: true,
    enabled: () => {
      if (!transformEditingLayer.value) return false
      const active = document.activeElement
      return !(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement)
    }
  },
  () => {
    if (!transformEditingLayer.value) return
    endStageInteraction()
    transformEditingLayer.value = null
  }
)
</script>

<style scoped>
.portrait-editor-page {
  height: 100%;
  overflow: hidden;
  padding: 0;
  box-sizing: border-box;
  background:
    radial-gradient(circle at top left, rgba(15, 23, 42, 0.05), transparent 28%),
    linear-gradient(180deg, #ffffff 0%, #fbfbfb 100%);
  color: var(--wb-text-primary);
}

.topbar-links,
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.topbar-link {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 16px;
  border-radius: var(--wb-radius-pill);
  border: 1px solid var(--wb-panel-line);
  background: var(--wb-panel-bg);
  color: var(--wb-text-primary);
  text-decoration: none;
  box-shadow: var(--wb-shadow-card);
}

.topbar-link.subtle {
  color: var(--wb-text-secondary);
}

.icon-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  inline-size: 42px;
  block-size: 42px;
  border-radius: 999px;
  border: 1px solid var(--wb-panel-line);
  background: var(--wb-panel-bg);
  color: var(--wb-text-primary);
  text-decoration: none;
  box-shadow: var(--wb-shadow-card);
}

.icon-nav-btn.subtle {
  color: var(--wb-text-secondary);
}

.icon-nav-svg {
  inline-size: 18px;
  block-size: 18px;
}

.portrait-editor-shell {
  display: grid;
  grid-template-columns: 10% minmax(0, 74%) 16%;
  gap: 0;
  height: 100%;
  min-height: 0;
}

.panel {
  min-height: 0;
  padding: 22px;
  border: 1px solid var(--wb-panel-line);
  border-radius: 0;
  background: rgba(255, 255, 255, 0.98);
  box-shadow: none;
  backdrop-filter: blur(14px);
}

.panel-head {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 18px;
}

.panel-head.compact {
  align-items: flex-start;
}

.panel-head h1,
.panel-head h2 {
  margin: 6px 0 0;
  font-size: 24px;
  font-weight: 600;
}

.panel-head p {
  margin: 0;
  color: var(--wb-text-secondary);
  line-height: 1.6;
  font-size: 14px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--wb-text-tertiary);
}

.sidebar-panel,
.inspector-panel {
  display: flex;
  flex-direction: column;
  border-top: 0;
  border-bottom: 0;
}

.attribute-list {
  display: grid;
  gap: 8px;
  overflow: auto;
  padding: 10px;
  padding-bottom: 54px;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.attribute-list::-webkit-scrollbar {
  display: none;
}

.attribute-chip {
  display: grid;
  gap: 0;
  min-height: 56px;
  padding: 10px 8px;
  border-radius: var(--wb-radius-card);
  border: 1px solid var(--wb-panel-line);
  background: var(--wb-panel-strong);
  color: var(--wb-text-primary);
  text-align: center;
  place-items: center;
  cursor: grab;
  box-shadow: var(--wb-shadow-card);
}

.attribute-chip.active {
  border-color: var(--wb-panel-line-strong);
  background: #ffffff;
}

.attribute-chip.used {
  opacity: 0.62;
}

.attribute-chip-label {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
}

.sidebar-panel {
  overflow: hidden;
  border-left: 0;
  position: relative;
  padding: 0;
}

.sidebar-nav-shell {
  flex: none;
  height: 62px;
  padding: 0;
  border: 0;
}

.sidebar-nav {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px;
}

.attribute-list-shell {
  position: relative;
  flex: 1;
  min-height: 0;
}

.attribute-list-fade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 72px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 10px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.94) 58%, #ffffff 100%);
  pointer-events: none;
}

.attribute-list-fade-icon {
  width: 18px;
  height: 18px;
  color: var(--wb-text-tertiary);
  opacity: 0.9;
}

.inspector-panel {
  overflow: auto;
  border-right: 0;
}

.stage-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-top: 0;
  border-bottom: 0;
  padding: 0 10px 10px;
}

.stage-caption {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 10px;
  margin-bottom: 6px;
  color: var(--wb-text-tertiary);
  padding-top: 2px;
}

.stage-caption-label {
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.stage-caption-name {
  font-size: 13px;
  color: var(--wb-text-secondary);
}

.mode-switch {
  display: inline-flex;
  padding: 4px;
  border-radius: var(--wb-radius-pill);
  background: var(--wb-panel-muted);
  border: 1px solid var(--wb-panel-line);
}

.inspector-switch {
  inline-size: 100%;
}

.mode-switch-btn {
  flex: 1;
  min-width: 86px;
  min-height: 38px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--wb-radius-pill);
  background: transparent;
  color: var(--wb-text-secondary);
  cursor: pointer;
}

.mode-switch-btn.active {
  background: #111111;
  color: #ffffff;
}

.stage-viewport {
  display: grid;
  place-items: center;
  flex: 1;
  min-height: 0;
  padding: 0;
  border: 0;
  background: transparent;
  touch-action: none;
}

.stage-frame {
  position: relative;
  flex: none;
  border-radius: 26px;
  overflow: hidden;
  border: 1px solid rgba(17, 17, 17, 0.08);
  background: linear-gradient(180deg, #ffffff, #f6f6f6);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95);
  container-type: size;
}

.stage-layer {
  position: absolute;
  inset: 0;
  overflow: hidden;
  touch-action: none;
  cursor: pointer;
}

.stage-layer.selected {
  outline: 1px solid rgba(17, 17, 17, 0.22);
  outline-offset: -1px;
}

.stage-image {
  position: absolute;
  width: 100%;
  max-width: none;
  user-select: none;
  pointer-events: none;
  transform-origin: center center;
}

.stage-image-character {
  width: 72%;
}

.stage-layer-placeholder {
  position: absolute;
  inset: 14%;
  display: grid;
  place-items: center;
  border-radius: 22px;
  border: 1px dashed rgba(17, 17, 17, 0.12);
  color: var(--wb-text-tertiary);
  background: rgba(255, 255, 255, 0.35);
  font-size: 15px;
}

.stage-layer-placeholder.strong {
  inset: 12% 20%;
}

.stage-layer-text {
  z-index: 3;
  cursor: default;
}

.transform-overlay {
  position: absolute;
  z-index: 4;
  cursor: move;
  touch-action: none;
}

.transform-overlay-frame {
  position: absolute;
  inset: 0;
  border: 1px solid rgba(17, 17, 17, 0.46);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.72) inset;
}

.transform-overlay-crosshair {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 26px;
  height: 26px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.transform-overlay-crosshair::before,
.transform-overlay-crosshair::after {
  content: '';
  position: absolute;
  background: rgba(17, 17, 17, 0.38);
}

.transform-overlay-crosshair::before {
  left: 50%;
  top: 0;
  width: 1px;
  height: 100%;
  transform: translateX(-50%);
}

.transform-overlay-crosshair::after {
  left: 0;
  top: 50%;
  width: 100%;
  height: 1px;
  transform: translateY(-50%);
}

.transform-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  border: 1px solid rgba(17, 17, 17, 0.52);
  background: rgba(255, 255, 255, 0.95);
  transform: translate(-50%, -50%) rotate(45deg);
  padding: 0;
}

.transform-handle.handle-n,
.transform-handle.handle-s,
.transform-handle.handle-e,
.transform-handle.handle-w {
  width: 10px;
  height: 10px;
}

.text-block {
  position: absolute;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: flex-start;
  gap: 0.45em;
  padding: 0.9em 1em;
  border: 1px solid transparent;
  border-radius: 1.4em;
  background: transparent;
  color: var(--text-color);
  cursor: move;
  text-decoration: none;
  touch-action: none;
}

.text-block.selected {
  border-color: rgba(17, 17, 17, 0.22);
}

.text-block.box-none {
  background: rgba(255, 255, 255, 0.08);
}

.text-block.box-frosted {
  background: rgba(255, 255, 255, 0.38);
  backdrop-filter: blur(16px);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.65);
}

.text-block.box-fill {
  background: rgba(17, 17, 17, 0.08);
}

.text-block-label {
  font-size: calc(var(--font-ratio) * 11cqh);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--text-color) 60%, white);
  opacity: 0.72;
}

.text-block-content {
  font-size: calc(var(--font-ratio) * 24cqh);
  line-height: 1.18;
  word-break: break-word;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.inspector-group {
  justify-content: flex-start;
}

.toolbar-label {
  color: var(--wb-text-tertiary);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.toolbar-chip,
.action-btn {
  min-height: 38px;
  padding: 0 14px;
  border-radius: var(--wb-radius-pill);
  border: 1px solid var(--wb-panel-line);
  background: #ffffff;
  color: var(--wb-text-primary);
  cursor: pointer;
}

.toolbar-chip.active {
  background: #111111;
  color: #ffffff;
}

.toolbar-chip.subtle,
.action-btn.subtle {
  color: var(--wb-text-secondary);
}

.inspector-section {
  display: grid;
  gap: 12px;
  padding-top: 18px;
  border-top: 1px solid var(--wb-panel-line);
}

.inspector-section:first-of-type {
  padding-top: 0;
  border-top: 0;
}

.section-title {
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--wb-text-tertiary);
}

.field-stack {
  display: grid;
  gap: 8px;
}

.field-stack span {
  color: var(--wb-text-secondary);
  font-size: 13px;
}

.text-input {
  width: 100%;
  min-height: 42px;
  padding: 12px 14px;
  border-radius: 16px;
  border: 1px solid var(--wb-panel-line);
  background: #ffffff;
  color: var(--wb-text-primary);
  box-sizing: border-box;
}

.text-input.multiline {
  min-height: 96px;
  resize: vertical;
}

.empty-card {
  padding: 16px;
  border-radius: var(--wb-radius-card);
  background: var(--wb-panel-muted);
  color: var(--wb-text-secondary);
  line-height: 1.6;
}

.action-grid,
.range-grid {
  display: grid;
  gap: 10px;
}

.dual-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.range-input {
  width: 100%;
}

@media (max-width: 1280px) {
  .portrait-editor-shell {
    grid-template-columns: 10% minmax(0, 90%);
  }

  .inspector-panel {
    grid-column: 1 / -1;
  }
}

@media (max-width: 920px) {
  .portrait-editor-page {
    padding: 0;
  }

  .portrait-editor-shell {
    grid-template-columns: 1fr;
  }

  .panel {
    padding: 18px;
    border-left: 0;
    border-right: 0;
  }

  .panel-head.compact {
    flex-direction: column;
    align-items: stretch;
  }

  .dual-grid {
    grid-template-columns: 1fr;
  }
}
</style>
