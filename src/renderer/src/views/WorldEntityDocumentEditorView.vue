<template>
  <!-- 世界实体文档工作台 -->
  <div
    class="worldbuilding-white-theme narrative-editor-page"
    :class="{
      'resizing-sidebar': resizingNarrativeSidebar,
      'resizing-ai-panel': resizingNarrativeAiPanel
    }"
    :style="narrativeSidebarStyle"
  >
    <aside class="narrative-sidebar">
      <header class="sidebar-home">
        <button
          type="button"
          class="sidebar-home-link"
          aria-label="返回当前实体"
          title="返回当前实体"
          @click="navigateToEntityHome"
        >
          <span class="sidebar-icon back-icon" aria-hidden="true">‹</span>
        </button>
        <span class="sidebar-world-name" :title="worldDetail?.name">{{ worldDetail?.name || '世界文档库' }}</span>
        <button type="button" class="sidebar-menu-btn" aria-label="更多">...</button>
      </header>

      <section class="catalog-panel">
        <div class="catalog-scope">
          <label class="catalog-type-select">
            <span class="sr-only">选择实体类型</span>
            <select
              v-model="selectedEntityType"
              aria-label="选择文本分类"
              @change="handleDocumentScopeChange"
            >
              <option
                v-for="option in entityTypeOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <span class="catalog-select-caret" aria-hidden="true">⌄</span>
          </label>
          <input
            v-if="!isBasicSettingsScope"
            v-model="entitySearchQuery"
            class="catalog-search"
            type="search"
            placeholder="查找实体"
            aria-label="查找实体"
          />
        </div>

        <header class="catalog-head">
          <div class="catalog-title">
            <span class="sidebar-icon" aria-hidden="true">☷</span>
            <span>目录</span>
          </div>
          <div class="catalog-actions">
            <button
              type="button"
              aria-label="在当前实体中新建文件"
              :title="isBasicSettingsScope ? '新建一级基础设定' : '在当前实体中新建文件'"
              :disabled="!canCreateNarrativeDocument"
              @click="createNarrativeDocument()"
            >
              +
            </button>
            <button type="button" aria-label="目录设置">☰</button>
          </div>
        </header>

        <div v-if="worldEntitiesLoading || narrativeDocumentsLoading" class="catalog-empty">
          正在读取文档
        </div>
        <div
          v-else-if="isBasicSettingsScope && narrativeTreeRows.length === 0"
          class="catalog-empty"
        >
          暂无基础设定，点击上方 + 新建
        </div>
        <div v-else-if="isBasicSettingsScope" class="catalog-tree basic-settings-tree">
          <div
            v-for="row in narrativeTreeRows"
            :key="row.id"
            class="catalog-tree-row"
            :class="{
              active: row.id === activeDocumentId,
              dragging: row.id === draggingDocumentId,
              'drop-before': dropTarget?.documentId === row.id && dropTarget.position === 'before',
              'drop-after': dropTarget?.documentId === row.id && dropTarget.position === 'after',
              'drop-inside': dropTarget?.documentId === row.id && dropTarget.position === 'inside'
            }"
            :style="{ '--tree-depth': row.depth }"
            draggable="true"
            @dragstart="handleNarrativeDragStart(row.id, $event)"
            @dragover.prevent="handleNarrativeDragOver(row.id, $event)"
            @dragleave="handleNarrativeDragLeave(row.id)"
            @drop.prevent="handleNarrativeDrop"
            @dragend="clearNarrativeDragState"
          >
            <button
              type="button"
              class="catalog-tree-item"
              @click="selectNarrativeDocument(row.id)"
            >
              <span class="catalog-tree-caret" aria-hidden="true">{{
                row.children.length ? '⌄' : ''
              }}</span>
              <span class="catalog-tree-title">{{ row.title }}</span>
            </button>
            <button
              type="button"
              class="catalog-row-action"
              aria-label="新建子文件"
              title="新建子文件"
              @click.stop="createNarrativeDocument(row.id)"
            >
              +
            </button>
            <button
              type="button"
              class="catalog-row-action danger"
              aria-label="删除文件"
              title="删除文件"
              @click.stop="openNarrativeDeleteConfirm(row.id)"
            >
              ×
            </button>
          </div>
        </div>
        <div v-else-if="catalogEntities.length === 0" class="catalog-empty">当前分类暂无实体</div>
        <div v-else class="catalog-tree entity-catalog-tree">
          <template v-for="entity in catalogEntities" :key="entity.id">
            <div
              class="catalog-entity-row"
              :class="{ active: entity.id === entityDetail?.entity.id }"
            >
              <button
                type="button"
                class="catalog-entity-toggle"
                :aria-label="expandedEntityId === entity.id ? '收起实体文档' : '展开实体文档'"
                @click="toggleEntityRoot(entity)"
              >
                {{ expandedEntityId === entity.id ? '⌄' : '›' }}
              </button>
              <button
                type="button"
                class="catalog-entity-name"
                :title="entity.name"
                @click="activateCatalogEntity(entity)"
              >
                <span>{{ entity.name }}</span>
                <small v-if="selectedEntityType === 'all'">{{ getEntityTypeLabel(entity.type) }}</small>
              </button>
              <button
                type="button"
                class="catalog-entity-add"
                aria-label="为该实体新建文件"
                title="为该实体新建文件"
                @click.stop="createNarrativeDocumentForEntity(entity)"
              >
                +
              </button>
            </div>

            <div
              v-if="expandedEntityId === entity.id && narrativeDocumentsLoading"
              class="catalog-empty catalog-entity-empty"
            >
              正在读取文档
            </div>
            <div
              v-else-if="
                expandedEntityId === entity.id &&
                entity.id === entityDetail?.entity.id &&
                narrativeTreeRows.length === 0
              "
              class="catalog-empty catalog-entity-empty"
            >
              暂无文档
            </div>

            <div
              v-for="row in expandedEntityId === entity.id && entity.id === entityDetail?.entity.id
                ? narrativeTreeRows
                : []"
              :key="row.id"
              class="catalog-tree-row"
              :class="{
                active: row.id === activeDocumentId,
                dragging: row.id === draggingDocumentId,
                'drop-before': dropTarget?.documentId === row.id && dropTarget.position === 'before',
                'drop-after': dropTarget?.documentId === row.id && dropTarget.position === 'after',
                'drop-inside': dropTarget?.documentId === row.id && dropTarget.position === 'inside'
              }"
              :style="{ '--tree-depth': row.depth + 1 }"
              draggable="true"
              @dragstart="handleNarrativeDragStart(row.id, $event)"
              @dragover.prevent="handleNarrativeDragOver(row.id, $event)"
              @dragleave="handleNarrativeDragLeave(row.id)"
              @drop.prevent="handleNarrativeDrop"
              @dragend="clearNarrativeDragState"
            >
            <button
              type="button"
              class="catalog-tree-item"
              @click="selectNarrativeDocument(row.id)"
            >
              <span class="catalog-tree-caret" aria-hidden="true">{{ row.children.length ? '⌄' : '' }}</span>
              <span class="catalog-tree-title">{{ row.title }}</span>
            </button>
            <button
              type="button"
              class="catalog-row-action"
              aria-label="新建子文件"
              title="新建子文件"
              @click.stop="createNarrativeDocument(row.id)"
            >
              +
            </button>
            <button
              type="button"
              class="catalog-row-action danger"
              aria-label="删除文件"
              title="删除文件"
              @click.stop="openNarrativeDeleteConfirm(row.id)"
            >
              ×
            </button>
            </div>
          </template>
        </div>
      </section>
    </aside>

    <div
      class="narrative-sidebar-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="调整目录宽度"
      title="调整目录宽度"
      @mousedown="startNarrativeSidebarResize"
    />

    <section class="narrative-main">
      <div class="format-toolbar" role="toolbar" aria-label="文本编辑工具栏">
        <div class="toolbar-group toolbar-group-primary">
          <button type="button" class="toolbar-add-btn" aria-label="新增文件" @click="createNarrativeDocument()">+</button>
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
            :class="{
              saving: savingNarrative,
              error: narrativeSaveState === 'error' || externalDocumentConflict
            }"
          >
            {{ narrativeSaveHint }}
          </span>
          <button
            type="button"
            class="toolbar-tool ai-panel-toggle"
            :class="{ active: showNarrativeAiPanel }"
            :aria-pressed="showNarrativeAiPanel"
            aria-label="打开 AI 对话侧边栏"
            title="AI 对话"
            @click="toggleNarrativeAiPanel"
          >
            AI
          </button>
        </div>
      </div>

      <main
        v-if="activeDocument"
        class="editor-workspace"
        :class="{ 'ai-panel-open': showNarrativeAiPanel }"
      >
        <WorldRichTextAppearancePanel
          v-if="showAppearancePanel"
          v-model="characterEditorAppearance"
          class="appearance-popover"
        />

        <section class="document-canvas">
          <div class="document-content-column">
            <input
              v-model="activeDocumentTitle"
              class="document-heading-input"
              type="text"
              aria-label="文件标题"
              placeholder="新建文件"
              @focus="handleNarrativeTitleFocus"
              @blur="handleNarrativeTitleBlur"
            />
          </div>

          <WorldRichTextEditor
            v-if="activeDocument"
            :key="activeDocumentId"
            v-model="characterDescriptionInput"
            class="narrative-editor"
            :placeholder="documentPlaceholder"
            :appearance="characterEditorAppearance"
            :show-toolbar-meta="false"
            :show-toolbar="false"
            theme="light"
            @stats-change="characterEditorStats = $event"
          />

          <span class="document-word-count">{{ characterEditorStats.characters }}字</span>
        </section>

        <div
          v-if="showNarrativeAiPanel"
          class="narrative-ai-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整 AI 对话宽度"
          title="调整 AI 对话宽度"
          @mousedown="startNarrativeAiPanelResize"
        />

        <aside v-if="showNarrativeAiPanel" class="narrative-ai-panel">
          <CompactAIChatPanel @close="showNarrativeAiPanel = false" />
        </aside>

        <aside v-else class="outline-panel">
          <h2>大纲</h2>
          <div v-if="outlineItems.length === 0" class="outline-empty">暂无标题</div>
          <button
            v-for="item in outlineItems"
            :key="`${item.level}-${item.text}`"
            type="button"
            class="outline-item"
            :class="`level-${item.level}`"
          >
            {{ item.text }}
          </button>
        </aside>
      </main>

      <main v-else-if="canCreateNarrativeDocument" class="editor-empty-state">
        <strong>{{ currentDocumentOwnerLabel }}</strong>
        <span>{{ isBasicSettingsScope ? '这个世界还没有基础设定' : '这个实体还没有文档' }}</span>
        <button type="button" @click="createNarrativeDocument()">新建文档</button>
      </main>

      <main v-else class="editor-loading">
        从左侧选择一个实体以打开文档
      </main>
    </section>

    <ConfirmDialog
      v-model="showNarrativeDeleteConfirm"
      title="确认删除文件？"
      :message="narrativeDeleteConfirmMessage"
      confirm-text="删除"
      loading-text="正在删除..."
      danger
      icon="danger"
      :loading="deletingNarrativeDocument"
      @confirm="confirmDeleteNarrativeDocument"
      @cancel="cancelNarrativeDeleteConfirm"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type {
  WorldEntityDetailPayload,
  WorldEntityPayload,
  WorldEntityType,
  WorldPayload
} from '@share/cache/worldbuilding/worldbuilding'
import {
  WORLD_ENTITY_DOCUMENT_OWNER_TYPES,
  isWorldEntityDocumentOwnerType,
  type WorldEntityDocumentOwnerRef,
  type WorldEntityDocumentOwnerType,
  type WorldEntityDocumentChangeEvent,
  type WorldEntityDocumentPayload
} from '@share/cache/worldbuilding/worldEntityDocument'
import { worldbuildingClientService } from '../services/worldbuildingClientService'
import { agentWorkspaceContextService } from '../services/agentWorkspaceContextService'
import { useKeyboardShortcut } from '../utils/useKeyboardShortcut'
import { useAppTitleBar } from '../composables/useAppTitleBar'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import CompactAIChatPanel from '../features/chat/components/CompactAIChatPanel.vue'
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
const router = useRouter()

type NarrativeTreeNode = WorldEntityDocumentPayload & {
  children: NarrativeTreeNode[]
  depth: number
}

type NarrativeDropPosition = 'before' | 'after' | 'inside'
type DocumentCatalogScope = WorldEntityDocumentOwnerType | 'all' | 'basic_settings'

const NARRATIVE_SIDEBAR_WIDTH_RATIO_STORAGE_KEY =
  'worldedit.worldEntityDocuments.sidebarWidthRatio.v1'
const NARRATIVE_AI_PANEL_WIDTH_STORAGE_KEY =
  'worldedit.worldEntityDocuments.aiPanelWidth.v1'
const DEFAULT_NARRATIVE_SIDEBAR_WIDTH_RATIO = 0.185
const MIN_NARRATIVE_SIDEBAR_WIDTH_RATIO = 0.1
const MAX_NARRATIVE_SIDEBAR_WIDTH_RATIO = 0.2
const DEFAULT_NARRATIVE_AI_PANEL_WIDTH = 420
const MIN_NARRATIVE_AI_PANEL_WIDTH = 320
const MAX_NARRATIVE_AI_PANEL_WIDTH = 640

const worldDetail = ref<WorldPayload | null>(null)
const worldEntities = ref<WorldEntityPayload[]>([])
const entityDetail = ref<WorldEntityDetailPayload | null>(null)
const narrativeDocuments = ref<WorldEntityDocumentPayload[]>([])
const activeDocumentId = ref('')
const activeDocumentTitle = ref('新建文件')
const characterDescriptionInput = ref('')
const characterEditorAppearance = ref<WorldRichTextAppearance>(DEFAULT_WORLD_RICH_TEXT_APPEARANCE)
const characterEditorStats = ref({ words: 0, characters: 0 })
const showAppearancePanel = ref(false)
const savingNarrative = ref(false)
const narrativeSaveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const externalDocumentConflict = ref(false)
const narrativeDocumentsLoading = ref(false)
const worldEntitiesLoading = ref(false)
const selectedEntityType = ref<DocumentCatalogScope>('all')
const entitySearchQuery = ref('')
const expandedEntityId = ref('')
const narrativeTitleFocused = ref(false)
const showNarrativeDeleteConfirm = ref(false)
const deletingNarrativeDocument = ref(false)
const pendingDeleteDocumentId = ref('')
const draggingDocumentId = ref('')
const dropTarget = ref<{ documentId: string; position: NarrativeDropPosition } | null>(null)
const narrativeSidebarWidth = ref(356)
const resizingNarrativeSidebar = ref(false)
const showNarrativeAiPanel = ref(false)
const narrativeAiPanelWidth = ref(DEFAULT_NARRATIVE_AI_PANEL_WIDTH)
const resizingNarrativeAiPanel = ref(false)

let syncingFromDetail = false
let narrativeAutosaveTimer: ReturnType<typeof setTimeout> | null = null
let narrativeSaveQueued = false
let lastSavedNarrativeSignature = ''
let removeDocumentChangeListener: (() => void) | null = null

const worldId = computed(() => String(route.params.worldId || ''))
const entityId = computed(() => String(route.params.entityId || ''))
const titleBarWorldName = computed(() => worldDetail.value?.name?.trim() || '世界文档库')
const titleBarEntityContext = computed(() => {
  if (isBasicSettingsScope.value) return '基础设定'
  const entity = entityDetail.value?.entity
  return entity ? `${getEntityTypeLabel(entity.type)} / ${entity.name}` : '文本'
})
const narrativeSidebarStyle = computed(() => ({
  '--narrative-sidebar-width': `${narrativeSidebarWidth.value}px`,
  '--narrative-ai-panel-width': `${narrativeAiPanelWidth.value}px`
}))

const entityTypeOptions: Array<{ value: DocumentCatalogScope; label: string }> = [
  { value: 'all', label: '全部文本' },
  { value: 'basic_settings', label: '基础设定' },
  { value: 'character', label: '人物' },
  { value: 'race', label: '种族' },
  { value: 'faction', label: '势力' },
  { value: 'nation', label: '国家' },
  { value: 'city', label: '城市' },
  { value: 'region', label: '地域' },
  { value: 'map', label: '地图' }
]

const entityTypeOrder = new Map<WorldEntityType, number>(
  WORLD_ENTITY_DOCUMENT_OWNER_TYPES.map((entityType, index) => [entityType, index])
)

const getEntityTypeLabel = (type: WorldEntityType): string =>
  entityTypeOptions.find((option) => option.value === type)?.label || type

const isBasicSettingsScope = computed(() => selectedEntityType.value === 'basic_settings')

const catalogEntities = computed(() => {
  const query = entitySearchQuery.value.trim().toLocaleLowerCase()
  return worldEntities.value
    .filter((entity) => isWorldEntityDocumentOwnerType(entity.type))
    .filter((entity) => selectedEntityType.value === 'all' || entity.type === selectedEntityType.value)
    .filter((entity) => !query || entity.name.toLocaleLowerCase().includes(query))
    .sort((a, b) => {
      const typeCompare =
        (entityTypeOrder.get(a.type) ?? Number.MAX_SAFE_INTEGER) -
        (entityTypeOrder.get(b.type) ?? Number.MAX_SAFE_INTEGER)
      return typeCompare || a.name.localeCompare(b.name, 'zh-CN')
    })
})

const documentPlaceholderByType: Record<WorldEntityDocumentOwnerType, string> = {
  character: '写下人物介绍、经历、关系、秘密与转折。',
  race: '写下种族特征、文化、分支、分布与历史。',
  faction: '写下组织目标、结构、成员、行动与关系。',
  nation: '写下国家历史、制度、疆域、社会与冲突。',
  city: '写下城市区域、居民、建筑、事件与风貌。',
  region: '写下地域地貌、生态、聚落、资源与历史。',
  map: '写下地图范围、地理结构、图例与设定。'
}

const documentPlaceholder = computed(() => {
  if (isBasicSettingsScope.value) {
    return '写下世界的力量层级、现实贴近程度、普遍规律与基础约束。'
  }
  const entityType = entityDetail.value?.entity.type
  return entityType && isWorldEntityDocumentOwnerType(entityType)
    ? documentPlaceholderByType[entityType]
    : '写下这个实体的设定与关联信息。'
})
const activeDocument = computed(
  () => narrativeDocuments.value.find((document) => document.id === activeDocumentId.value) ?? null
)
const activeDocumentOwner = computed<WorldEntityDocumentOwnerRef | null>(() => {
  if (!worldId.value) return null
  if (isBasicSettingsScope.value) {
    return { kind: 'world', worldId: worldId.value }
  }
  const entity = entityDetail.value?.entity
  return entity
    ? { kind: 'entity', worldId: worldId.value, entityId: entity.id }
    : null
})

watch(
  [worldDetail, entityDetail, activeDocument],
  ([world, detail, document]) => {
    const entity = detail?.entity
    agentWorkspaceContextService.update({
      pageKind: 'document',
      routeName: 'WorldEntityDocumentEditor',
      world: worldId.value
        ? {
            id: worldId.value,
            name: world?.name
          }
        : undefined,
      entity: entity
        ? {
            id: entity.id,
            type: isWorldEntityDocumentOwnerType(entity.type) ? entity.type : undefined,
            name: entity.name
          }
        : undefined,
      document: document
        ? {
            id: document.id,
            title: document.title,
            ownerKind: document.ownerKind,
            parentDocumentId: document.parentDocumentId,
            revision: document.revision
          }
        : undefined
    })
  },
  { immediate: true }
)

const canCreateNarrativeDocument = computed(() => Boolean(activeDocumentOwner.value))
const currentDocumentOwnerLabel = computed(() =>
  isBasicSettingsScope.value
    ? '基础设定'
    : entityDetail.value?.entity.name || '世界文档'
)
const narrativeTree = computed<NarrativeTreeNode[]>(() => {
  const byParent = new Map<string, WorldEntityDocumentPayload[]>()

  for (const document of narrativeDocuments.value) {
    const parentKey = document.parentDocumentId || ''
    byParent.set(parentKey, [...(byParent.get(parentKey) ?? []), document])
  }

  for (const documents of byParent.values()) {
    documents.sort((a, b) => {
      const sortCompare = a.sortKey.localeCompare(b.sortKey)
      if (sortCompare !== 0) return sortCompare
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    })
  }

  const buildNodes = (parentDocumentId: string, depth: number): NarrativeTreeNode[] =>
    (byParent.get(parentDocumentId) ?? []).map((document) => ({
      ...document,
      depth,
      children: buildNodes(document.id, depth + 1)
    }))

  return buildNodes('', 0)
})
const narrativeTreeRows = computed<NarrativeTreeNode[]>(() => {
  const rows: NarrativeTreeNode[] = []
  const appendRows = (nodes: NarrativeTreeNode[]): void => {
    for (const node of nodes) {
      rows.push(node)
      appendRows(node.children)
    }
  }
  appendRows(narrativeTree.value)
  return rows
})
const narrativeDocumentById = computed(
  () => new Map(narrativeDocuments.value.map((document) => [document.id, document]))
)
const outlineItems = computed(() => {
  const items: Array<{ level: number; text: string }> = []
  const title = activeDocumentTitle.value.trim()
  if (title) {
    items.push({ level: 1, text: title })
  }

  if (typeof DOMParser === 'undefined') return items
  const html = characterDescriptionInput.value.trim()
  if (!html) return items

  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll('h1, h2, h3').forEach((heading) => {
    const text = heading.textContent?.trim()
    if (!text) return
    const level = Number(heading.tagName.slice(1))
    items.push({ level, text })
  })

  return items
})

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

const canSaveNarrative = computed(() => Boolean(activeDocument.value))

const pendingDeleteDocument = computed(() =>
  pendingDeleteDocumentId.value ? getNarrativeDocument(pendingDeleteDocumentId.value) : null
)

const pendingDeleteDescendantIds = computed(() =>
  pendingDeleteDocumentId.value ? getNarrativeDescendantIds(pendingDeleteDocumentId.value) : []
)

const narrativeDeleteConfirmMessage = computed(() => {
  const document = pendingDeleteDocument.value
  if (!document) return '确认删除该文件吗？'
  const descendantCount = pendingDeleteDescendantIds.value.length
  return descendantCount > 0
    ? `删除「${document.title}」以及它的 ${descendantCount} 个子文件？`
    : `删除「${document.title}」？`
})

const narrativeSaveHint = computed(() => {
  if (externalDocumentConflict.value) return '检测到外部更新'
  if (narrativeSaveState.value === 'saving') return '自动保存中...'
  if (narrativeSaveState.value === 'saved') return '已自动保存'
  if (narrativeSaveState.value === 'error') return '自动保存失败'
  return '自动保存'
})

const getNarrativeSidebarBounds = (): { min: number; max: number } => {
  const viewportWidth = typeof window === 'undefined' ? 1920 : window.innerWidth
  return {
    min: Math.round(viewportWidth * MIN_NARRATIVE_SIDEBAR_WIDTH_RATIO),
    max: Math.round(viewportWidth * MAX_NARRATIVE_SIDEBAR_WIDTH_RATIO)
  }
}

const clampNarrativeSidebarWidth = (width: number): number => {
  const bounds = getNarrativeSidebarBounds()
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(width)))
}

const clampNarrativeSidebarRatio = (ratio: number): number =>
  Math.min(MAX_NARRATIVE_SIDEBAR_WIDTH_RATIO, Math.max(MIN_NARRATIVE_SIDEBAR_WIDTH_RATIO, ratio))

const getNarrativeViewportWidth = (): number =>
  typeof window === 'undefined' ? 1920 : Math.max(1, window.innerWidth)

const clampNarrativeAiPanelWidth = (width: number): number => {
  const viewportWidth = getNarrativeViewportWidth()
  const maxWidth = Math.min(MAX_NARRATIVE_AI_PANEL_WIDTH, Math.round(viewportWidth * 0.46))
  return Math.min(maxWidth, Math.max(MIN_NARRATIVE_AI_PANEL_WIDTH, Math.round(width)))
}

const loadNarrativeSidebarWidth = (): void => {
  if (typeof window === 'undefined') {
    narrativeSidebarWidth.value = clampNarrativeSidebarWidth(
      getNarrativeViewportWidth() * DEFAULT_NARRATIVE_SIDEBAR_WIDTH_RATIO
    )
    return
  }

  const storedRatio = Number(window.localStorage.getItem(NARRATIVE_SIDEBAR_WIDTH_RATIO_STORAGE_KEY))
  const ratio = Number.isFinite(storedRatio)
    ? clampNarrativeSidebarRatio(storedRatio)
    : DEFAULT_NARRATIVE_SIDEBAR_WIDTH_RATIO
  narrativeSidebarWidth.value = clampNarrativeSidebarWidth(getNarrativeViewportWidth() * ratio)
}

const loadNarrativeAiPanelWidth = (): void => {
  if (typeof window === 'undefined') {
    narrativeAiPanelWidth.value = DEFAULT_NARRATIVE_AI_PANEL_WIDTH
    return
  }
  const stored = Number(window.localStorage.getItem(NARRATIVE_AI_PANEL_WIDTH_STORAGE_KEY))
  narrativeAiPanelWidth.value = clampNarrativeAiPanelWidth(
    Number.isFinite(stored) ? stored : DEFAULT_NARRATIVE_AI_PANEL_WIDTH
  )
}

const persistNarrativeAiPanelWidth = (): void => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    NARRATIVE_AI_PANEL_WIDTH_STORAGE_KEY,
    String(clampNarrativeAiPanelWidth(narrativeAiPanelWidth.value))
  )
}

const persistNarrativeSidebarWidth = (): void => {
  if (typeof window === 'undefined') return
  const ratio = clampNarrativeSidebarRatio(narrativeSidebarWidth.value / getNarrativeViewportWidth())
  window.localStorage.setItem(NARRATIVE_SIDEBAR_WIDTH_RATIO_STORAGE_KEY, ratio.toFixed(4))
}

const syncNarrativeSidebarWidthBounds = (): void => {
  narrativeSidebarWidth.value = clampNarrativeSidebarWidth(narrativeSidebarWidth.value)
  persistNarrativeSidebarWidth()
  narrativeAiPanelWidth.value = clampNarrativeAiPanelWidth(narrativeAiPanelWidth.value)
  persistNarrativeAiPanelWidth()
}

const handleNarrativeSidebarResizeMove = (event: MouseEvent): void => {
  if (!resizingNarrativeSidebar.value) return
  narrativeSidebarWidth.value = clampNarrativeSidebarWidth(event.clientX)
}

const stopNarrativeSidebarResize = (): void => {
  if (!resizingNarrativeSidebar.value) return
  resizingNarrativeSidebar.value = false
  persistNarrativeSidebarWidth()
  document.body.classList.remove('narrative-sidebar-resizing')
  window.removeEventListener('mousemove', handleNarrativeSidebarResizeMove)
  window.removeEventListener('mouseup', stopNarrativeSidebarResize)
}

const startNarrativeSidebarResize = (event: MouseEvent): void => {
  event.preventDefault()
  resizingNarrativeSidebar.value = true
  document.body.classList.add('narrative-sidebar-resizing')
  window.addEventListener('mousemove', handleNarrativeSidebarResizeMove)
  window.addEventListener('mouseup', stopNarrativeSidebarResize)
}

const handleNarrativeAiPanelResizeMove = (event: MouseEvent): void => {
  if (!resizingNarrativeAiPanel.value) return
  narrativeAiPanelWidth.value = clampNarrativeAiPanelWidth(
    getNarrativeViewportWidth() - event.clientX
  )
}

const stopNarrativeAiPanelResize = (): void => {
  if (!resizingNarrativeAiPanel.value) return
  resizingNarrativeAiPanel.value = false
  persistNarrativeAiPanelWidth()
  document.body.classList.remove('narrative-ai-panel-resizing')
  window.removeEventListener('mousemove', handleNarrativeAiPanelResizeMove)
  window.removeEventListener('mouseup', stopNarrativeAiPanelResize)
}

const startNarrativeAiPanelResize = (event: MouseEvent): void => {
  event.preventDefault()
  resizingNarrativeAiPanel.value = true
  document.body.classList.add('narrative-ai-panel-resizing')
  window.addEventListener('mousemove', handleNarrativeAiPanelResizeMove)
  window.addEventListener('mouseup', stopNarrativeAiPanelResize)
}

const toggleNarrativeAiPanel = (): void => {
  showNarrativeAiPanel.value = !showNarrativeAiPanel.value
}

useAppTitleBar(
  computed(() => ({
    title: titleBarWorldName.value,
    subtitle: titleBarEntityContext.value,
    meta: narrativeSaveHint.value
  }))
)

const narrativeAutosaveSignature = computed(() =>
  JSON.stringify({
    owner: activeDocument.value
      ? {
          kind: activeDocument.value.ownerKind,
          worldId: activeDocument.value.worldId,
          entityId: activeDocument.value.ownerEntityId
        }
      : activeDocumentOwner.value,
    documentId: activeDocumentId.value,
    title: activeDocumentTitle.value,
    description: characterDescriptionInput.value,
    editorAppearance: normalizeWorldRichTextAppearance(characterEditorAppearance.value)
  })
)

const normalizeNarrativeTitleForCommit = (): void => {
  activeDocumentTitle.value = activeDocumentTitle.value.trim() || '新建文件'
}

const handleNarrativeTitleFocus = (): void => {
  narrativeTitleFocused.value = true
}

const handleNarrativeTitleBlur = (): void => {
  narrativeTitleFocused.value = false
  normalizeNarrativeTitleForCommit()
  void saveNarrative(true, { fallbackBlankTitle: true })
}

const getLegacyNarrativeHtml = (): string => {
  const profile = getCharacterComponentByType<CharacterProfileData>(entityDetail.value, 'character_profile')
  return String(profile?.data?.description || '')
}

const syncAppearanceFromDetail = (): void => {
  if (entityDetail.value?.entity.type !== 'character') {
    characterEditorAppearance.value = DEFAULT_WORLD_RICH_TEXT_APPEARANCE
    return
  }
  const profile = getCharacterComponentByType<CharacterProfileData>(entityDetail.value, 'character_profile')
  characterEditorAppearance.value = normalizeWorldRichTextAppearance(profile?.data?.editorAppearance)
}

const syncNarrativeFromDocument = (document: WorldEntityDocumentPayload | null): void => {
  activeDocumentId.value = document?.id ?? ''
  activeDocumentTitle.value = document?.title || '新建文件'
  characterDescriptionInput.value = document?.contentHtml || ''
  lastSavedNarrativeSignature = narrativeAutosaveSignature.value
  narrativeSaveState.value = 'saved'
  externalDocumentConflict.value = false
}

const replaceNarrativeDocument = (nextDocument: WorldEntityDocumentPayload): void => {
  narrativeDocuments.value = [
    ...narrativeDocuments.value.filter((document) => document.id !== nextDocument.id),
    nextDocument
  ]
}

const createSortKeyForIndex = (index: number): string => String(index + 1).padStart(6, '0')

const getNarrativeDocument = (documentId: string): WorldEntityDocumentPayload | null =>
  narrativeDocumentById.value.get(documentId) ?? null

const getNarrativeChildren = (parentDocumentId: string | null): WorldEntityDocumentPayload[] =>
  narrativeDocuments.value
    .filter((document) => (document.parentDocumentId || null) === parentDocumentId)
    .sort((a, b) => {
      const sortCompare = a.sortKey.localeCompare(b.sortKey)
      if (sortCompare !== 0) return sortCompare
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
    })

const getNarrativeDescendantIds = (documentId: string): string[] => {
  const descendants: string[] = []
  const queue = [documentId]

  while (queue.length > 0) {
    const currentId = queue.shift()
    if (!currentId) continue
    const childIds = getNarrativeChildren(currentId).map((document) => document.id)
    descendants.push(...childIds)
    queue.push(...childIds)
  }

  return descendants
}

const canMoveNarrativeDocumentToParent = (
  documentId: string,
  parentDocumentId: string | null
): boolean => {
  if (!documentId) return false
  if (!parentDocumentId) return true
  if (parentDocumentId === documentId) return false
  return !getNarrativeDescendantIds(documentId).includes(parentDocumentId)
}

const applyNarrativeDocumentUpdates = (updates: WorldEntityDocumentPayload[]): void => {
  if (updates.length === 0) return
  const updateMap = new Map(updates.map((document) => [document.id, document]))
  narrativeDocuments.value = narrativeDocuments.value.map((document) => updateMap.get(document.id) ?? document)
}

const moveDocumentsIntoOrderedSiblings = async (
  parentDocumentId: string | null,
  orderedSiblingIds: string[]
): Promise<void> => {
  const uniqueSiblingIds = [...new Set(orderedSiblingIds)]
  const updates = await Promise.all(
    uniqueSiblingIds.map((documentId, index) =>
      worldbuildingClientService.moveWorldEntityDocument({
        documentId,
        expectedRevision:
          narrativeDocumentById.value.get(documentId)?.revision ?? 1,
        parentDocumentId,
        sortKey: createSortKeyForIndex(index)
      })
    )
  )
  applyNarrativeDocumentUpdates(updates)
}

const placeNarrativeDocument = async (
  documentId: string,
  parentDocumentId: string | null,
  siblingIds: string[]
): Promise<void> => {
  if (!canMoveNarrativeDocumentToParent(documentId, parentDocumentId)) return
  await saveNarrative(true, { fallbackBlankTitle: true })
  await moveDocumentsIntoOrderedSiblings(parentDocumentId, siblingIds)
}

const clearNarrativeDragState = (): void => {
  draggingDocumentId.value = ''
  dropTarget.value = null
}

const handleNarrativeDragStart = (documentId: string, event: DragEvent): void => {
  draggingDocumentId.value = documentId
  dropTarget.value = null
  event.dataTransfer?.setData('text/plain', documentId)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
}

const getNarrativeDropPosition = (event: DragEvent): NarrativeDropPosition => {
  const target = event.currentTarget
  if (!(target instanceof HTMLElement)) return 'inside'
  const rect = target.getBoundingClientRect()
  const offsetY = event.clientY - rect.top
  if (offsetY < rect.height * 0.25) return 'before'
  if (offsetY > rect.height * 0.75) return 'after'
  return 'inside'
}

const handleNarrativeDragOver = (documentId: string, event: DragEvent): void => {
  const draggedId = draggingDocumentId.value || event.dataTransfer?.getData('text/plain') || ''
  if (!draggedId || draggedId === documentId) {
    dropTarget.value = null
    return
  }

  const position = getNarrativeDropPosition(event)
  const targetDocument = getNarrativeDocument(documentId)
  if (!targetDocument) return
  const parentDocumentId = position === 'inside' ? targetDocument.id : targetDocument.parentDocumentId || null
  if (!canMoveNarrativeDocumentToParent(draggedId, parentDocumentId)) {
    dropTarget.value = null
    return
  }

  dropTarget.value = { documentId, position }
}

const handleNarrativeDragLeave = (documentId: string): void => {
  if (dropTarget.value?.documentId === documentId) {
    dropTarget.value = null
  }
}

const handleNarrativeDrop = async (): Promise<void> => {
  const draggedId = draggingDocumentId.value
  const target = dropTarget.value
  if (!draggedId || !target || draggedId === target.documentId) {
    clearNarrativeDragState()
    return
  }

  const targetDocument = getNarrativeDocument(target.documentId)
  if (!targetDocument) {
    clearNarrativeDragState()
    return
  }

  if (target.position === 'inside') {
    const children = getNarrativeChildren(targetDocument.id)
      .map((document) => document.id)
      .filter((id) => id !== draggedId)
    await placeNarrativeDocument(draggedId, targetDocument.id, [...children, draggedId])
  } else {
    const parentDocumentId = targetDocument.parentDocumentId || null
    const siblingIds = getNarrativeChildren(parentDocumentId)
      .map((document) => document.id)
      .filter((id) => id !== draggedId)
    const targetIndex = siblingIds.indexOf(targetDocument.id)
    const insertIndex = target.position === 'before' ? targetIndex : targetIndex + 1
    siblingIds.splice(Math.max(0, insertIndex), 0, draggedId)
    await placeNarrativeDocument(draggedId, parentDocumentId, siblingIds)
  }

  clearNarrativeDragState()
}

const ensureInitialNarrativeDocument = async (): Promise<WorldEntityDocumentPayload | null> => {
  const owner = activeDocumentOwner.value
  if (!owner) return null

  narrativeDocumentsLoading.value = true
  try {
    let documents = await worldbuildingClientService.listWorldEntityDocuments(owner)

    const legacyNarrativeHtml =
      entityDetail.value?.entity.type === 'character' ? getLegacyNarrativeHtml() : ''
    if (documents.length === 0 && legacyNarrativeHtml.trim()) {
      const created = await worldbuildingClientService.createWorldEntityDocument({
        owner,
        title: '新建文件',
        contentHtml: legacyNarrativeHtml
      })
      documents = [created]
    }

    narrativeDocuments.value = documents
    return documents[0] ?? null
  } finally {
    narrativeDocumentsLoading.value = false
  }
}

const loadBasicSettings = async (): Promise<void> => {
  if (!worldId.value) return
  clearNarrativeAutosave()
  await saveNarrative(true, { fallbackBlankTitle: true })
  syncingFromDetail = true
  narrativeDocumentsLoading.value = true
  try {
    entityDetail.value = null
    expandedEntityId.value = ''
    characterEditorAppearance.value = DEFAULT_WORLD_RICH_TEXT_APPEARANCE
    const documents = await worldbuildingClientService.listWorldEntityDocuments({
      kind: 'world',
      worldId: worldId.value
    })
    narrativeDocuments.value = documents
    syncNarrativeFromDocument(documents[0] ?? null)
    await router.replace({
      name: 'WorldEntityDocumentEditor',
      params: { worldId: worldId.value },
      query: { scope: 'basic_settings' }
    })
  } finally {
    narrativeDocumentsLoading.value = false
    syncingFromDetail = false
  }
}

const loadEntityDetail = async (targetEntityId = entityId.value): Promise<void> => {
  if (!targetEntityId) {
    entityDetail.value = null
    narrativeDocuments.value = []
    syncNarrativeFromDocument(null)
    return
  }

  syncingFromDetail = true
  try {
    entityDetail.value = await worldbuildingClientService.getEntityDetail(targetEntityId)
    if (!entityDetail.value) {
      narrativeDocuments.value = []
      syncNarrativeFromDocument(null)
      return
    }
    expandedEntityId.value = entityDetail.value.entity.id
    syncAppearanceFromDetail()
    const document = await ensureInitialNarrativeDocument()
    syncNarrativeFromDocument(document)
  } finally {
    syncingFromDetail = false
  }
}

const loadDocumentWorkspace = async (): Promise<void> => {
  if (!worldId.value) return
  worldEntitiesLoading.value = true
  try {
    const [worlds, entities] = await Promise.all([
      worldbuildingClientService.listWorlds(),
      worldbuildingClientService.listEntities(worldId.value)
    ])
    worldDetail.value = worlds.find((world) => world.id === worldId.value) ?? null
    worldEntities.value = entities

    if (route.query.scope === 'basic_settings' || !entityId.value) {
      selectedEntityType.value = 'basic_settings'
      await loadBasicSettings()
      return
    }

    const documentEntities = entities.filter((entity) =>
      isWorldEntityDocumentOwnerType(entity.type)
    )
    const initialEntity =
      documentEntities.find((entity) => entity.id === entityId.value) ??
      documentEntities[0] ??
      null
    if (!initialEntity) {
      await loadEntityDetail('')
      return
    }
    selectedEntityType.value = isWorldEntityDocumentOwnerType(initialEntity.type)
      ? initialEntity.type
      : 'all'
    await loadEntityDetail(initialEntity.id)
  } finally {
    worldEntitiesLoading.value = false
  }
}

const handleDocumentScopeChange = async (): Promise<void> => {
  if (isBasicSettingsScope.value) {
    await loadBasicSettings()
    return
  }

  const nextEntity = catalogEntities.value[0] ?? null
  if (nextEntity) {
    await activateCatalogEntity(nextEntity)
    return
  }
  entityDetail.value = null
  narrativeDocuments.value = []
  syncNarrativeFromDocument(null)
}

const activateCatalogEntity = async (entity: WorldEntityPayload): Promise<void> => {
  if (entity.id === entityDetail.value?.entity.id) {
    expandedEntityId.value = entity.id
    return
  }

  clearNarrativeAutosave()
  await saveNarrative(true, { fallbackBlankTitle: true })
  narrativeDocuments.value = []
  syncNarrativeFromDocument(null)
  expandedEntityId.value = entity.id
  await router.replace({
    name: 'WorldEntityDocumentEditor',
    params: { worldId: worldId.value, entityId: entity.id },
    query: {}
  })
  await loadEntityDetail(entity.id)
}

const toggleEntityRoot = async (entity: WorldEntityPayload): Promise<void> => {
  if (expandedEntityId.value === entity.id) {
    expandedEntityId.value = ''
    return
  }
  expandedEntityId.value = entity.id
  await activateCatalogEntity(entity)
}

const createNarrativeDocumentForEntity = async (entity: WorldEntityPayload): Promise<void> => {
  await activateCatalogEntity(entity)
  await createNarrativeDocument()
}

const navigateToEntityHome = async (): Promise<void> => {
  const entity = entityDetail.value?.entity
  if (!entity) {
    await router.push({ name: 'WorldEditor', params: { worldId: worldId.value } })
    return
  }
  clearNarrativeAutosave()
  await saveNarrative(true, { fallbackBlankTitle: true }).catch(() => undefined)
  await router.push({
    name: entity.type === 'character' ? 'CharacterProfileEditor' : 'WorldEntityEditor',
    params: { worldId: worldId.value, entityId: entity.id }
  })
}

const selectNarrativeDocument = async (documentId: string): Promise<void> => {
  if (documentId === activeDocumentId.value) return
  clearNarrativeAutosave()
  await saveNarrative(true, { fallbackBlankTitle: true })
  const nextDocument = narrativeDocuments.value.find((document) => document.id === documentId) ?? null
  syncNarrativeFromDocument(nextDocument)
}

const createNarrativeDocument = async (parentDocumentId: string | null = null): Promise<void> => {
  const owner = activeDocumentOwner.value
  if (!owner) return
  clearNarrativeAutosave()
  await saveNarrative(true, { fallbackBlankTitle: true })
  const created = await worldbuildingClientService.createWorldEntityDocument({
    owner,
    parentDocumentId,
    title: '新建文件',
    contentHtml: ''
  })
  replaceNarrativeDocument(created)
  syncNarrativeFromDocument(created)
}

const openNarrativeDeleteConfirm = (documentId: string): void => {
  if (deletingNarrativeDocument.value) return
  const document = getNarrativeDocument(documentId)
  if (!document) return
  pendingDeleteDocumentId.value = documentId
  showNarrativeDeleteConfirm.value = true
}

const cancelNarrativeDeleteConfirm = (): void => {
  if (deletingNarrativeDocument.value) return
  pendingDeleteDocumentId.value = ''
}

const confirmDeleteNarrativeDocument = async (): Promise<void> => {
  const documentId = pendingDeleteDocumentId.value
  if (!documentId || deletingNarrativeDocument.value) return

  const document = getNarrativeDocument(documentId)
  if (!document) {
    showNarrativeDeleteConfirm.value = false
    pendingDeleteDocumentId.value = ''
    return
  }
  const descendantIds = pendingDeleteDescendantIds.value
  const recursive = descendantIds.length > 0

  deletingNarrativeDocument.value = true
  clearNarrativeAutosave()
  try {
    await saveNarrative(true, { fallbackBlankTitle: true })
    await worldbuildingClientService.deleteWorldEntityDocument({
      documentId,
      recursive
    })

    const deletedIds = new Set([documentId, ...descendantIds])
    const remainingDocuments = narrativeDocuments.value.filter((item) => !deletedIds.has(item.id))
    narrativeDocuments.value = remainingDocuments
    showNarrativeDeleteConfirm.value = false
    pendingDeleteDocumentId.value = ''

    if (!deletedIds.has(activeDocumentId.value)) return

    const nextDocument = remainingDocuments[0] ?? null
    if (nextDocument) {
      syncNarrativeFromDocument(nextDocument)
      return
    }

    syncNarrativeFromDocument(null)
  } finally {
    deletingNarrativeDocument.value = false
  }
}

const saveNarrative = async (
  force = false,
  options: { fallbackBlankTitle?: boolean } = {}
): Promise<void> => {
  if (!canSaveNarrative.value || !activeDocument.value) return
  if (!force && narrativeAutosaveSignature.value === lastSavedNarrativeSignature) return
  if (savingNarrative.value) {
    narrativeSaveQueued = true
    return
  }

  if (options.fallbackBlankTitle || !narrativeTitleFocused.value) {
    normalizeNarrativeTitleForCommit()
  }

  savingNarrative.value = true
  narrativeSaveState.value = 'saving'
  const signatureAtSave = narrativeAutosaveSignature.value
  const titleForSave = activeDocumentTitle.value.trim()
  try {
    const updated = await worldbuildingClientService.updateWorldEntityDocument({
      documentId: activeDocument.value.id,
      expectedRevision: activeDocument.value.revision,
      ...(titleForSave ? { title: titleForSave } : {}),
      contentHtml: characterDescriptionInput.value,
      contentFormat: 'html'
    })
    replaceNarrativeDocument(updated)
    lastSavedNarrativeSignature = signatureAtSave
    narrativeSaveState.value = 'saved'
  } catch (error) {
    narrativeSaveState.value = 'error'
    if (
      error instanceof Error &&
      error.message.toLocaleLowerCase().includes('revision conflict')
    ) {
      externalDocumentConflict.value = true
      clearNarrativeAutosave()
    }
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
  if (syncingFromDetail || externalDocumentConflict.value || !activeDocument.value) return
  clearNarrativeAutosave()
  if (narrativeTitleFocused.value) return
  if (!canSaveNarrative.value || narrativeAutosaveSignature.value === lastSavedNarrativeSignature) return
  narrativeSaveState.value = 'idle'
  narrativeAutosaveTimer = setTimeout(() => {
    narrativeAutosaveTimer = null
    void saveNarrative()
  }, delay)
}

const belongsToActiveOwner = (document: WorldEntityDocumentPayload): boolean => {
  const owner = activeDocumentOwner.value
  if (!owner) return false
  return owner.kind === 'world'
    ? document.ownerKind === 'world' && document.worldId === owner.worldId
    : document.ownerKind === 'entity' &&
        document.worldId === owner.worldId &&
        document.ownerEntityId === owner.entityId
}

const hasUnsavedNarrativeChanges = (): boolean =>
  savingNarrative.value ||
  narrativeAutosaveSignature.value !== lastSavedNarrativeSignature

const handleExternalDocumentChange = async (
  change: WorldEntityDocumentChangeEvent
): Promise<void> => {
  if (change.changeType === 'deleted') {
    const deletedIds = new Set(change.deletedDocumentIds ?? [change.documentId])
    const affectsCurrentOwner = narrativeDocuments.value.some((document) =>
      deletedIds.has(document.id)
    )
    if (!affectsCurrentOwner) return
    if (deletedIds.has(activeDocumentId.value) && hasUnsavedNarrativeChanges()) {
      externalDocumentConflict.value = true
      clearNarrativeAutosave()
      return
    }
    narrativeDocuments.value = narrativeDocuments.value.filter(
      (document) => !deletedIds.has(document.id)
    )
    if (deletedIds.has(activeDocumentId.value)) {
      syncNarrativeFromDocument(narrativeDocuments.value[0] ?? null)
    }
    return
  }

  const document = await worldbuildingClientService.getWorldEntityDocument(
    change.documentId
  )
  if (!document || !belongsToActiveOwner(document)) return
  if (document.id === activeDocumentId.value) {
    if (hasUnsavedNarrativeChanges()) {
      externalDocumentConflict.value = true
      clearNarrativeAutosave()
      return
    }
    replaceNarrativeDocument(document)
    syncNarrativeFromDocument(document)
    return
  }
  replaceNarrativeDocument(document)
}

onMounted(async () => {
  loadNarrativeSidebarWidth()
  loadNarrativeAiPanelWidth()
  window.addEventListener('resize', syncNarrativeSidebarWidthBounds)
  removeDocumentChangeListener = window.api.onWorldEntityDocumentChanged((change) => {
    void handleExternalDocumentChange(change)
  })
  await loadDocumentWorkspace()
})

watch(narrativeAutosaveSignature, () => {
  scheduleNarrativeAutosave()
})

onBeforeUnmount(() => {
  clearNarrativeAutosave()
  stopNarrativeSidebarResize()
  stopNarrativeAiPanelResize()
  window.removeEventListener('resize', syncNarrativeSidebarWidthBounds)
  removeDocumentChangeListener?.()
  removeDocumentChangeListener = null
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
    await saveNarrative(true, { fallbackBlankTitle: !narrativeTitleFocused.value })
  }
)
</script>

<style scoped>
.narrative-editor-page {
  --narrative-sidebar-width: 356px;
  --narrative-sidebar-resizer-width: 6px;
  --narrative-editor-left: 76px;
  --narrative-outline-width: 150px;
  --narrative-ai-panel-width: 420px;
  --narrative-ai-resizer-width: 6px;

  width: 100vw;
  height: 100%;
  display: grid;
  grid-template-columns: var(--narrative-sidebar-width) var(--narrative-sidebar-resizer-width) minmax(0, 1fr);
  overflow: hidden;
  background: var(--wb-narrative-bg);
  color: var(--wb-narrative-text);
}

.narrative-editor-page.resizing-sidebar,
.narrative-editor-page.resizing-ai-panel,
:global(body.narrative-sidebar-resizing),
:global(body.narrative-ai-panel-resizing) {
  cursor: col-resize;
  user-select: none;
}

.narrative-sidebar {
  min-width: 0;
  background: var(--wb-narrative-sidebar-bg);
  display: flex;
  flex-direction: column;
}

.narrative-sidebar-resizer {
  position: relative;
  min-width: var(--narrative-sidebar-resizer-width);
  height: 100%;
  border-left: 1px solid var(--wb-narrative-border);
  background: var(--wb-narrative-sidebar-bg);
  cursor: col-resize;
  z-index: 4;
}

.narrative-sidebar-resizer::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: transparent;
}

.narrative-sidebar-resizer:hover::before,
.narrative-editor-page.resizing-sidebar .narrative-sidebar-resizer::before {
  background: var(--wb-narrative-accent);
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
  width: 42px;
  min-width: 42px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  font-size: 24px;
  color: var(--wb-narrative-text-muted);
  cursor: pointer;
}

.sidebar-home-link:hover {
  background: var(--wb-narrative-hover);
  color: var(--wb-narrative-text);
}

.sidebar-icon {
  width: 18px;
  display: inline-flex;
  justify-content: center;
  color: var(--wb-narrative-text-muted);
}

.back-icon {
  width: auto;
  font-size: 30px;
  line-height: 1;
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

.sidebar-world-name {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  color: var(--wb-narrative-text-muted);
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.catalog-panel {
  min-height: 0;
  padding: 0 4px;
  overflow: auto;
}

.catalog-scope {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  padding: 8px 6px 6px;
  border-bottom: 1px solid var(--wb-narrative-border);
}

.catalog-type-select {
  position: relative;
  min-width: 0;
}

.catalog-type-select select,
.catalog-search {
  width: 100%;
  height: 32px;
  box-sizing: border-box;
  border: 1px solid var(--wb-narrative-border);
  border-radius: 6px;
  outline: 0;
  background: var(--wb-narrative-toolbar-bg);
  color: var(--wb-narrative-text);
  font: inherit;
  font-size: 13px;
}

.catalog-type-select select {
  padding: 0 30px 0 10px;
  appearance: none;
  cursor: pointer;
}

.catalog-search {
  padding: 0 10px;
}

.catalog-search::placeholder {
  color: var(--wb-narrative-text-faint);
}

.catalog-type-select select:focus,
.catalog-search:focus {
  border-color: var(--wb-narrative-accent);
}

.catalog-select-caret {
  position: absolute;
  top: 50%;
  right: 10px;
  transform: translateY(-50%);
  color: var(--wb-narrative-text-muted);
  pointer-events: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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

.catalog-actions button:disabled {
  opacity: 0.35;
  cursor: default;
}

.catalog-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.entity-catalog-tree {
  gap: 1px;
}

.catalog-entity-row {
  min-width: 0;
  height: 36px;
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) 26px;
  align-items: center;
  border-radius: 7px;
}

.catalog-entity-row:hover {
  background: var(--wb-narrative-hover);
}

.catalog-entity-row.active {
  background: var(--wb-narrative-active);
}

.catalog-entity-toggle,
.catalog-entity-name,
.catalog-entity-add {
  border: 0;
  background: transparent;
  color: var(--wb-narrative-text);
  font: inherit;
  cursor: pointer;
}

.catalog-entity-toggle {
  height: 30px;
  padding: 0;
  color: var(--wb-narrative-text-muted);
  font-size: 18px;
}

.catalog-entity-name {
  min-width: 0;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 4px;
  text-align: left;
}

.catalog-entity-name span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.catalog-entity-name small {
  flex-shrink: 0;
  color: var(--wb-narrative-text-faint);
  font-size: 11px;
}

.catalog-entity-add {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--wb-narrative-text-muted);
  opacity: 0;
}

.catalog-entity-row:hover .catalog-entity-add {
  opacity: 1;
}

.catalog-entity-add:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--wb-narrative-text);
}

.catalog-entity-empty {
  padding-left: 34px;
}

.catalog-tree-row {
  min-width: 0;
  height: 34px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(2, 24px);
  align-items: center;
  padding-left: calc(var(--tree-depth, 0) * 24px);
  border-radius: 7px;
  position: relative;
  opacity: 1;
}

.catalog-tree-row.active {
  background: var(--wb-narrative-active);
}

.catalog-tree-row:hover {
  background: var(--wb-narrative-hover);
}

.catalog-tree-row.dragging {
  opacity: 0.42;
}

.catalog-tree-row.drop-before::before,
.catalog-tree-row.drop-after::after {
  content: '';
  position: absolute;
  left: calc(var(--tree-depth, 0) * 24px + 8px);
  right: 8px;
  height: 2px;
  border-radius: 999px;
  background: var(--wb-narrative-accent);
}

.catalog-tree-row.drop-before::before {
  top: -2px;
}

.catalog-tree-row.drop-after::after {
  bottom: -2px;
}

.catalog-tree-row.drop-inside {
  outline: 1px solid var(--wb-narrative-accent);
  outline-offset: -1px;
}

.catalog-tree-item {
  min-width: 0;
  width: 100%;
  height: 28px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--wb-narrative-text);
  font: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}

.catalog-tree-caret {
  width: 14px;
  flex-shrink: 0;
  color: var(--wb-narrative-text-muted);
}

.catalog-tree-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.catalog-row-action {
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--wb-narrative-text-muted);
  cursor: pointer;
  opacity: 0;
  font-size: 13px;
}

.catalog-row-action:disabled {
  opacity: 0;
  cursor: not-allowed;
}

.catalog-tree-row:hover .catalog-row-action:not(:disabled) {
  opacity: 1;
}

.catalog-row-action:hover {
  background: rgba(0, 0, 0, 0.08);
  color: var(--wb-narrative-text);
}

.catalog-row-action.danger:hover {
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
}

.catalog-empty {
  padding: 10px 12px;
  color: var(--wb-narrative-text-muted);
  font-size: 13px;
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

.ai-panel-toggle {
  min-width: 30px;
  margin-left: 2px;
  border: 1px solid transparent;
  font-weight: 800;
}

.ai-panel-toggle.active {
  border-color: rgba(49, 92, 255, 0.22);
  background: rgba(49, 92, 255, 0.09);
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
  grid-template-columns: minmax(0, 1fr) var(--narrative-outline-width);
  overflow: hidden;
}

.editor-workspace.ai-panel-open {
  grid-template-columns:
    minmax(360px, 1fr)
    var(--narrative-ai-resizer-width)
    var(--narrative-ai-panel-width);
}

.document-canvas {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #ffffff;
}

.document-content-column {
  width: min(var(--wb-narrative-editor-width), calc(100% - var(--narrative-editor-left) - 24px));
  margin: 58px 0 0 var(--narrative-editor-left);
  color: var(--wb-narrative-text);
}

.document-heading-input {
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--wb-narrative-text);
  font-size: 34px;
  line-height: 1.25;
  font-weight: 800;
  font-family: inherit;
  letter-spacing: 0;
}

.document-heading-input::placeholder {
  color: var(--wb-narrative-text-faint);
}

.narrative-editor {
  position: absolute;
  inset: 144px 0 36px;
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
  padding: 62px 10px 0 0;
}

.narrative-ai-resizer {
  position: relative;
  min-width: var(--narrative-ai-resizer-width);
  height: 100%;
  border-left: 1px solid var(--wb-narrative-border);
  border-right: 1px solid var(--wb-narrative-border);
  background: #ffffff;
  cursor: col-resize;
  z-index: 5;
}

.narrative-ai-resizer::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  transform: translateX(-50%);
  background: transparent;
}

.narrative-ai-resizer:hover::before,
.narrative-editor-page.resizing-ai-panel .narrative-ai-resizer::before {
  background: var(--wb-narrative-accent);
}

.narrative-ai-panel {
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: #ffffff;
}

.outline-panel h2 {
  margin: 0;
  color: var(--wb-narrative-text);
  font-size: 15px;
  font-weight: 800;
}

.outline-empty {
  margin-top: 18px;
  color: var(--wb-narrative-text-faint);
  font-size: 12px;
}

.outline-item {
  display: block;
  width: 100%;
  min-height: 28px;
  margin-top: 8px;
  border: 0;
  background: transparent;
  color: var(--wb-narrative-text-muted);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.outline-item.level-2 {
  padding-left: 10px;
}

.outline-item.level-3 {
  padding-left: 20px;
  font-size: 12px;
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

.editor-empty-state {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--wb-narrative-text-muted);
}

.editor-empty-state strong {
  color: var(--wb-narrative-text);
  font-size: 18px;
}

.editor-empty-state button {
  height: 32px;
  margin-top: 6px;
  padding: 0 14px;
  border: 1px solid var(--wb-narrative-border);
  border-radius: 6px;
  background: var(--wb-narrative-toolbar-bg);
  color: var(--wb-narrative-text);
  font: inherit;
  cursor: pointer;
}

.editor-empty-state button:hover {
  border-color: var(--wb-narrative-accent);
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
  max-width: min(
    var(--wb-content-width, var(--wb-narrative-editor-width)),
    calc(100% - var(--narrative-editor-left) - 24px)
  );
  margin: 0 0 0 var(--narrative-editor-left);
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
    --narrative-sidebar-width: 260px;
    --narrative-editor-left: 38px;
  }

  .editor-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .editor-workspace.ai-panel-open {
    grid-template-columns: minmax(0, 1fr);
  }

  .outline-panel,
  .narrative-ai-resizer,
  .narrative-ai-panel {
    display: none;
  }

  .toolbar-status-group {
    margin-left: 0;
  }
}
</style>
