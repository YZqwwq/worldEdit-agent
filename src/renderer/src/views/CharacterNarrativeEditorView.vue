<template>
  <div class="worldbuilding-white-theme narrative-editor-page">
    <aside class="narrative-sidebar">
      <header class="sidebar-home">
        <router-link
          :to="{ name: 'WorldEntityEditor', params: { worldId, entityId } }"
          class="sidebar-home-link"
          aria-label="返回人物实例"
          title="返回人物实例"
        >
          <span class="sidebar-icon back-icon" aria-hidden="true">‹</span>
        </router-link>
        <button type="button" class="sidebar-menu-btn" aria-label="更多">...</button>
      </header>

      <section class="catalog-panel">
        <header class="catalog-head">
          <div class="catalog-title">
            <span class="sidebar-icon" aria-hidden="true">☷</span>
            <span>目录</span>
          </div>
          <div class="catalog-actions">
            <button type="button" aria-label="新建文件" title="新建文件" @click="createNarrativeDocument()">+</button>
            <button type="button" aria-label="目录设置">☰</button>
          </div>
        </header>

        <div v-if="narrativeDocumentsLoading" class="catalog-empty">正在读取目录</div>
        <div v-else-if="narrativeTreeRows.length === 0" class="catalog-empty">暂无文件</div>
        <div v-else class="catalog-tree">
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
              @click.stop="deleteNarrativeDocument(row.id)"
            >
              ×
            </button>
          </div>
        </div>
      </section>
    </aside>

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
            :class="{ saving: savingNarrative, error: narrativeSaveState === 'error' }"
          >
            {{ narrativeSaveHint }}
          </span>
        </div>
      </div>

      <main v-if="entityDetail" class="editor-workspace">
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
              @blur="saveNarrative(true)"
            />
          </div>

          <WorldRichTextEditor
            v-model="characterDescriptionInput"
            class="narrative-editor"
            placeholder="写下人物介绍、经历、关系、秘密与转折。"
            :appearance="characterEditorAppearance"
            :show-toolbar-meta="false"
            :show-toolbar="false"
            theme="light"
            @stats-change="characterEditorStats = $event"
          />

          <span class="document-word-count">{{ characterEditorStats.characters }}字</span>
        </section>

        <aside class="outline-panel">
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

      <main v-else class="editor-loading">
        正在读取文本编辑页面
      </main>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import type { WorldEntityDetailPayload } from '@share/cache/worldbuilding/worldbuilding'
import type { CharacterNarrativeDocumentPayload } from '@share/cache/worldbuilding/characterNarrativeDocument'
import { worldbuildingClientService } from '../services/worldbuildingClientService'
import { useKeyboardShortcut } from '../utils/useKeyboardShortcut'
import { useAppTitleBar } from '../composables/useAppTitleBar'
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

type NarrativeTreeNode = CharacterNarrativeDocumentPayload & {
  children: NarrativeTreeNode[]
  depth: number
}

type NarrativeDropPosition = 'before' | 'after' | 'inside'

const entityDetail = ref<WorldEntityDetailPayload | null>(null)
const narrativeDocuments = ref<CharacterNarrativeDocumentPayload[]>([])
const activeDocumentId = ref('')
const activeDocumentTitle = ref('新建文件')
const characterDescriptionInput = ref('')
const characterEditorAppearance = ref<WorldRichTextAppearance>(DEFAULT_WORLD_RICH_TEXT_APPEARANCE)
const characterEditorStats = ref({ words: 0, characters: 0 })
const showAppearancePanel = ref(false)
const savingNarrative = ref(false)
const narrativeSaveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')
const narrativeDocumentsLoading = ref(false)
const draggingDocumentId = ref('')
const dropTarget = ref<{ documentId: string; position: NarrativeDropPosition } | null>(null)

let syncingFromDetail = false
let narrativeAutosaveTimer: ReturnType<typeof setTimeout> | null = null
let narrativeSaveQueued = false
let lastSavedNarrativeSignature = ''

const worldId = computed(() => String(route.params.worldId || ''))
const entityId = computed(() => String(route.params.entityId || ''))
const documentTitle = computed(() => activeDocumentTitle.value.trim() || '新建文件')
const activeDocument = computed(
  () => narrativeDocuments.value.find((document) => document.id === activeDocumentId.value) ?? null
)
const narrativeTree = computed<NarrativeTreeNode[]>(() => {
  const byParent = new Map<string, CharacterNarrativeDocumentPayload[]>()

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

const canSaveNarrative = computed(() => Boolean(entityDetail.value && activeDocument.value))

const narrativeSaveHint = computed(() => {
  if (narrativeSaveState.value === 'saving') return '自动保存中...'
  if (narrativeSaveState.value === 'saved') return '已自动保存'
  if (narrativeSaveState.value === 'error') return '自动保存失败'
  return '自动保存'
})

useAppTitleBar(
  computed(() => ({
    title: documentTitle.value,
    subtitle: '▧',
    meta: narrativeSaveHint.value
  }))
)

const narrativeAutosaveSignature = computed(() =>
  JSON.stringify({
    entityId: entityDetail.value?.entity.id || '',
    documentId: activeDocumentId.value,
    title: activeDocumentTitle.value,
    description: characterDescriptionInput.value,
    editorAppearance: normalizeWorldRichTextAppearance(characterEditorAppearance.value)
  })
)

const getLegacyNarrativeHtml = (): string => {
  const profile = getCharacterComponentByType<CharacterProfileData>(entityDetail.value, 'character_profile')
  return String(profile?.data?.description || '')
}

const syncAppearanceFromDetail = (): void => {
  const profile = getCharacterComponentByType<CharacterProfileData>(entityDetail.value, 'character_profile')
  characterEditorAppearance.value = normalizeWorldRichTextAppearance(profile?.data?.editorAppearance)
}

const syncNarrativeFromDocument = (document: CharacterNarrativeDocumentPayload | null): void => {
  activeDocumentId.value = document?.id ?? ''
  activeDocumentTitle.value = document?.title || '新建文件'
  characterDescriptionInput.value = document?.contentHtml || ''
  lastSavedNarrativeSignature = narrativeAutosaveSignature.value
  narrativeSaveState.value = 'saved'
}

const replaceNarrativeDocument = (nextDocument: CharacterNarrativeDocumentPayload): void => {
  narrativeDocuments.value = [
    ...narrativeDocuments.value.filter((document) => document.id !== nextDocument.id),
    nextDocument
  ]
}

const createSortKeyForIndex = (index: number): string => String(index + 1).padStart(6, '0')

const getNarrativeDocument = (documentId: string): CharacterNarrativeDocumentPayload | null =>
  narrativeDocumentById.value.get(documentId) ?? null

const getNarrativeChildren = (parentDocumentId: string | null): CharacterNarrativeDocumentPayload[] =>
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

const applyNarrativeDocumentUpdates = (updates: CharacterNarrativeDocumentPayload[]): void => {
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
      worldbuildingClientService.moveCharacterNarrativeDocument({
        documentId,
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
  await saveNarrative(true)
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

const ensureInitialNarrativeDocument = async (): Promise<CharacterNarrativeDocumentPayload | null> => {
  if (!entityDetail.value) return null

  narrativeDocumentsLoading.value = true
  try {
    let documents = await worldbuildingClientService.listCharacterNarrativeDocuments(entityDetail.value.entity.id)

    if (documents.length === 0) {
      const created = await worldbuildingClientService.createCharacterNarrativeDocument({
        characterEntityId: entityDetail.value.entity.id,
        title: '新建文件',
        contentHtml: getLegacyNarrativeHtml()
      })
      documents = [created]
    }

    narrativeDocuments.value = documents
    return documents[0] ?? null
  } finally {
    narrativeDocumentsLoading.value = false
  }
}

const loadEntityDetail = async (): Promise<void> => {
  if (!entityId.value) {
    entityDetail.value = null
    narrativeDocuments.value = []
    syncNarrativeFromDocument(null)
    return
  }

  syncingFromDetail = true
  try {
    entityDetail.value = await worldbuildingClientService.getEntityDetail(entityId.value)
    syncAppearanceFromDetail()
    const document = await ensureInitialNarrativeDocument()
    syncNarrativeFromDocument(document)
  } finally {
    syncingFromDetail = false
  }
}

const selectNarrativeDocument = async (documentId: string): Promise<void> => {
  if (documentId === activeDocumentId.value) return
  clearNarrativeAutosave()
  await saveNarrative(true)
  const nextDocument = narrativeDocuments.value.find((document) => document.id === documentId) ?? null
  syncNarrativeFromDocument(nextDocument)
}

const createNarrativeDocument = async (parentDocumentId: string | null = null): Promise<void> => {
  if (!entityDetail.value) return
  clearNarrativeAutosave()
  await saveNarrative(true)
  const created = await worldbuildingClientService.createCharacterNarrativeDocument({
    characterEntityId: entityDetail.value.entity.id,
    parentDocumentId,
    title: '新建文件',
    contentHtml: ''
  })
  replaceNarrativeDocument(created)
  syncNarrativeFromDocument(created)
}

const deleteNarrativeDocument = async (documentId: string): Promise<void> => {
  const document = getNarrativeDocument(documentId)
  if (!document) return
  const descendantIds = getNarrativeDescendantIds(documentId)
  const recursive = descendantIds.length > 0
  const message = recursive
    ? `删除「${document.title}」以及它的 ${descendantIds.length} 个子文件？`
    : `删除「${document.title}」？`
  if (!window.confirm(message)) return

  clearNarrativeAutosave()
  await saveNarrative(true)
  await worldbuildingClientService.deleteCharacterNarrativeDocument({
    documentId,
    recursive
  })

  const deletedIds = new Set([documentId, ...descendantIds])
  const remainingDocuments = narrativeDocuments.value.filter((item) => !deletedIds.has(item.id))
  narrativeDocuments.value = remainingDocuments

  if (!deletedIds.has(activeDocumentId.value)) return

  const nextDocument = remainingDocuments[0] ?? null
  if (nextDocument) {
    syncNarrativeFromDocument(nextDocument)
    return
  }

  if (entityDetail.value) {
    await createNarrativeDocument()
  } else {
    syncNarrativeFromDocument(null)
  }
}

const saveNarrative = async (force = false): Promise<void> => {
  if (!canSaveNarrative.value || !entityDetail.value || !activeDocument.value) return
  if (!force && narrativeAutosaveSignature.value === lastSavedNarrativeSignature) return
  if (savingNarrative.value) {
    narrativeSaveQueued = true
    return
  }
  activeDocumentTitle.value = activeDocumentTitle.value.trim() || '新建文件'

  savingNarrative.value = true
  narrativeSaveState.value = 'saving'
  const signatureAtSave = narrativeAutosaveSignature.value
  try {
    const updated = await worldbuildingClientService.updateCharacterNarrativeDocument({
      documentId: activeDocument.value.id,
      title: activeDocumentTitle.value,
      contentHtml: characterDescriptionInput.value,
      contentFormat: 'html'
    })
    replaceNarrativeDocument(updated)
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
.narrative-editor-page {
  --narrative-sidebar-width: 356px;
  --narrative-editor-left: 76px;
  --narrative-outline-width: 150px;

  width: 100vw;
  height: 100%;
  display: grid;
  grid-template-columns: var(--narrative-sidebar-width) minmax(0, 1fr);
  overflow: hidden;
  background: var(--wb-narrative-bg);
  color: var(--wb-narrative-text);
}

.narrative-sidebar {
  min-width: 0;
  border-right: 1px solid var(--wb-narrative-border);
  background: var(--wb-narrative-sidebar-bg);
  display: flex;
  flex-direction: column;
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
  border-radius: 7px;
  font-size: 24px;
  color: var(--wb-narrative-text-muted);
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

.catalog-panel {
  min-height: 0;
  padding: 0 4px;
  overflow: auto;
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

.catalog-tree {
  display: flex;
  flex-direction: column;
  gap: 2px;
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

  .outline-panel {
    display: none;
  }

  .toolbar-status-group {
    margin-left: 0;
  }
}
</style>
