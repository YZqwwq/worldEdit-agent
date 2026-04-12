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
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MdEditor, type ToolbarNames } from 'md-editor-v3'
import { useRoute } from 'vue-router'
import type {
  UpsertWorldEntityComponentInput,
  WorldEntityComponentPayload,
  WorldEntityDetailPayload,
  WorldEntityType
} from '@share/cache/worldbuilding/worldbuilding'
import { worldbuildingClientService } from '../services/worldbuildingClientService'
import { toPlainIpcPayload } from '../utils/ipcPayload'
import { useKeyboardShortcut } from '../utils/useKeyboardShortcut'

const route = useRoute()

const entityDetail = ref<WorldEntityDetailPayload | null>(null)
const descriptionText = ref('')
const savingDescription = ref(false)
const descriptionSaveState = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

let syncingFromDetail = false
let descriptionAutosaveTimer: ReturnType<typeof setTimeout> | null = null
let descriptionSaveQueued = false
let lastSavedDescriptionSignature = ''

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

const editableComponentType = computed(
  () => (entityDetail.value ? editableComponentByType[entityDetail.value.entity.type] || '' : '')
)

const canSaveDescription = computed(() => Boolean(entityDetail.value && editableComponentType.value))

const descriptionSaveHint = computed(() => {
  if (descriptionSaveState.value === 'saving') return '自动保存中...'
  if (descriptionSaveState.value === 'saved') return '已自动保存'
  if (descriptionSaveState.value === 'error') return '自动保存失败'
  return '自动保存'
})

const descriptionAutosaveSignature = computed(() =>
  JSON.stringify({
    entityId: entityDetail.value?.entity.id || '',
    componentType: editableComponentType.value,
    description: descriptionText.value
  })
)

const displayEntityType = computed(() => {
  const currentType = entityDetail.value?.entity.type
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

const getEditableComponent = (): WorldEntityComponentPayload<Record<string, unknown>> | null => {
  if (!entityDetail.value || !editableComponentType.value) return null
  return (
    entityDetail.value.components.find(
      (component) => component.componentType === editableComponentType.value
    ) as WorldEntityComponentPayload<Record<string, unknown>> | undefined
  ) ?? null
}

const syncFormFromDetail = (): void => {
  const editableComponent = getEditableComponent()
  descriptionText.value = String(editableComponent?.data?.description || '')
  lastSavedDescriptionSignature = descriptionAutosaveSignature.value
  descriptionSaveState.value = 'saved'
}

const loadEntityDetail = async (): Promise<void> => {
  if (!entityId.value) {
    entityDetail.value = null
    return
  }

  syncingFromDetail = true
  try {
    entityDetail.value = await worldbuildingClientService.getEntityDetail(entityId.value)
    syncFormFromDetail()
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
    } satisfies UpsertWorldEntityComponentInput<Record<string, unknown>>)
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

const clearDescriptionAutosave = (): void => {
  if (descriptionAutosaveTimer) {
    clearTimeout(descriptionAutosaveTimer)
    descriptionAutosaveTimer = null
  }
}

const scheduleDescriptionAutosave = (delay = 700): void => {
  if (syncingFromDetail || !entityDetail.value) return
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

watch(descriptionAutosaveSignature, () => {
  scheduleDescriptionAutosave()
})

onBeforeUnmount(() => {
  clearDescriptionAutosave()
})

useKeyboardShortcut(
  {
    key: 's',
    ctrlOrMeta: true,
    preventDefault: true,
    enabled: () => canSaveDescription.value && !savingDescription.value
  },
  async () => {
    clearDescriptionAutosave()
    await saveDescription(true)
  }
)
</script>

<style scoped>
.entity-shell {
  min-height: 100vh;
  padding: 20px;
  box-sizing: border-box;
  background:
    radial-gradient(circle at top left, rgba(43, 55, 75, 0.32), transparent 24%),
    linear-gradient(180deg, #0d1118 0%, #141a24 100%);
  color: #edf2f7;
}

.entity-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 12px;
}

.back-link,
.assistant-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 7px 14px;
  border-radius: 14px;
  border: 1px solid rgba(185, 150, 93, 0.22);
  background: rgba(13, 17, 24, 0.94);
  color: #e7d2ad;
  line-height: 1;
  text-decoration: none;
  font: inherit;
}

.entity-main {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.6fr);
  gap: 16px;
}

.panel {
  border-radius: 26px;
  border: 1px solid rgba(109, 129, 158, 0.16);
  background: rgba(255, 255, 255, 0.96);
  color: #1b2432;
  box-shadow: 0 24px 60px rgba(5, 8, 13, 0.26);
  padding: 20px;
}

.description-panel {
  display: flex;
  flex-direction: column;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
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

.form-stack {
  margin-top: 18px;
}

.narrative-editor-light {
  min-height: 420px;
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

@media (max-width: 900px) {
  .entity-main {
    grid-template-columns: 1fr;
  }

  .entity-topbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
