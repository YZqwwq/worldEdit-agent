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
              :src="characterDisplayPortraitUrl"
              :alt="characterPortraitUrl ? '人物立绘' : '默认人物立绘'"
              class="character-layer-image"
              :class="{ 'character-layer-image-default': !characterPortraitUrl }"
              draggable="false"
            />

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
            <button
              v-if="worldId"
              class="stage-toolbar-link"
              type="button"
              @click="navigateFromProfile('WorldEditor')"
            >
              返回世界实例
            </button>
            <button
              type="button"
              class="stage-toolbar-link stage-toolbar-link-muted"
              @click="navigateFromProfile('AIChat')"
            >
              AI 助手
            </button>
          </div>

          <nav class="workspace-entry-tabs" aria-label="人物功能入口">
            <button
              type="button"
              class="workspace-entry-tab"
              @click="navigateFromProfile('CharacterPortraitEditor')"
            >
              人物立绘
            </button>
            <button
              type="button"
              class="workspace-entry-tab"
              @click="navigateFromProfile('CharacterNarrativeEditor')"
            >
              文本编辑
            </button>
          </nav>

          <button
            type="button"
            class="portrait-replace-button"
            @click="navigateFromProfile('CharacterPortraitEditor')"
          >
            替换人物图片
          </button>

          <section class="identity-panel">
            <div class="identity-race">{{ leftRaceLabel }}</div>
            <div v-if="characterTitleInput" class="identity-caption">{{ characterTitleInput }}</div>
            <h1 class="identity-name">{{ displayName }}</h1>
          </section>

          <section class="dossier-panel">
            <header class="dossier-static-head">
              <span class="dossier-static-icon">▣</span>
              <span class="dossier-static-line"></span>
              <span class="dossier-static-title">{{ activeDossierTabMeta.title }}</span>
            </header>

            <template v-if="activeDossierTab === 'profile'">
              <div class="dossier-static-section">基础信息</div>
              <div
                class="dossier-static-body dossier-basic-info-body"
                :class="{ dragging: Boolean(activeBasicInfoDrag) }"
                @scroll="scheduleBasicInfoOptionsPositionUpdate"
              >
                <template v-for="(row, index) in visibleBasicInfoRows" :key="row.key">
                  <div
                    v-if="activeBasicInfoDrag && activeBasicInfoDrag.placeholderIndex === index"
                    class="basic-info-drag-placeholder"
                    :style="basicInfoPlaceholderStyle"
                  ></div>
                  <div
                    class="basic-info-row"
                    :class="{
                      empty: !row.value,
                      editing: editingBasicInfoKey === row.key,
                      selectable: isOptionBasicInfoRow(row.key)
                    }"
                    :data-basic-info-key="row.key"
                    @click.stop="startBasicInfoEdit(row.key)"
                  >
                    <button
                      type="button"
                      class="basic-info-drag-handle"
                      aria-label="拖动调整属性位置"
                      @click.stop
                      @pointerdown.stop.prevent="startBasicInfoRowDrag(row.key, $event)"
                    ></button>
                    <span class="basic-info-content">
                      <span class="basic-info-label">[ {{ row.label }} ]</span>
                      <template v-if="editingBasicInfoKey === row.key">
                        <input
                          v-if="isTextBasicInfoRow(row.key)"
                          :key="`${row.key}-text-input`"
                          :ref="setBasicInfoInputRef"
                          v-model="basicInfoEditValue"
                          class="basic-info-input basic-info-inline-input"
                          type="text"
                          @click.stop
                          @focus="scheduleBasicInfoOptionsPositionUpdate"
                          @keydown.enter.prevent="completeBasicInfoEdit"
                          @keydown.esc.prevent="cancelBasicInfoEdit"
                        />
                        <span v-else class="basic-info-search-wrap">
                          <input
                            :key="`${row.key}-search-input`"
                            :ref="setBasicInfoInputRef"
                            v-model="basicInfoEditValue"
                            class="basic-info-input basic-info-search-input"
                            type="text"
                            @click.stop
                            @focus="scheduleBasicInfoOptionsPositionUpdate"
                            @keydown.enter.prevent="selectFirstBasicInfoOption"
                            @keydown.esc.prevent="cancelBasicInfoEdit"
                          />
                        </span>
                      </template>
                      <span v-else-if="row.value" class="basic-info-value">{{ row.value }}</span>
                      <span v-else-if="isOptionBasicInfoRow(row.key)" class="basic-info-arrow">⌄</span>
                    </span>
                    <span class="basic-info-actions">
                      <button
                        type="button"
                        class="basic-info-action"
                        aria-label="在此处后方插入属性"
                        @click.stop="openBasicInfoAddDialog(row.key)"
                      >
                        +
                      </button>
                      <button
                        v-if="canDeleteBasicInfoRow(row.key)"
                        type="button"
                        class="basic-info-action"
                        aria-label="删除属性"
                        @click.stop="deleteBasicInfoRow(row.key)"
                      >
                        -
                      </button>
                    </span>
                  </div>
                </template>
                <div
                  v-if="activeBasicInfoDrag && activeBasicInfoDrag.placeholderIndex === visibleBasicInfoRows.length"
                  class="basic-info-drag-placeholder"
                  :style="basicInfoPlaceholderStyle"
                ></div>
                <div
                  v-if="activeBasicInfoDrag && draggingBasicInfoRow"
                  class="basic-info-row basic-info-drag-ghost"
                  :style="basicInfoDragGhostStyle"
                >
                  <span class="basic-info-content">
                    <span class="basic-info-label">[ {{ draggingBasicInfoRow.label }} ]</span>
                    <span v-if="draggingBasicInfoRow.value" class="basic-info-value">{{ draggingBasicInfoRow.value }}</span>
                  </span>
                </div>
              </div>

              <div class="dossier-static-section">能力评估</div>
              <div class="dossier-static-body dossier-static-body-fill"></div>
            </template>

            <div v-else class="dossier-tab-placeholder"></div>

            <div class="dossier-side-nav-hit-area">
              <button
                v-for="tab in dossierTabs"
                :key="tab.key"
                type="button"
                class="dossier-side-nav-hit"
                :class="{ active: activeDossierTab === tab.key }"
                :aria-label="`切换到${tab.title}`"
                :title="tab.title"
                @click="selectDossierTab(tab.key)"
              ></button>
            </div>
          </section>

          <div
            v-if="showBasicInfoFloatingOptions"
            class="basic-info-options basic-info-options-floating"
            :style="basicInfoOptionsFloatingStyle"
            @mousedown.stop
            @click.stop
          >
            <button
              v-for="option in filteredBasicInfoOptions"
              :key="option.id"
              type="button"
              class="basic-info-option"
              @click.stop="selectBasicInfoOption(option.id)"
            >
              {{ option.name }}
            </button>
            <div v-if="filteredBasicInfoOptions.length === 0" class="basic-info-empty-option">
              无可用项
            </div>
          </div>

          <div
            v-if="basicInfoAddDialog.open"
            class="basic-info-dialog-backdrop"
            @mousedown.self="closeBasicInfoAddDialog"
          >
            <section class="basic-info-dialog" @mousedown.stop>
              <header class="basic-info-dialog-head">
                <h3>添加基础信息</h3>
                <button type="button" class="basic-info-dialog-close" @click="closeBasicInfoAddDialog">
                  ×
                </button>
              </header>

              <div class="basic-info-dialog-tabs">
                <button
                  type="button"
                  class="basic-info-dialog-tab"
                  :class="{ active: basicInfoAddDialog.mode === 'default' }"
                  @click="basicInfoAddDialog.mode = 'default'"
                >
                  默认信息
                </button>
                <button
                  type="button"
                  class="basic-info-dialog-tab"
                  :class="{ active: basicInfoAddDialog.mode === 'custom' }"
                  @click="basicInfoAddDialog.mode = 'custom'"
                >
                  自定义信息
                </button>
              </div>

              <div v-if="basicInfoAddDialog.mode === 'default'" class="basic-info-dialog-body">
                <button
                  v-for="field in availableDefaultBasicInfoFields"
                  :key="field.key"
                  type="button"
                  class="basic-info-default-option"
                  :class="{ active: basicInfoAddDialog.selectedDefaultKey === field.key }"
                  @click="basicInfoAddDialog.selectedDefaultKey = field.key"
                >
                  [ {{ field.label }} ]
                </button>
                <div v-if="availableDefaultBasicInfoFields.length === 0" class="basic-info-dialog-empty">
                  当前没有可添加的默认信息
                </div>
              </div>

              <div v-else class="basic-info-dialog-body">
                <label class="basic-info-dialog-field">
                  <span>基础信息名</span>
                  <input v-model.trim="basicInfoAddDialog.customLabel" type="text" />
                </label>
                <label class="basic-info-dialog-field">
                  <span>基础信息值</span>
                  <input
                    v-model.trim="basicInfoAddDialog.customValue"
                    type="text"
                    @keydown.enter.prevent="confirmBasicInfoAddDialog"
                  />
                </label>
              </div>

              <footer class="basic-info-dialog-actions">
                <button type="button" class="basic-info-dialog-btn subtle" @click="closeBasicInfoAddDialog">
                  取消
                </button>
                <button
                  type="button"
                  class="basic-info-dialog-btn"
                  :disabled="!canConfirmBasicInfoAddDialog"
                  @click="confirmBasicInfoAddDialog"
                >
                  确认添加
                </button>
              </footer>
            </section>
          </div>

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
import { useRoute, useRouter } from 'vue-router'
import type {
  UpdateWorldEntityInput,
  UpsertWorldEntityComponentInput,
  WorldEntityComponentPayload,
  WorldEntityDetailPayload,
  WorldEntityPayload
} from '@share/cache/worldbuilding/worldbuilding'
import { worldbuildingClientService } from '../services/worldbuildingClientService'
import { toPlainIpcPayload } from '../utils/ipcPayload'
import { useKeyboardShortcut } from '../utils/useKeyboardShortcut'
import defaultCharacterImageUrl from '../static/image/character/default_character.png'
import {
  CHARACTER_BASIC_INFO_DEFAULT_FIELDS,
  CHARACTER_BASIC_INFO_DEFAULT_ORDER,
  createDefaultCharacterBasicInfo,
  getCharacterComponentByType,
  type CharacterBasicInfoData,
  type CharacterBasicInfoField,
  type CharacterDemographicData,
  type CharacterProfileData
} from '../features/worldbuilding/character/shared'
import '../styles/worldbuildingWhiteTheme.css'

const route = useRoute()
const router = useRouter()

const backgroundCanvasRef = ref<HTMLCanvasElement | null>(null)
const overlayCanvasRef = ref<HTMLCanvasElement | null>(null)
const stageViewportRef = ref<HTMLElement | null>(null)
const characterTransformRef = ref<HTMLElement | null>(null)
const basicInfoInputRef = ref<HTMLInputElement | null>(null)
const entityDetail = ref<WorldEntityDetailPayload | null>(null)
const relatedEntityNameMap = ref(new Map<string, string>())
const relatedEntityList = ref<WorldEntityPayload[]>([])
const characterNameInput = ref('')
const characterTitleInput = ref('')
const characterSummaryInput = ref('')
const basicInfoDraft = ref<CharacterBasicInfoData>(createDefaultCharacterBasicInfo())
const editingBasicInfoKey = ref<string | null>(null)
const basicInfoEditValue = ref('')
const pendingInsertedBasicInfoKey = ref<string | null>(null)
const basicInfoOptionsAnchor = ref({ left: 0, top: 0, width: 220 })
const basicInfoAddDialog = ref({
  open: false,
  insertAfterKey: '',
  mode: 'default' as 'default' | 'custom',
  selectedDefaultKey: '',
  customLabel: '',
  customValue: ''
})
const activeDossierTab = ref<DossierTabKey>('profile')
const activeBasicInfoDrag = ref<{
  key: string
  pointerId: number
  pointerX: number
  pointerY: number
  offsetX: number
  offsetY: number
  rowWidth: number
  rowHeight: number
  placeholderIndex: number
  sourceOrder: string[]
} | null>(null)
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
const DOSSIER_PANEL_BASE_LAYOUT = {
  headHeight: 64,
  contentTopGap: 12,
  sectionHeight: 36,
  basicBodyHeight: 310,
  sideNavWidth: 52,
  sideNavGap: 8
} as const
const DEFAULT_CHARACTER_IMAGE_SIZE = {
  width: 2897,
  height: 1661
} as const
const DEFAULT_CHARACTER_IMAGE_DISPLAY_OFFSET = {
  x: -0.08,
  y: -0.12
} as const

type DossierPanelLayout = {
  panelWidth: number
  panelMinWidth: number
  headHeight: number
  contentTopGap: number
  sectionHeight: number
  basicBodyHeight: number
  sideNavWidth: number
  sideNavGap: number
}
type DossierTabKey = 'profile' | 'summary' | 'voice'

const dossierTabs: Array<{ key: DossierTabKey; title: string }> = [
  { key: 'profile', title: '人物资料' },
  { key: 'summary', title: '人物简介' },
  { key: 'voice', title: '人物语音' }
]

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const cloneBasicInfo = (value: CharacterBasicInfoData): CharacterBasicInfoData => ({
  order: [...value.order],
  fields: Object.fromEntries(
    Object.entries(value.fields).map(([key, field]) => [key, { ...field }])
  )
})

const ensureBasicInfo = (value: CharacterBasicInfoData | undefined): CharacterBasicInfoData => {
  const base = createDefaultCharacterBasicInfo()
  const source = value ?? base
  const order = [...new Set(source.order?.length ? source.order : base.order)]
  const fields: Record<string, CharacterBasicInfoField> = { ...base.fields }

  for (const [key, field] of Object.entries(source.fields ?? {})) {
    fields[key] = {
      ...fields[key],
      ...field,
      label: field.label || fields[key]?.label || key,
      kind: field.kind || fields[key]?.kind || 'text',
      value: field.value ?? ''
    }
  }

  return { order, fields }
}

const createInsertedBasicInfoKey = (): string =>
  `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const setBasicInfoInputRef = (element: unknown): void => {
  basicInfoInputRef.value = element instanceof HTMLInputElement ? element : null
}

const worldId = computed(() => String(route.params.worldId || ''))
const entityId = computed(() => String(route.params.entityId || ''))
const isCharacter = computed(() => entityDetail.value?.entity.type === 'character')
const canSaveProfile = computed(() => Boolean(entityDetail.value) && isCharacter.value)
const activeDossierTabMeta = computed(
  () => dossierTabs.find((tab) => tab.key === activeDossierTab.value) ?? dossierTabs[0]
)

const profileComponent = computed(() =>
  getCharacterComponentByType<CharacterProfileData>(entityDetail.value, 'character_profile')
)
const demographicComponent = computed(() =>
  getCharacterComponentByType<CharacterDemographicData>(entityDetail.value, 'character_demographic')
)

const displayName = computed(() => characterNameInput.value || entityDetail.value?.entity.name || '未命名角色')
const leftRaceLabel = computed(() => {
  const raceName = resolveReferencedEntityName(
    String(basicInfoDraft.value.fields.race?.value ?? ''),
    ''
  )
  return raceName ? `种族：${raceName}` : '种族：'
})

const basicInfoRows = computed(() => {
  const basicInfo = basicInfoDraft.value
  const orderedKeys = [...new Set(basicInfo?.order?.length ? basicInfo.order : CHARACTER_BASIC_INFO_DEFAULT_ORDER)]

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

const activeBasicInfoField = computed(() =>
  editingBasicInfoKey.value ? basicInfoDraft.value.fields[editingBasicInfoKey.value] ?? null : null
)

const filteredBasicInfoOptions = computed(() => {
  const field = activeBasicInfoField.value
  if (!field || field.kind !== 'entity_ref') return []

  const query = basicInfoEditValue.value.trim().toLowerCase()
  return relatedEntityList.value
    .filter((entity) => !field.entityType || entity.type === field.entityType)
    .filter((entity) => !query || entity.name.toLowerCase().includes(query))
    .slice(0, 12)
})

const showBasicInfoFloatingOptions = computed(() =>
  Boolean(activeDossierTab.value === 'profile' && editingBasicInfoKey.value && isOptionBasicInfoRow(editingBasicInfoKey.value))
)

const visibleBasicInfoRows = computed(() => {
  const dragKey = activeBasicInfoDrag.value?.key
  return dragKey ? basicInfoRows.value.filter((row) => row.key !== dragKey) : basicInfoRows.value
})

const draggingBasicInfoRow = computed(() => {
  const dragKey = activeBasicInfoDrag.value?.key
  return dragKey ? basicInfoRows.value.find((row) => row.key === dragKey) ?? null : null
})

const availableDefaultBasicInfoFields = computed(() =>
  CHARACTER_BASIC_INFO_DEFAULT_ORDER
    .filter((key) => !basicInfoDraft.value.order.includes(key))
    .map((key) => ({
      key,
      label: CHARACTER_BASIC_INFO_DEFAULT_FIELDS[key].label
    }))
)

const canConfirmBasicInfoAddDialog = computed(() => {
  if (basicInfoAddDialog.value.mode === 'default') {
    return Boolean(basicInfoAddDialog.value.selectedDefaultKey)
  }
  return Boolean(basicInfoAddDialog.value.customLabel.trim())
})

const basicInfoPlaceholderStyle = computed(() => ({
  height: `${Math.max(activeBasicInfoDrag.value?.rowHeight ?? 30, 30)}px`
}))

const basicInfoDragGhostStyle = computed(() => {
  const drag = activeBasicInfoDrag.value
  if (!drag) return {}
  return {
    left: `${drag.pointerX - drag.offsetX}px`,
    top: `${drag.pointerY - drag.offsetY}px`,
    width: `${drag.rowWidth}px`,
    height: `${drag.rowHeight}px`
  }
})

const basicInfoOptionsFloatingStyle = computed(() => ({
  left: `${basicInfoOptionsAnchor.value.left}px`,
  top: `${basicInfoOptionsAnchor.value.top}px`,
  minWidth: `${basicInfoOptionsAnchor.value.width}px`
}))

const characterPortraitUrl = computed(() => String(profileComponent.value?.data?.portraitResourceUrl || ''))
const characterDisplayPortraitUrl = computed(() => characterPortraitUrl.value || defaultCharacterImageUrl)
const activeCharacterTransform = computed(() =>
  transformModeActive.value ? draftCharacterTransform.value : committedCharacterTransform.value
)
const displayedCharacterTransform = computed(() => {
  const transform = activeCharacterTransform.value
  if (characterPortraitUrl.value) return transform

  return {
    ...transform,
    x: clamp(transform.x + DEFAULT_CHARACTER_IMAGE_DISPLAY_OFFSET.x, 0.08, 0.72),
    y: clamp(transform.y + DEFAULT_CHARACTER_IMAGE_DISPLAY_OFFSET.y, 0.12, 0.86)
  }
})

const characterLayerStyle = computed(() => ({
  left: `${(displayedCharacterTransform.value.x * 100).toFixed(2)}%`,
  top: `${(displayedCharacterTransform.value.y * 100).toFixed(2)}%`,
  transform: `translate(-50%, -50%) scale(${displayedCharacterTransform.value.scale})`
}))

const resolveReferencedEntityName = (entityIdValue: string | undefined, emptyLabel: string): string => {
  const normalizedId = String(entityIdValue || '').trim()
  if (!normalizedId) return emptyLabel
  return relatedEntityNameMap.value.get(normalizedId) || normalizedId
}

const getBasicInfoRawValue = (key: string): string => {
  if (key === 'name') return characterNameInput.value
  const value = basicInfoDraft.value.fields[key]?.value
  return value == null ? '' : String(value)
}

const isTextBasicInfoRow = (key: string): boolean => {
  const field = basicInfoDraft.value.fields[key]
  return !field || field.kind === 'entity_name' || field.kind === 'text' || field.kind === 'number'
}

const isOptionBasicInfoRow = (key: string): boolean => !isTextBasicInfoRow(key)

const canDeleteBasicInfoRow = (key: string): boolean => key !== 'name'

const selectDossierTab = (key: DossierTabKey): void => {
  if (activeDossierTab.value === key) return
  if (editingBasicInfoKey.value) {
    void completeBasicInfoEdit()
  }
  activeBasicInfoDrag.value = null
  activeDossierTab.value = key
  renderStage()
}

const navigateFromProfile = async (
  target:
    | 'WorldEditor'
    | 'AIChat'
    | 'CharacterPortraitEditor'
    | 'CharacterNarrativeEditor'
): Promise<void> => {
  clearProfileAutosave()
  await saveProfile(true).catch(() => undefined)

  if (target === 'WorldEditor') {
    await router.push({ name: target, params: { worldId: worldId.value } })
    return
  }

  if (target === 'AIChat') {
    await router.push({ name: target })
    return
  }

  await router.push({ name: target, params: { worldId: worldId.value, entityId: entityId.value } })
}

const waitForLayoutFrame = (): Promise<void> =>
  new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })

const getActiveBasicInfoInputElement = (): HTMLInputElement | null => {
  const key = editingBasicInfoKey.value
  if (!key) return null

  const rows = [...document.querySelectorAll<HTMLElement>('.dossier-basic-info-body .basic-info-row')]
  const row = rows.find((element) => element.dataset.basicInfoKey === key)
  return row?.querySelector<HTMLInputElement>('.basic-info-input') ?? null
}

const updateBasicInfoOptionsPosition = async (): Promise<void> => {
  await nextTick()
  await waitForLayoutFrame()
  const activeInput = getActiveBasicInfoInputElement()
  if (!showBasicInfoFloatingOptions.value || !activeInput) return

  basicInfoInputRef.value = activeInput
  const rect = activeInput.getBoundingClientRect()
  const width = Math.max(220, rect.width)
  const viewportPadding = 12
  basicInfoOptionsAnchor.value = {
    left: clamp(rect.left, viewportPadding, Math.max(viewportPadding, window.innerWidth - width - viewportPadding)),
    top: rect.bottom + 4,
    width
  }
}

const scheduleBasicInfoOptionsPositionUpdate = (): void => {
  void updateBasicInfoOptionsPosition()
}

const focusBasicInfoInput = async (): Promise<void> => {
  await nextTick()
  const activeInput = getActiveBasicInfoInputElement()
  basicInfoInputRef.value = activeInput
  activeInput?.focus()
  await updateBasicInfoOptionsPosition()
}

const startBasicInfoEdit = (key: string): void => {
  if (editingBasicInfoKey.value === key) return
  basicInfoInputRef.value = null
  editingBasicInfoKey.value = key
  basicInfoEditValue.value = getBasicInfoRawValue(key)
  void focusBasicInfoInput()
}

const removePendingInsertedBasicInfoIfBlank = (): void => {
  const pendingKey = pendingInsertedBasicInfoKey.value
  if (!pendingKey) return
  const pendingField = basicInfoDraft.value.fields[pendingKey]
  const isBlank = !String(pendingField?.value ?? '').trim()
  if (!isBlank) return

  const next = cloneBasicInfo(basicInfoDraft.value)
  next.order = next.order.filter((key) => key !== pendingKey)
  delete next.fields[pendingKey]
  basicInfoDraft.value = next
  pendingInsertedBasicInfoKey.value = null
}

const replaceComponent = <TData extends Record<string, unknown>>(
  components: WorldEntityComponentPayload[],
  nextComponent: WorldEntityComponentPayload<TData>
): WorldEntityComponentPayload[] => {
  const nextComponents = components.filter((component) => component.componentType !== nextComponent.componentType)
  nextComponents.push(nextComponent)
  return nextComponents
}

const saveBasicInfo = async (): Promise<void> => {
  if (!canSaveProfile.value || !entityDetail.value) return

  const demographicInput: UpsertWorldEntityComponentInput<CharacterDemographicData> = {
    entityId: entityDetail.value.entity.id,
    componentType: 'character_demographic',
    schemaVersion: 2,
    data: {
      basicInfo: toPlainIpcPayload(basicInfoDraft.value) as CharacterBasicInfoData
    }
  }

  const updatedDemographic = await worldbuildingClientService.upsertComponent(demographicInput)
  entityDetail.value = {
    entity: entityDetail.value.entity,
    components: replaceComponent(entityDetail.value.components, updatedDemographic),
    relations: entityDetail.value.relations
  }
}

const completeBasicInfoEdit = async (): Promise<void> => {
  const key = editingBasicInfoKey.value
  if (!key) return

  const next = cloneBasicInfo(basicInfoDraft.value)
  const value = basicInfoEditValue.value.trim()
  let shouldSaveProfile = false

  if (key === 'name') {
    characterNameInput.value = value || entityDetail.value?.entity.name || ''
    next.fields.name = {
      ...next.fields.name,
      label: next.fields.name?.label || '姓名',
      kind: 'entity_name',
      value: characterNameInput.value
    }
    shouldSaveProfile = true
  } else if (next.fields[key]) {
    next.fields[key] = {
      ...next.fields[key],
      value
    }
  }

  basicInfoDraft.value = next
  editingBasicInfoKey.value = null
  basicInfoEditValue.value = ''
  removePendingInsertedBasicInfoIfBlank()

  if (shouldSaveProfile) {
    clearProfileAutosave()
    await saveProfile(true).catch(() => undefined)
  }
  await saveBasicInfo().catch(() => undefined)
}

const cancelBasicInfoEdit = (): void => {
  editingBasicInfoKey.value = null
  basicInfoEditValue.value = ''
  removePendingInsertedBasicInfoIfBlank()
}

const selectBasicInfoOption = async (entityIdValue: string): Promise<void> => {
  const key = editingBasicInfoKey.value
  if (!key) return

  const next = cloneBasicInfo(basicInfoDraft.value)
  if (next.fields[key]) {
    next.fields[key] = {
      ...next.fields[key],
      value: entityIdValue
    }
  }
  basicInfoDraft.value = next
  editingBasicInfoKey.value = null
  basicInfoEditValue.value = ''
  pendingInsertedBasicInfoKey.value = null
  await saveBasicInfo().catch(() => undefined)
}

const selectFirstBasicInfoOption = async (): Promise<void> => {
  const firstOption = filteredBasicInfoOptions.value[0]
  if (!firstOption) {
    await completeBasicInfoEdit()
    return
  }
  await selectBasicInfoOption(firstOption.id)
}

const getBasicInfoInsertIndex = (order: string[], afterKey: string): number => {
  const currentIndex = order.indexOf(afterKey)
  return currentIndex < 0 ? order.length : currentIndex + 1
}

const openBasicInfoAddDialog = (afterKey: string): void => {
  removePendingInsertedBasicInfoIfBlank()
  editingBasicInfoKey.value = null
  basicInfoEditValue.value = ''
  basicInfoAddDialog.value = {
    open: true,
    insertAfterKey: afterKey,
    mode: availableDefaultBasicInfoFields.value.length > 0 ? 'default' : 'custom',
    selectedDefaultKey: availableDefaultBasicInfoFields.value[0]?.key ?? '',
    customLabel: '',
    customValue: ''
  }
}

const closeBasicInfoAddDialog = (): void => {
  basicInfoAddDialog.value.open = false
}

const addDefaultBasicInfoRow = (key: string, afterKey: string): CharacterBasicInfoData => {
  const next = cloneBasicInfo(basicInfoDraft.value)
  if (!next.order.includes(key)) {
    next.order.splice(getBasicInfoInsertIndex(next.order, afterKey), 0, key)
  }

  const defaultField = CHARACTER_BASIC_INFO_DEFAULT_FIELDS[
    key as keyof typeof CHARACTER_BASIC_INFO_DEFAULT_FIELDS
  ]
  if (defaultField) {
    next.fields[key] = {
      ...defaultField,
      value: key === 'name' ? characterNameInput.value : ''
    }
  }
  return next
}

const addCustomBasicInfoRow = (
  label: string,
  value: string,
  afterKey: string
): CharacterBasicInfoData => {
  const next = cloneBasicInfo(basicInfoDraft.value)
  const newKey = createInsertedBasicInfoKey()
  next.order.splice(getBasicInfoInsertIndex(next.order, afterKey), 0, newKey)
  next.fields[newKey] = {
    label,
    kind: 'text',
    value,
    custom: true
  }
  return next
}

const confirmBasicInfoAddDialog = async (): Promise<void> => {
  if (!canConfirmBasicInfoAddDialog.value) return

  const dialog = basicInfoAddDialog.value
  basicInfoDraft.value =
    dialog.mode === 'default'
      ? addDefaultBasicInfoRow(dialog.selectedDefaultKey, dialog.insertAfterKey)
      : addCustomBasicInfoRow(
          dialog.customLabel.trim(),
          dialog.customValue.trim(),
          dialog.insertAfterKey
        )
  closeBasicInfoAddDialog()
  await saveBasicInfo().catch(() => undefined)
}

const deleteBasicInfoRow = async (key: string): Promise<void> => {
  if (!canDeleteBasicInfoRow(key)) return
  const next = cloneBasicInfo(basicInfoDraft.value)
  next.order = next.order.filter((item) => item !== key)
  delete next.fields[key]
  basicInfoDraft.value = next
  if (editingBasicInfoKey.value === key) {
    editingBasicInfoKey.value = null
    basicInfoEditValue.value = ''
  }
  if (pendingInsertedBasicInfoKey.value === key) {
    pendingInsertedBasicInfoKey.value = null
  }
  await saveBasicInfo().catch(() => undefined)
}

const calculateBasicInfoPlaceholderIndex = (clientY: number): number => {
  const rows = [...document.querySelectorAll<HTMLElement>('.dossier-basic-info-body .basic-info-row')]
    .filter((row) => !row.classList.contains('basic-info-drag-ghost'))

  for (let index = 0; index < rows.length; index += 1) {
    const rect = rows[index].getBoundingClientRect()
    if (clientY < rect.top + rect.height / 2) {
      return index
    }
  }

  return rows.length
}

const startBasicInfoRowDrag = (key: string, event: PointerEvent): void => {
  const rowElement = (event.currentTarget as HTMLElement | null)?.closest<HTMLElement>('.basic-info-row')
  const rect = rowElement?.getBoundingClientRect()
  if (!rect) return

  if (editingBasicInfoKey.value) {
    void completeBasicInfoEdit()
  }

  const sourceOrder = [...basicInfoDraft.value.order]
  const sourceIndex = Math.max(0, sourceOrder.indexOf(key))
  activeBasicInfoDrag.value = {
    key,
    pointerId: event.pointerId,
    pointerX: event.clientX,
    pointerY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    rowWidth: rect.width,
    rowHeight: rect.height,
    placeholderIndex: sourceIndex,
    sourceOrder
  }
}

const handleBasicInfoRowDragMove = (event: PointerEvent): void => {
  const drag = activeBasicInfoDrag.value
  if (!drag || drag.pointerId !== event.pointerId) return
  event.preventDefault()
  activeBasicInfoDrag.value = {
    ...drag,
    pointerX: event.clientX,
    pointerY: event.clientY,
    placeholderIndex: calculateBasicInfoPlaceholderIndex(event.clientY)
  }
}

const handleBasicInfoRowDragEnd = (event: PointerEvent): void => {
  const drag = activeBasicInfoDrag.value
  if (!drag || drag.pointerId !== event.pointerId) return
  event.preventDefault()

  const next = cloneBasicInfo(basicInfoDraft.value)
  const nextOrder = drag.sourceOrder.filter((key) => key !== drag.key)
  const insertIndex = clamp(drag.placeholderIndex, 0, nextOrder.length)
  nextOrder.splice(insertIndex, 0, drag.key)
  next.order = nextOrder
  basicInfoDraft.value = next
  activeBasicInfoDrag.value = null
  void saveBasicInfo().catch(() => undefined)
}

const handleGlobalBasicInfoPointerDown = (event: MouseEvent): void => {
  if (activeBasicInfoDrag.value) return
  if (!editingBasicInfoKey.value) return
  const target = event.target as HTMLElement | null
  if (target?.closest('.basic-info-row') || target?.closest('.basic-info-options')) return
  void completeBasicInfoEdit()
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
  const demographic = demographicComponent.value
  characterNameInput.value = String(entityDetail.value?.entity.name || '')
  characterTitleInput.value = String(profile?.data?.title || entityDetail.value?.entity.title || '')
  characterSummaryInput.value = String(profile?.data?.summary || entityDetail.value?.entity.summary || '')
  basicInfoDraft.value = ensureBasicInfo(demographic?.data?.basicInfo)
  basicInfoDraft.value.fields.name = {
    ...basicInfoDraft.value.fields.name,
    value: characterNameInput.value
  }
  editingBasicInfoKey.value = null
  basicInfoEditValue.value = ''
  pendingInsertedBasicInfoKey.value = null
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

const getDossierPanelLayout = (width: number): DossierPanelLayout => {
  const widthRule = (() => {
    if (width <= 760) {
      return {
        panelWidth: Math.min(width * 0.76, 320),
        panelMinWidth: 0
      }
    }
    if (width <= 1024) {
      return {
        panelWidth: 320,
        panelMinWidth: 320
      }
    }
    if (width <= 1280) {
      return {
        panelWidth: Math.max(Math.min(width * 0.36, 460), 340),
        panelMinWidth: 340
      }
    }
    return {
      panelWidth: Math.max(Math.min(width * 0.34, 480), 360),
      panelMinWidth: 360
    }
  })()

  return {
    ...DOSSIER_PANEL_BASE_LAYOUT,
    ...widthRule
  }
}

const applyDossierLayoutVariables = (element: HTMLElement, layout: DossierPanelLayout): void => {
  element.style.setProperty('--dossier-panel-width', `${layout.panelWidth}px`)
  element.style.setProperty('--dossier-panel-min-width', `${layout.panelMinWidth}px`)
  element.style.setProperty('--dossier-head-height', `${layout.headHeight}px`)
  element.style.setProperty('--dossier-content-top-gap', `${layout.contentTopGap}px`)
  element.style.setProperty('--dossier-section-height', `${layout.sectionHeight}px`)
  element.style.setProperty('--dossier-basic-body-height', `${layout.basicBodyHeight}px`)
  element.style.setProperty('--dossier-side-nav-width', `${layout.sideNavWidth}px`)
  element.style.setProperty('--dossier-side-nav-gap', `${layout.sideNavGap}px`)
}

const getCharacterLayerWidth = (stageWidth: number, stageHeight: number, layout: DossierPanelLayout): number => {
  const imageAspect = DEFAULT_CHARACTER_IMAGE_SIZE.width / DEFAULT_CHARACTER_IMAGE_SIZE.height
  const availableStageWidth = Math.max(280, stageWidth - layout.panelWidth)
  const widthByViewport = availableStageWidth * 0.92
  const widthByHeight = stageHeight * 1.08 * imageAspect
  return clamp(Math.min(widthByViewport, widthByHeight, 1120), 420, 1120)
}

const drawDossierPersonIcon = (
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  color: string
): void => {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(centerX, centerY - 11, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(centerX - 16, centerY - 2)
  ctx.lineTo(centerX + 16, centerY - 2)
  ctx.lineTo(centerX + 7, centerY + 22)
  ctx.lineTo(centerX, centerY + 8)
  ctx.lineTo(centerX - 7, centerY + 22)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = 'rgba(48, 48, 48, 0.72)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(centerX, centerY - 2)
  ctx.lineTo(centerX, centerY + 17)
  ctx.stroke()
}

const drawDossierSummaryIcon = (
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  color: string
): void => {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(centerX - 17, centerY - 6)
  ctx.lineTo(centerX + 17, centerY - 6)
  ctx.lineTo(centerX + 10, centerY + 8)
  ctx.lineTo(centerX - 10, centerY + 8)
  ctx.closePath()
  ctx.fill()
  ctx.fillRect(centerX - 11, centerY + 9, 22, 5)
  ctx.fillRect(centerX - 8, centerY - 14, 16, 7)
}

const drawDossierVoiceIcon = (
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  color: string
): void => {
  ctx.fillStyle = color
  ctx.fillRect(centerX - 16, centerY - 12, 32, 24)
  ctx.strokeStyle = 'rgba(48, 48, 48, 0.64)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(centerX - 15, centerY - 10)
  ctx.lineTo(centerX, centerY)
  ctx.lineTo(centerX + 15, centerY - 10)
  ctx.stroke()
}

const drawDossierSideNav = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  layout: DossierPanelLayout
): void => {
  const panelLeft = width - layout.panelWidth
  const navLeft = width - layout.sideNavWidth
  const navTop = layout.headHeight + layout.contentTopGap
  const navHeight = Math.max(0, height - navTop)
  const itemHeight = 128
  const iconX = navLeft + layout.sideNavWidth / 2

  ctx.save()
  ctx.fillStyle = 'rgba(38, 38, 38, 0.94)'
  ctx.fillRect(navLeft, navTop, layout.sideNavWidth, navHeight)

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(navLeft, navTop)
  ctx.lineTo(navLeft, height)
  ctx.moveTo(panelLeft, navTop)
  ctx.lineTo(width, navTop)
  for (let index = 1; index <= 2; index += 1) {
    const y = navTop + itemHeight * index
    ctx.moveTo(navLeft, y)
    ctx.lineTo(width, y)
  }
  ctx.stroke()

  const activeIndex = Math.max(0, dossierTabs.findIndex((tab) => tab.key === activeDossierTab.value))
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
  ctx.fillRect(navLeft + 8, navTop + itemHeight * activeIndex + 42, 3, 44)

  const getIconColor = (key: DossierTabKey): string =>
    activeDossierTab.value === key ? 'rgba(255, 255, 255, 0.94)' : 'rgba(190, 190, 188, 0.72)'
  drawDossierPersonIcon(ctx, iconX, navTop + itemHeight * 0.5, getIconColor('profile'))
  drawDossierSummaryIcon(ctx, iconX, navTop + itemHeight * 1.5, getIconColor('summary'))
  drawDossierVoiceIcon(ctx, iconX, navTop + itemHeight * 2.5, getIconColor('voice'))
  ctx.restore()
}

const drawDossierPanelBackground = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
  const layout = getDossierPanelLayout(width)
  const {
    panelWidth,
    headHeight,
    contentTopGap,
    sectionHeight,
    basicBodyHeight,
    sideNavWidth,
    sideNavGap
  } = layout
  const left = width - panelWidth
  const contentWidth = Math.max(0, panelWidth - sideNavWidth - sideNavGap)
  const contentTop = headHeight + contentTopGap
  const abilityTop = contentTop + sectionHeight + basicBodyHeight

  ctx.save()
  ctx.fillStyle = 'rgba(202, 202, 200, 0.72)'
  ctx.fillRect(left, contentTop, panelWidth, Math.max(0, height - contentTop))

  ctx.fillStyle = 'rgba(43, 43, 43, 0.94)'
  ctx.fillRect(left, 0, panelWidth, headHeight)

  ctx.fillStyle = 'rgba(120, 120, 118, 0.78)'
  if (activeDossierTab.value === 'profile') {
    ctx.fillRect(left, contentTop, contentWidth, sectionHeight)
    ctx.fillRect(left, abilityTop, contentWidth, sectionHeight)

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(left, contentTop + sectionHeight + basicBodyHeight)
    ctx.lineTo(left + contentWidth, contentTop + sectionHeight + basicBodyHeight)
    ctx.stroke()
  }

  drawDossierSideNav(ctx, width, height, layout)
  ctx.restore()
}

const drawStageOverlay = (ctx: CanvasRenderingContext2D, width: number, height: number): void => {
  drawDossierPanelBackground(ctx, width, height)

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
  const dossierLayout = getDossierPanelLayout(width)
  applyDossierLayoutVariables(viewport, dossierLayout)
  viewport.style.setProperty('--character-layer-width', `${getCharacterLayerWidth(width, height, dossierLayout)}px`)

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
    relatedEntityList.value = []
    return
  }

  syncingFromDetail = true
  try {
    const [detail, relatedEntities] = await Promise.all([
      worldbuildingClientService.getEntityDetail(entityId.value),
      worldId.value ? worldbuildingClientService.listEntities(worldId.value).catch(() => []) : Promise.resolve([])
    ])
    entityDetail.value = detail
    relatedEntityList.value = relatedEntities
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
      components: replaceComponent(entityDetail.value.components, updatedProfile),
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
  window.addEventListener('pointermove', handleBasicInfoRowDragMove)
  window.addEventListener('pointerup', handleBasicInfoRowDragEnd)
  window.addEventListener('pointercancel', handleBasicInfoRowDragEnd)
  window.addEventListener('mousedown', handleGlobalBasicInfoPointerDown)
  window.addEventListener('resize', scheduleBasicInfoOptionsPositionUpdate)
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

watch(activeDossierTab, async () => {
  await nextTick()
  renderStage()
})

watch([editingBasicInfoKey, basicInfoEditValue], () => {
  scheduleBasicInfoOptionsPositionUpdate()
})

onBeforeUnmount(() => {
  clearProfileAutosave()
  stageResizeObserver?.disconnect()
  window.removeEventListener('keydown', handleTransformModeKeydown)
  window.removeEventListener('mousemove', handleTransformPointerMove)
  window.removeEventListener('mouseup', handleTransformPointerUp)
  window.removeEventListener('pointermove', handleBasicInfoRowDragMove)
  window.removeEventListener('pointerup', handleBasicInfoRowDragEnd)
  window.removeEventListener('pointercancel', handleBasicInfoRowDragEnd)
  window.removeEventListener('mousedown', handleGlobalBasicInfoPointerDown)
  window.removeEventListener('resize', scheduleBasicInfoOptionsPositionUpdate)
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
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0;
  box-sizing: border-box;
  background: #efefee;
  color: var(--wb-text-primary);
  overflow: hidden;
  user-select: none;
}

.editor-main {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.profile-stage {
  --dossier-panel-width: 480px;
  --dossier-panel-min-width: 360px;
  --dossier-head-height: 64px;
  --dossier-content-top-gap: 12px;
  --dossier-section-height: 36px;
  --dossier-basic-body-height: 310px;
  --dossier-side-nav-width: 52px;
  --dossier-side-nav-gap: 8px;
  --character-layer-width: 560px;

  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
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
  width: var(--character-layer-width);
  max-width: calc(100vw - var(--dossier-panel-width) - 96px);
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

.character-layer-image {
  display: block;
  width: 100%;
  filter: drop-shadow(0 24px 20px rgba(0, 0, 0, 0.18));
}

.character-layer-image-default {
  filter: none;
  opacity: 0.96;
}

.stage-dom-layer {
  position: relative;
  z-index: 3;
  width: 100%;
  height: 100%;
  min-height: 0;
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
  border: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.95);
  text-decoration: none;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.stage-toolbar-link + .stage-toolbar-link {
  border-left: 1px solid rgba(255, 255, 255, 0.18);
}

.stage-toolbar-link-muted {
  color: rgba(255, 255, 255, 0.72);
}

.stage-toolbar-link:hover,
.workspace-entry-tab:hover,
.portrait-replace-button:hover {
  background: rgba(24, 24, 24, 0.92);
  color: rgba(255, 255, 255, 0.98);
}

.workspace-entry-tabs {
  position: absolute;
  top: 0;
  left: calc(50% - var(--dossier-panel-width) * 0.5);
  transform: translateX(-50%);
  min-height: 42px;
  display: inline-flex;
  align-items: stretch;
  z-index: 4;
  border: 1px solid rgba(0, 0, 0, 0.22);
  border-top: 0;
  background: rgba(42, 42, 42, 0.86);
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.14);
  pointer-events: auto;
}

.workspace-entry-tab {
  min-width: 108px;
  min-height: 42px;
  padding: 0 18px;
  border: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.16);
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font: inherit;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.04em;
  cursor: pointer;
}

.workspace-entry-tab:first-child {
  border-left: 0;
}

.portrait-replace-button {
  position: absolute;
  top: 0;
  right: calc(var(--dossier-panel-width) + 4px);
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  padding: 0 16px;
  box-sizing: border-box;
  border: 1px solid rgba(0, 0, 0, 0.22);
  border-top: 0;
  background: rgba(42, 42, 42, 0.86);
  color: rgba(255, 255, 255, 0.92);
  text-decoration: none;
  font: inherit;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
  pointer-events: auto;
  cursor: pointer;
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
  height: 100%;
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
  height: var(--dossier-head-height);
  margin-bottom: var(--dossier-content-top-gap);
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
  width: calc(100% - var(--dossier-side-nav-width) - var(--dossier-side-nav-gap));
  height: var(--dossier-section-height);
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
  width: calc(100% - var(--dossier-side-nav-width) - var(--dossier-side-nav-gap));
  min-height: var(--dossier-basic-body-height);
  box-sizing: border-box;
}

.dossier-static-body-fill {
  min-height: calc(
    100% - var(--dossier-head-height) - var(--dossier-content-top-gap) - var(--dossier-section-height) -
      var(--dossier-section-height) - var(--dossier-basic-body-height)
  );
  border-bottom: 0;
}

.dossier-tab-placeholder {
  width: calc(100% - var(--dossier-side-nav-width) - var(--dossier-side-nav-gap));
  min-height: calc(100% - var(--dossier-head-height) - var(--dossier-content-top-gap));
  box-sizing: border-box;
  background: transparent;
}

.dossier-side-nav-hit-area {
  position: absolute;
  top: calc(var(--dossier-head-height) + var(--dossier-content-top-gap));
  right: 0;
  bottom: 0;
  width: var(--dossier-side-nav-width);
  z-index: 2;
  display: flex;
  flex-direction: column;
  pointer-events: auto;
}

.dossier-side-nav-hit {
  width: 100%;
  height: 128px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.dossier-side-nav-hit:focus-visible {
  outline: 2px solid rgba(255, 255, 255, 0.72);
  outline-offset: -4px;
}

.dossier-basic-info-body {
  padding-top: 2%;
  overflow: auto;
  position: relative;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.dossier-basic-info-body::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.basic-info-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  min-height: 30px;
  padding: 0 8px 0 28px;
  color: rgba(24, 24, 24, 0.86);
  font-size: 16px;
  line-height: 30px;
  font-weight: 700;
  transition:
    background 120ms ease,
    transform 140ms ease,
    opacity 140ms ease;
  cursor: default;
  position: relative;
}

.dossier-basic-info-body.dragging .basic-info-row:hover {
  background: transparent;
}

.dossier-basic-info-body.dragging .basic-info-actions,
.dossier-basic-info-body.dragging .basic-info-drag-handle {
  opacity: 0;
  pointer-events: none;
}

.basic-info-drag-placeholder {
  margin: 0;
  background: rgba(0, 0, 0, 0.08);
  transition:
    height 140ms ease,
    margin 140ms ease,
    opacity 140ms ease;
}

.basic-info-drag-ghost {
  position: fixed;
  z-index: 40;
  pointer-events: none;
  background: rgba(0, 0, 0, 0.1);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.12);
  opacity: 0.92;
}

.basic-info-row.editing .basic-info-drag-handle {
  display: none;
}

.basic-info-drag-handle {
  position: absolute;
  left: 6px;
  top: 50%;
  width: 14px;
  height: 14px;
  padding: 0;
  border: 2px solid rgba(70, 70, 70, 0.62);
  border-radius: 999px;
  background: transparent;
  opacity: 0;
  transform: translateY(-50%);
  cursor: grab;
}

.basic-info-row:hover .basic-info-drag-handle {
  opacity: 1;
}

.basic-info-drag-handle:active {
  cursor: grabbing;
}

.basic-info-row.empty {
  color: rgba(24, 24, 24, 0.72);
}

.basic-info-row:hover,
.basic-info-row.editing {
  background: rgba(0, 0, 0, 0.08);
}

.basic-info-content {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.basic-info-label {
  white-space: nowrap;
}

.basic-info-value {
  word-break: break-word;
}

.basic-info-arrow {
  margin-left: 2px;
  opacity: 0;
  font-size: 13px;
}

.basic-info-row.selectable:hover .basic-info-arrow {
  opacity: 0.78;
}

.basic-info-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  pointer-events: none;
}

.basic-info-row:hover:not(.editing) .basic-info-actions {
  opacity: 1;
  pointer-events: auto;
}

.basic-info-action {
  width: 22px;
  height: 22px;
  border: 0;
  background: transparent;
  color: rgba(24, 24, 24, 0.72);
  font-weight: 900;
  cursor: pointer;
}

.basic-info-action:hover {
  color: rgba(0, 0, 0, 0.92);
}

.basic-info-input {
  width: min(210px, 18vw);
  height: 24px;
  border: 1px solid rgba(0, 0, 0, 0.28);
  background: rgba(255, 255, 255, 0.82);
  color: rgba(24, 24, 24, 0.9);
  font: inherit;
  line-height: inherit;
  font-size: inherit;
  font-family: inherit;
  font-weight: inherit;
  outline: none;
  user-select: text;
}

.basic-info-input:focus {
  border-color: rgba(0, 0, 0, 0.58);
  background: rgba(255, 255, 255, 0.95);
}

.basic-info-inline-input {
  width: min(260px, 20vw);
  height: 30px;
  padding: 0;
  border: 0;
  background: transparent;
  caret-color: rgba(0, 0, 0, 0.92);
  vertical-align: baseline;
}

.basic-info-inline-input:focus {
  border: 0;
  background: transparent;
}

.basic-info-search-input {
  cursor: text;
}

.basic-info-search-wrap {
  display: inline-flex;
}

.basic-info-options {
  position: fixed;
  z-index: 60;
  min-width: 220px;
  max-height: 180px;
  overflow: auto;
  border: 1px solid rgba(0, 0, 0, 0.22);
  background: rgba(235, 235, 232, 0.98);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
}

.basic-info-options-floating {
  pointer-events: auto;
}

.basic-info-option {
  display: block;
  width: 100%;
  min-height: 30px;
  padding: 4px 10px;
  border: 0;
  background: transparent;
  color: rgba(24, 24, 24, 0.86);
  text-align: left;
  font-weight: 700;
  cursor: pointer;
}

.basic-info-option:hover {
  background: rgba(0, 0, 0, 0.08);
}

.basic-info-empty-option {
  padding: 8px 10px;
  color: rgba(24, 24, 24, 0.56);
  font-weight: 700;
}

.basic-info-dialog-backdrop {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.14);
}

.basic-info-dialog {
  width: min(420px, 86vw);
  border: 1px solid rgba(0, 0, 0, 0.28);
  background: rgba(224, 224, 221, 0.98);
  box-shadow: 0 20px 48px rgba(0, 0, 0, 0.24);
  color: rgba(24, 24, 24, 0.9);
}

.basic-info-dialog-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: rgba(42, 42, 42, 0.92);
  color: rgba(255, 255, 255, 0.94);
}

.basic-info-dialog-head h3 {
  margin: 0;
  font-size: 17px;
}

.basic-info-dialog-close {
  border: 0;
  background: transparent;
  color: inherit;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.basic-info-dialog-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid rgba(0, 0, 0, 0.16);
}

.basic-info-dialog-tab {
  min-height: 42px;
  border: 0;
  background: rgba(255, 255, 255, 0.14);
  color: rgba(24, 24, 24, 0.76);
  font-weight: 800;
  cursor: pointer;
}

.basic-info-dialog-tab.active {
  background: rgba(0, 0, 0, 0.1);
  color: rgba(0, 0, 0, 0.92);
}

.basic-info-dialog-body {
  min-height: 150px;
  padding: 16px;
  box-sizing: border-box;
}

.basic-info-default-option {
  display: block;
  width: 100%;
  min-height: 34px;
  border: 0;
  background: transparent;
  color: rgba(24, 24, 24, 0.82);
  text-align: left;
  font-weight: 800;
  cursor: pointer;
}

.basic-info-default-option:hover,
.basic-info-default-option.active {
  background: rgba(0, 0, 0, 0.08);
}

.basic-info-dialog-empty {
  color: rgba(24, 24, 24, 0.58);
  font-weight: 700;
}

.basic-info-dialog-field {
  display: grid;
  gap: 8px;
  margin-bottom: 14px;
  font-weight: 800;
}

.basic-info-dialog-field input {
  height: 34px;
  border: 1px solid rgba(0, 0, 0, 0.24);
  background: rgba(255, 255, 255, 0.68);
  color: rgba(24, 24, 24, 0.9);
  font: inherit;
  outline: none;
  user-select: text;
}

.basic-info-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 16px 16px;
}

.basic-info-dialog-btn {
  min-width: 86px;
  height: 34px;
  border: 0;
  background: rgba(42, 42, 42, 0.92);
  color: rgba(255, 255, 255, 0.94);
  font-weight: 800;
  cursor: pointer;
}

.basic-info-dialog-btn.subtle {
  background: rgba(0, 0, 0, 0.12);
  color: rgba(24, 24, 24, 0.78);
}

.basic-info-dialog-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
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
  .identity-panel {
    left: 40px;
    bottom: 110px;
  }
}

@media (max-width: 1024px) {
  .character-transform-layer {
    max-width: calc(100vw - var(--dossier-panel-width) - 48px);
  }

  .identity-panel {
    left: 36px;
    bottom: 450px;
    width: min(42vw, 360px);
  }
}

@media (max-width: 760px) {
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

  .workspace-entry-tabs {
    top: 74px;
    left: 0;
    right: 0;
    width: 100%;
    transform: none;
    justify-content: center;
  }

  .workspace-entry-tab {
    min-width: 0;
    flex: 1;
    padding: 0 10px;
  }

  .character-transform-layer {
    max-width: 68vw;
  }

  .portrait-replace-button {
    top: 116px;
    right: 0;
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
