<template>
  <div class="world-shell">
    <header class="workspace-header">
      <div class="header-leading">
        <router-link
          to="/"
          class="icon-button back-button"
          aria-label="返回世界列表"
          title="返回世界列表"
        >
          ←
        </router-link>
        <div v-if="selectedWorld" class="world-identity">
          <span class="context-label">世界实例</span>
          <h1>{{ selectedWorld.name }}</h1>
          <p>{{ selectedWorld.summary || '尚未填写世界摘要。' }}</p>
        </div>
      </div>

      <nav class="header-actions" aria-label="世界工具">
        <button type="button" class="secondary-button" @click="openBasicSettings">基础设定</button>
        <router-link to="/chat" class="secondary-button">AI 助手</router-link>
      </nav>
    </header>

    <main v-if="selectedWorld" class="workspace-main">
      <section class="instance-workspace" aria-labelledby="instance-workspace-title">
        <header class="workspace-toolbar">
          <div class="workspace-title">
            <h2 id="instance-workspace-title">实例</h2>
            <span>{{ supportedEntities.length }}</span>
          </div>

          <div class="workspace-controls">
            <label class="search-field">
              <span class="sr-only">搜索实例</span>
              <input
                v-model="searchQuery"
                type="search"
                placeholder="搜索名称或摘要"
                aria-label="搜索实例"
              />
            </label>

            <div class="create-control">
              <button
                type="button"
                class="primary-button"
                :aria-expanded="showCreateMenu"
                aria-haspopup="menu"
                @click.stop="showCreateMenu = !showCreateMenu"
              >
                <span aria-hidden="true">+</span>
                新建实例
              </button>
              <div v-if="showCreateMenu" class="create-menu" role="menu">
                <button
                  v-for="definition in availableDefinitions"
                  :key="definition.entityType"
                  type="button"
                  role="menuitem"
                  @click="openCreateDialog(definition.entityType)"
                >
                  <span>{{ definition.displayName }}</span>
                  <small>{{ definition.description }}</small>
                </button>
              </div>
            </div>
          </div>
        </header>

        <div class="workspace-body">
          <aside class="type-navigation" aria-label="实例分类">
            <button
              v-for="option in categoryOptions"
              :key="option.value"
              type="button"
              :class="{ active: selectedEntityType === option.value }"
              @click="selectedEntityType = option.value"
            >
              <span>{{ option.label }}</span>
              <small>{{ option.count }}</small>
            </button>
          </aside>

          <section class="entity-list-panel" :aria-label="currentCategoryLabel">
            <header class="list-heading">
              <div>
                <h3>{{ currentCategoryLabel }}</h3>
                <p>{{ filteredEntities.length }} 个实例</p>
              </div>
              <span class="list-sort-label">最近更新</span>
            </header>

            <div v-if="filteredEntities.length" class="entity-table" role="list">
              <div class="entity-table-head" aria-hidden="true">
                <span>名称</span>
                <span>类型</span>
                <span>摘要</span>
                <span>更新</span>
                <span></span>
              </div>

              <article
                v-for="entity in filteredEntities"
                :key="entity.id"
                class="entity-row"
                role="listitem"
                tabindex="0"
                @click="openEntity(entity)"
                @keydown.enter.prevent="openEntity(entity)"
                @keydown.space.prevent="openEntity(entity)"
              >
                <strong class="entity-name">{{ entity.name }}</strong>
                <span class="entity-type">{{ getEntityTypeLabel(entity.type) }}</span>
                <p class="entity-summary">{{ entity.summary || '暂无摘要' }}</p>
                <time class="entity-updated">{{ formatUpdatedAt(entity.updatedAt) }}</time>
                <div class="entity-actions">
                  <button
                    type="button"
                    class="icon-button row-menu-trigger"
                    :aria-expanded="activeEntityMenuId === entity.id"
                    aria-label="实例操作"
                    title="实例操作"
                    @click.stop="toggleEntityMenu(entity.id)"
                  >
                    ⋯
                  </button>
                  <div v-if="activeEntityMenuId === entity.id" class="row-menu" @click.stop>
                    <button type="button" @click="openEditDialog(entity)">编辑资料</button>
                    <button type="button" class="danger" @click="openDeleteConfirm(entity)">
                      删除实例
                    </button>
                  </div>
                </div>
              </article>
            </div>

            <div v-else class="empty-state">
              <strong>{{
                searchQuery ? '没有匹配的实例' : `还没有${currentCategoryLabel}实例`
              }}</strong>
              <p>
                {{ searchQuery ? '当前搜索没有返回结果。' : '当前分类暂无实例记录。' }}
              </p>
            </div>
          </section>
        </div>
      </section>
    </main>

    <teleport to="body">
      <div
        v-if="showEntityDialog && currentCreateDefinition"
        class="dialog-backdrop"
        @click.self="closeEntityDialog"
      >
        <div class="dialog-card" role="dialog" aria-modal="true" :aria-labelledby="dialogTitleId">
          <header class="dialog-head">
            <div>
              <span class="context-label">{{ isEditingEntity ? '编辑实例' : '创建实例' }}</span>
              <h2 :id="dialogTitleId">
                {{
                  isEditingEntity
                    ? `编辑${currentCreateDefinition.displayName}`
                    : `新建${currentCreateDefinition.displayName}`
                }}
              </h2>
            </div>
            <button
              type="button"
              class="icon-button close-button"
              aria-label="关闭"
              @click="closeEntityDialog"
            >
              ×
            </button>
          </header>

          <form class="dialog-form" @submit.prevent="handleSubmitEntity">
            <label class="form-label">
              <span>名称</span>
              <input
                v-model.trim="newEntityName"
                class="field"
                type="text"
                maxlength="120"
                placeholder="输入实例名称"
                autofocus
              />
            </label>

            <label class="form-label">
              <span>摘要</span>
              <textarea
                v-model.trim="newEntitySummary"
                class="field summary-field"
                maxlength="240"
                placeholder="简要说明这个实例，可稍后补充"
              />
            </label>

            <footer class="dialog-actions">
              <button type="button" class="secondary-button" @click="closeEntityDialog">
                取消
              </button>
              <button class="primary-button" :disabled="creatingEntity || !newEntityName">
                {{
                  creatingEntity
                    ? isEditingEntity
                      ? '保存中...'
                      : '创建中...'
                    : isEditingEntity
                      ? '保存修改'
                      : '创建并进入'
                }}
              </button>
            </footer>
          </form>
        </div>
      </div>
    </teleport>

    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="确认删除实例？"
      :message="deleteConfirmMessage"
      confirm-text="删除"
      cancel-text="取消"
      loading-text="删除中..."
      size="sm"
      icon="danger"
      :danger="true"
      :loading="deletingEntity"
      @confirm="handleDeleteEntity"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  WORLD_INSTANCE_ENTITY_TYPES,
  isWorldInstanceEntityType,
  type WorldEntityPayload,
  type WorldInstanceEntityType,
  type WorldbuildingEntityDefinition,
  type WorldPayload
} from '@share/cache/worldbuilding/worldbuilding'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { worldbuildingClientService } from '../services/worldbuildingClientService'

type EntityCategory = 'all' | WorldInstanceEntityType
type WorldInstanceDefinition = Omit<WorldbuildingEntityDefinition, 'entityType'> & {
  entityType: WorldInstanceEntityType
}
type WorldInstanceEntityPayload = Omit<WorldEntityPayload, 'type'> & {
  type: WorldInstanceEntityType
}

const route = useRoute()
const router = useRouter()

const worlds = ref<WorldPayload[]>([])
const entities = ref<WorldEntityPayload[]>([])
const entityDefinitions = ref<WorldbuildingEntityDefinition[]>([])
const selectedEntityType = ref<EntityCategory>('all')
const searchQuery = ref('')
const showCreateMenu = ref(false)
const showEntityDialog = ref(false)
const creatingEntity = ref(false)
const deletingEntity = ref(false)
const createEntityType = ref<WorldInstanceEntityType>('character')
const editingEntityId = ref('')
const activeEntityMenuId = ref('')
const pendingDeleteEntity = ref<WorldEntityPayload | null>(null)
const showDeleteConfirm = ref(false)
const newEntityName = ref('')
const newEntitySummary = ref('')

const dialogTitleId = 'world-entity-dialog-title'
const worldId = computed(() => String(route.params.worldId || ''))
const selectedWorld = computed(() => worlds.value.find((item) => item.id === worldId.value) ?? null)

const availableDefinitions = computed<WorldInstanceDefinition[]>(() => {
  const byType = new Map(
    entityDefinitions.value.map((definition) => [definition.entityType, definition])
  )
  return WORLD_INSTANCE_ENTITY_TYPES.map((type) => {
    const definition = byType.get(type)
    return definition ? { ...definition, entityType: type } : null
  }).filter((definition): definition is WorldInstanceDefinition => Boolean(definition))
})

const supportedEntities = computed<WorldInstanceEntityPayload[]>(() =>
  entities.value.filter((entity): entity is WorldInstanceEntityPayload =>
    isWorldInstanceEntityType(entity.type)
  )
)

const entityCounts = computed(() => {
  const counts = new Map<WorldInstanceEntityType, number>()
  for (const type of WORLD_INSTANCE_ENTITY_TYPES) counts.set(type, 0)
  for (const entity of supportedEntities.value) {
    counts.set(entity.type, (counts.get(entity.type) ?? 0) + 1)
  }
  return counts
})

const categoryOptions = computed<Array<{ value: EntityCategory; label: string; count: number }>>(
  () => [
    { value: 'all', label: '全部实例', count: supportedEntities.value.length },
    ...availableDefinitions.value.map((definition) => ({
      value: definition.entityType as WorldInstanceEntityType,
      label: definition.displayName,
      count: entityCounts.value.get(definition.entityType as WorldInstanceEntityType) ?? 0
    }))
  ]
)

const currentCategoryLabel = computed(
  () =>
    categoryOptions.value.find((option) => option.value === selectedEntityType.value)?.label ??
    '全部实例'
)

const filteredEntities = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  return supportedEntities.value
    .filter(
      (entity) => selectedEntityType.value === 'all' || entity.type === selectedEntityType.value
    )
    .filter((entity) => {
      if (!query) return true
      return `${entity.name} ${entity.summary || ''}`.toLocaleLowerCase().includes(query)
    })
    .sort((left, right) => {
      const updatedCompare = String(right.updatedAt || '').localeCompare(
        String(left.updatedAt || '')
      )
      return updatedCompare || left.name.localeCompare(right.name, 'zh-CN')
    })
})

const currentCreateDefinition = computed(
  () =>
    availableDefinitions.value.find(
      (definition) => definition.entityType === createEntityType.value
    ) ?? null
)
const isEditingEntity = computed(() => editingEntityId.value !== '')
const deleteConfirmMessage = computed(() =>
  pendingDeleteEntity.value
    ? `将删除实例「${pendingDeleteEntity.value.name}」及其下组件和相关关系，此操作无法撤销。`
    : '确认删除该实例吗？'
)

const getEntityTypeLabel = (type: WorldEntityPayload['type']): string =>
  availableDefinitions.value.find((definition) => definition.entityType === type)?.displayName ??
  type

const formatUpdatedAt = (value?: string): string => {
  if (!value) return '尚未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '尚未记录'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

const loadWorlds = async (): Promise<void> => {
  worlds.value = await worldbuildingClientService.listWorlds()
}

const loadEntityDefinitions = async (): Promise<void> => {
  entityDefinitions.value = await worldbuildingClientService.listEntityDefinitions()
}

const loadEntities = async (): Promise<void> => {
  if (!worldId.value) {
    entities.value = []
    return
  }
  entities.value = await worldbuildingClientService.listEntities(worldId.value)
}

const openCreateDialog = (entityType: WorldInstanceEntityType): void => {
  showCreateMenu.value = false
  editingEntityId.value = ''
  activeEntityMenuId.value = ''
  createEntityType.value = entityType
  newEntityName.value = ''
  newEntitySummary.value = ''
  showEntityDialog.value = true
}

const closeEntityDialog = (): void => {
  showEntityDialog.value = false
  creatingEntity.value = false
  editingEntityId.value = ''
  newEntityName.value = ''
  newEntitySummary.value = ''
}

const openEntity = async (entity: WorldEntityPayload): Promise<void> => {
  await router.push({
    name: entity.type === 'character' ? 'CharacterProfileEditor' : 'WorldEntityEditor',
    params: { worldId: worldId.value, entityId: entity.id }
  })
}

const openBasicSettings = async (): Promise<void> => {
  await router.push({
    name: 'WorldEntityDocumentEditor',
    params: { worldId: worldId.value }
  })
}

const toggleEntityMenu = (entityId: string): void => {
  activeEntityMenuId.value = activeEntityMenuId.value === entityId ? '' : entityId
}

const openEditDialog = (entity: WorldEntityPayload): void => {
  if (!isWorldInstanceEntityType(entity.type)) return
  activeEntityMenuId.value = ''
  editingEntityId.value = entity.id
  createEntityType.value = entity.type
  newEntityName.value = entity.name
  newEntitySummary.value = entity.summary || ''
  showEntityDialog.value = true
}

const openDeleteConfirm = (entity: WorldEntityPayload): void => {
  activeEntityMenuId.value = ''
  pendingDeleteEntity.value = entity
  showDeleteConfirm.value = true
}

const handleSubmitEntity = async (): Promise<void> => {
  if (!worldId.value || !newEntityName.value.trim()) return

  creatingEntity.value = true
  try {
    if (isEditingEntity.value) {
      await worldbuildingClientService.updateEntity({
        entityId: editingEntityId.value,
        name: newEntityName.value,
        summary: newEntitySummary.value
      })
      closeEntityDialog()
      await loadEntities()
      return
    }

    const created = await worldbuildingClientService.createEntity({
      worldId: worldId.value,
      type: createEntityType.value,
      name: newEntityName.value,
      summary: newEntitySummary.value,
      initializeStarterComponents: true
    })
    closeEntityDialog()
    await loadEntities()
    await openEntity(created)
  } finally {
    creatingEntity.value = false
  }
}

const handleDeleteEntity = async (): Promise<void> => {
  if (!pendingDeleteEntity.value || deletingEntity.value) return
  deletingEntity.value = true
  try {
    await worldbuildingClientService.deleteEntity(pendingDeleteEntity.value.id)
    pendingDeleteEntity.value = null
    showDeleteConfirm.value = false
    await loadEntities()
  } finally {
    deletingEntity.value = false
  }
}

const handleWindowPointerDown = (event: PointerEvent): void => {
  const target = event.target as HTMLElement | null
  if (target?.closest('.entity-actions, .create-control')) return
  activeEntityMenuId.value = ''
  showCreateMenu.value = false
}

watch(worldId, async () => {
  await loadWorlds()
  await loadEntities()
})

onMounted(async () => {
  window.addEventListener('pointerdown', handleWindowPointerDown)
  await Promise.all([loadEntityDefinitions(), loadWorlds(), loadEntities()])
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleWindowPointerDown)
})
</script>

<style scoped>
.world-shell {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 28px 34px 44px;
  background: #f4f5f6;
  color: #191d21;
}

.workspace-header,
.workspace-main {
  width: min(1440px, 100%);
  margin: 0 auto;
}

.workspace-header {
  min-height: 112px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid #d9dcdf;
}

.header-leading {
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 18px;
}

.world-identity {
  min-width: 0;
}

.context-label {
  display: block;
  margin-bottom: 7px;
  color: #747b82;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.world-identity h1,
.world-identity p,
.workspace-title h2,
.list-heading h3,
.list-heading p,
.entity-summary,
.dialog-head h2 {
  margin: 0;
}

.world-identity h1 {
  overflow: hidden;
  font-size: 28px;
  line-height: 1.2;
  font-weight: 720;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.world-identity p {
  max-width: 720px;
  margin-top: 7px;
  color: #666d73;
  font-size: 14px;
  line-height: 1.55;
}

.header-actions,
.workspace-controls,
.dialog-actions {
  display: flex;
  align-items: center;
  gap: 9px;
}

.icon-button,
.secondary-button,
.primary-button,
.type-navigation button,
.create-menu button,
.row-menu button {
  font: inherit;
}

.icon-button {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid #d4d7da;
  border-radius: 6px;
  background: #ffffff;
  color: #30363b;
  text-decoration: none;
  cursor: pointer;
}

.back-button {
  flex-shrink: 0;
  margin-top: 3px;
  font-size: 19px;
}

.secondary-button,
.primary-button {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 13px;
  border-radius: 6px;
  text-decoration: none;
  cursor: pointer;
}

.secondary-button {
  border: 1px solid #d4d7da;
  background: #ffffff;
  color: #30363b;
}

.primary-button {
  border: 1px solid #176c51;
  background: #176c51;
  color: #ffffff;
  font-weight: 650;
}

.primary-button:hover {
  border-color: #11543f;
  background: #115d46;
}

.primary-button:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.workspace-main {
  margin-top: 24px;
}

.instance-workspace {
  min-height: 580px;
  border: 1px solid #d9dcdf;
  background: #ffffff;
}

.workspace-toolbar {
  min-height: 68px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 14px 18px;
  border-bottom: 1px solid #dde0e2;
}

.workspace-title {
  display: flex;
  align-items: center;
  gap: 9px;
}

.workspace-title h2 {
  font-size: 18px;
  font-weight: 700;
}

.workspace-title span {
  min-width: 24px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border-radius: 10px;
  background: #eceeef;
  color: #555c62;
  font-size: 11px;
  font-weight: 700;
}

.search-field input {
  width: 240px;
  height: 36px;
  box-sizing: border-box;
  padding: 0 11px;
  border: 1px solid #d4d7da;
  border-radius: 6px;
  outline: 0;
  background: #fafafa;
  color: #252a2e;
  font: inherit;
  font-size: 13px;
}

.search-field input:focus {
  border-color: #798087;
  background: #ffffff;
}

.create-control,
.entity-actions {
  position: relative;
}

.create-menu,
.row-menu {
  position: absolute;
  right: 0;
  z-index: 20;
  border: 1px solid #cfd3d6;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 12px 30px rgba(25, 29, 33, 0.14);
}

.create-menu {
  top: calc(100% + 7px);
  width: 320px;
  padding: 6px;
}

.create-menu button {
  width: 100%;
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 10px;
  padding: 9px 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #252a2e;
  text-align: left;
  cursor: pointer;
}

.create-menu button:hover,
.row-menu button:hover {
  background: #f0f2f2;
}

.create-menu span {
  font-weight: 650;
}

.create-menu small {
  overflow: hidden;
  color: #747b82;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-body {
  min-height: 510px;
  display: grid;
  grid-template-columns: 196px minmax(0, 1fr);
}

.type-navigation {
  padding: 14px 10px;
  border-right: 1px solid #dde0e2;
  background: #f8f9f9;
}

.type-navigation button {
  width: 100%;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #555c62;
  cursor: pointer;
}

.type-navigation button:hover {
  background: #eceeee;
  color: #252a2e;
}

.type-navigation button.active {
  background: #e1e5e4;
  color: #171b1e;
  font-weight: 650;
}

.type-navigation small {
  color: #858c91;
  font-size: 11px;
}

.entity-list-panel {
  min-width: 0;
  padding: 18px;
}

.list-heading {
  min-height: 46px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.list-heading h3 {
  font-size: 16px;
  font-weight: 700;
}

.list-heading p,
.list-sort-label {
  margin-top: 4px;
  color: #81878c;
  font-size: 12px;
}

.entity-table {
  border-top: 1px solid #d9dcdf;
}

.entity-table-head,
.entity-row {
  display: grid;
  grid-template-columns:
    minmax(150px, 0.85fr)
    86px
    minmax(200px, 1.5fr)
    118px
    36px;
  align-items: center;
  gap: 14px;
}

.entity-table-head {
  min-height: 38px;
  color: #7b8288;
  font-size: 11px;
  font-weight: 700;
}

.entity-row {
  min-height: 62px;
  padding: 7px 0;
  border-top: 1px solid #e5e7e8;
  outline: 0;
  cursor: pointer;
}

.entity-row:hover,
.entity-row:focus-visible {
  background: #f6f8f7;
}

.entity-name {
  min-width: 0;
  overflow: hidden;
  font-size: 14px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-type {
  width: max-content;
  padding: 3px 7px;
  border: 1px solid #d9dcdf;
  border-radius: 4px;
  color: #596067;
  font-size: 11px;
}

.entity-summary {
  min-width: 0;
  overflow: hidden;
  color: #646b71;
  font-size: 13px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entity-updated {
  color: #7a8186;
  font-size: 12px;
}

.row-menu-trigger {
  border-color: transparent;
  background: transparent;
  font-size: 18px;
}

.row-menu-trigger:hover {
  border-color: #d4d7da;
  background: #ffffff;
}

.row-menu {
  top: calc(100% + 5px);
  width: 132px;
  padding: 5px;
}

.row-menu button {
  width: 100%;
  padding: 8px 9px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #30363b;
  text-align: left;
  cursor: pointer;
}

.row-menu button.danger {
  color: #b33434;
}

.empty-state {
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #747b82;
  text-align: center;
}

.empty-state strong {
  color: #353b40;
  font-size: 15px;
}

.empty-state p {
  margin: 7px 0 0;
  font-size: 13px;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(20, 23, 25, 0.38);
}

.dialog-card {
  width: min(480px, 100%);
  border: 1px solid #cfd3d6;
  border-radius: 7px;
  background: #ffffff;
  box-shadow: 0 24px 70px rgba(20, 23, 25, 0.2);
}

.dialog-head {
  min-height: 74px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 20px;
  border-bottom: 1px solid #dde0e2;
}

.dialog-head h2 {
  font-size: 19px;
}

.close-button {
  border-color: transparent;
  background: transparent;
  font-size: 20px;
}

.dialog-form {
  padding: 20px;
}

.form-label {
  display: block;
  margin-bottom: 16px;
  color: #454b50;
  font-size: 13px;
  font-weight: 650;
}

.form-label > span {
  display: block;
  margin-bottom: 7px;
}

.field {
  width: 100%;
  min-height: 38px;
  box-sizing: border-box;
  padding: 9px 10px;
  border: 1px solid #cfd3d6;
  border-radius: 5px;
  outline: 0;
  background: #ffffff;
  color: #252a2e;
  font: inherit;
}

.field:focus {
  border-color: #176c51;
  box-shadow: 0 0 0 2px rgba(23, 108, 81, 0.1);
}

.summary-field {
  min-height: 86px;
  resize: vertical;
}

.dialog-actions {
  justify-content: flex-end;
  margin-top: 22px;
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

@media (max-width: 900px) {
  .world-shell {
    padding: 20px;
  }

  .workspace-body {
    grid-template-columns: minmax(0, 1fr);
  }

  .type-navigation {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid #dde0e2;
  }

  .type-navigation button {
    width: auto;
    min-width: max-content;
    gap: 14px;
  }

  .entity-table-head,
  .entity-row {
    grid-template-columns: minmax(130px, 0.8fr) 72px minmax(180px, 1.2fr) 36px;
  }

  .entity-table-head span:nth-child(4),
  .entity-updated {
    display: none;
  }
}

@media (max-width: 640px) {
  .workspace-header,
  .workspace-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .header-actions,
  .workspace-controls {
    width: 100%;
  }

  .search-field,
  .search-field input {
    min-width: 0;
    width: 100%;
  }

  .create-menu {
    width: min(320px, calc(100vw - 40px));
  }

  .entity-list-panel {
    padding: 14px;
  }

  .entity-table-head {
    display: none;
  }

  .entity-row {
    grid-template-columns: minmax(0, 1fr) auto 36px;
    gap: 9px;
    padding: 12px 0;
  }

  .entity-summary,
  .entity-updated {
    display: none;
  }
}
</style>
