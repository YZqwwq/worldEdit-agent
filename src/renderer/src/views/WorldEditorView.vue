<template>
  <div class="world-shell">
    <header class="world-topbar">
      <div class="topbar-left">
        <router-link to="/" class="back-link">返回世界列表</router-link>
        <div v-if="selectedWorld" class="world-meta">
          <div class="eyebrow">World Instance</div>
          <h1>{{ selectedWorld.name }}</h1>
          <p>{{ selectedWorld.summary || '从这里创建并进入人物、种族、势力、国家等实例。' }}</p>
        </div>
      </div>

      <router-link to="/chat" class="assistant-link">AI 助手</router-link>
    </header>

    <main v-if="selectedWorld" class="world-main">
      <section class="creation-panel">
        <div class="panel-title">创建实例</div>
        <div class="creation-grid">
          <button
            v-for="definition in entityDefinitions"
            :key="definition.entityType"
            class="type-card"
            @click="openCreateDialog(definition.entityType)"
          >
            <div class="type-title">新建{{ definition.displayName }}</div>
            <div class="type-copy">{{ definition.description }}</div>
          </button>
        </div>
      </section>

      <section class="section-stack">
        <section
          v-for="definition in entityDefinitions"
          :key="definition.entityType"
          class="entity-section"
        >
          <div class="section-head">
            <h2>{{ definition.displayName }}</h2>
            <span class="section-count">{{ groupedEntities[definition.entityType]?.length || 0 }}</span>
          </div>

          <div v-if="groupedEntities[definition.entityType]?.length" class="entity-grid">
            <article
              v-for="entity in groupedEntities[definition.entityType]"
              :key="entity.id"
              class="entity-card"
              role="button"
              tabindex="0"
              @click="openEntity(entity.id)"
              @keydown.enter.prevent="openEntity(entity.id)"
              @keydown.space.prevent="openEntity(entity.id)"
            >
              <div class="entity-card-head">
                <span class="entity-name">{{ entity.name }}</span>
                <div class="card-actions">
                  <button
                    type="button"
                    class="card-menu-trigger"
                    title="编辑实例"
                    @click.stop="toggleEntityMenu(entity.id)"
                  >
                    ⋯
                  </button>
                  <div v-if="activeEntityMenuId === entity.id" class="card-menu" @click.stop>
                    <button type="button" class="card-menu-item" @click="openEditDialog(entity)">
                      编辑
                    </button>
                    <button type="button" class="card-menu-item danger" @click="openDeleteConfirm(entity)">
                      删除
                    </button>
                  </div>
                </div>
              </div>
              <span class="entity-enter">进入编辑</span>
              <p class="entity-summary">{{ entity.summary || '点击进入实例页继续完善描述文案。' }}</p>
            </article>
          </div>

          <div v-else class="empty-copy">
            还没有{{ definition.displayName }}实例。点击上方“新建{{ definition.displayName }}”开始。
          </div>
        </section>
      </section>
    </main>

    <teleport to="body">
      <div v-if="showEntityDialog && currentCreateDefinition" class="dialog-backdrop" @click.self="closeEntityDialog">
        <div class="dialog-card">
          <div class="dialog-head">
            <div>
              <div class="eyebrow">{{ isEditingEntity ? 'Edit Instance' : 'Create Instance' }}</div>
              <h2>{{ isEditingEntity ? `编辑${currentCreateDefinition.displayName}` : `新建${currentCreateDefinition.displayName}` }}</h2>
            </div>
            <button type="button" class="close-btn" @click="closeEntityDialog">✕</button>
          </div>

          <form class="dialog-form" @submit.prevent="handleSubmitEntity">
            <label class="form-label">
              名称
              <input
                v-model.trim="newEntityName"
                class="field"
                type="text"
                maxlength="120"
                placeholder="输入实例名称"
              />
            </label>

            <label class="form-label">
              摘要
              <input
                v-model.trim="newEntitySummary"
                class="field"
                type="text"
                maxlength="240"
                placeholder="一句话摘要，可选"
              />
            </label>

            <div class="dialog-actions">
              <button type="button" class="ghost-btn" @click="closeEntityDialog">取消</button>
              <button class="primary-btn" :disabled="creatingEntity || !newEntityName">
                {{ creatingEntity ? (isEditingEntity ? '保存中...' : '创建中...') : (isEditingEntity ? '保存修改' : '创建并进入') }}
              </button>
            </div>
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
import type {
  WorldEntityPayload,
  WorldEntityType,
  WorldbuildingEntityDefinition,
  WorldPayload
} from '@share/cache/worldbuilding/worldbuilding'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { worldbuildingClientService } from '../services/worldbuildingClientService'

const route = useRoute()
const router = useRouter()

const worlds = ref<WorldPayload[]>([])
const entities = ref<WorldEntityPayload[]>([])
const entityDefinitions = ref<WorldbuildingEntityDefinition[]>([])

const showEntityDialog = ref(false)
const creatingEntity = ref(false)
const deletingEntity = ref(false)
const createEntityType = ref<WorldEntityType>('character')
const editingEntityId = ref('')
const activeEntityMenuId = ref('')
const pendingDeleteEntity = ref<WorldEntityPayload | null>(null)
const showDeleteConfirm = ref(false)
const newEntityName = ref('')
const newEntitySummary = ref('')

const worldId = computed(() => String(route.params.worldId || ''))

const selectedWorld = computed(
  () => worlds.value.find((item) => item.id === worldId.value) ?? null
)

const currentCreateDefinition = computed(
  () => entityDefinitions.value.find((item) => item.entityType === createEntityType.value) ?? null
)
const isEditingEntity = computed(() => editingEntityId.value !== '')
const deleteConfirmMessage = computed(() =>
  pendingDeleteEntity.value
    ? `将删除实例「${pendingDeleteEntity.value.name}」及其下组件和相关关系，此操作无法撤销。`
    : '确认删除该实例吗？'
)

const groupedEntities = computed(() => {
  const result: Partial<Record<WorldEntityType, WorldEntityPayload[]>> = {}
  for (const entity of entities.value) {
    const bucket = result[entity.type] ?? []
    bucket.push(entity)
    result[entity.type] = bucket
  }
  return result
})

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

const openCreateDialog = (entityType: WorldEntityType): void => {
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

const openEntity = async (entityId: string): Promise<void> => {
  await router.push({ name: 'WorldEntityEditor', params: { worldId: worldId.value, entityId } })
}

const toggleEntityMenu = (entityId: string): void => {
  activeEntityMenuId.value = activeEntityMenuId.value === entityId ? '' : entityId
}

const openEditDialog = (entity: WorldEntityPayload): void => {
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
    await openEntity(created.id)
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
  if (target?.closest('.card-actions')) return
  activeEntityMenuId.value = ''
}

watch(worldId, async () => {
  await loadWorlds()
  await loadEntities()
})

onMounted(async () => {
  window.addEventListener('pointerdown', handleWindowPointerDown)
  await loadEntityDefinitions()
  await loadWorlds()
  await loadEntities()
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleWindowPointerDown)
})
</script>

<style scoped>
.world-shell {
  min-height: 100vh;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(229, 237, 255, 0.92), transparent 26%),
    linear-gradient(180deg, #f4f7fb 0%, #edf2f8 100%);
}

.world-topbar {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  align-items: flex-start;
}

.topbar-left {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #66758a;
}

.back-link,
.assistant-link,
.ghost-btn,
.primary-btn {
  border-radius: 16px;
  font: inherit;
  text-decoration: none;
}

.back-link,
.assistant-link,
.ghost-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  border: 1px solid rgba(111, 132, 162, 0.22);
  background: rgba(255, 255, 255, 0.86);
  color: #243247;
}

.world-meta h1,
.world-meta p,
.section-head h2,
.dialog-head h2,
.entity-summary,
.type-copy {
  margin: 0;
}

.world-meta h1 {
  margin-top: 6px;
  font-size: 40px;
  line-height: 1;
  color: #182233;
}

.world-meta p {
  margin-top: 8px;
  font-size: 15px;
  color: #5f6f86;
}

.world-main {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.creation-panel,
.entity-section {
  border-radius: 28px;
  border: 1px solid rgba(109, 129, 158, 0.16);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 24px 60px rgba(24, 39, 68, 0.08);
  padding: 20px;
}

.panel-title {
  font-size: 22px;
  font-weight: 700;
  color: #182233;
}

.creation-grid,
.entity-grid {
  margin-top: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 18px;
}

.type-card,
.entity-card {
  border-radius: 22px;
  border: 1px solid rgba(109, 129, 158, 0.16);
  background: #fbfcff;
  padding: 18px;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
}

.type-card:hover,
.entity-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 20px 48px rgba(24, 39, 68, 0.09);
  border-color: rgba(48, 96, 201, 0.24);
}

.entity-card {
  position: relative;
  display: flex;
  flex-direction: column;
}

.type-title,
.entity-name {
  font-size: 20px;
  font-weight: 700;
  color: #182233;
}

.type-copy,
.entity-summary,
.empty-copy {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.65;
  color: #677790;
}

.section-stack {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.section-head,
.entity-card-head,
.dialog-head,
.dialog-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.card-actions {
  position: relative;
  display: flex;
  align-items: center;
}

.card-menu-trigger {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(111, 132, 162, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.96);
  color: #42556f;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.card-menu {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 128px;
  padding: 8px;
  border-radius: 16px;
  border: 1px solid rgba(111, 132, 162, 0.18);
  background: rgba(255, 255, 255, 0.98);
  box-shadow: 0 18px 44px rgba(24, 39, 68, 0.14);
  z-index: 5;
}

.card-menu-item {
  width: 100%;
  border: 0;
  border-radius: 12px;
  background: transparent;
  padding: 10px 12px;
  text-align: left;
  font: inherit;
  color: #243247;
  cursor: pointer;
}

.card-menu-item:hover {
  background: #f3f6fb;
}

.card-menu-item.danger {
  color: #c53b34;
}

.section-count,
.entity-enter {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  background: #edf3ff;
  color: #2454bf;
  font-size: 12px;
  font-weight: 600;
}

.entity-enter {
  margin-top: 14px;
  align-self: flex-start;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(18, 27, 43, 0.28);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  z-index: 60;
}

.dialog-card {
  width: min(520px, 100%);
  border-radius: 26px;
  background: #ffffff;
  border: 1px solid rgba(109, 129, 158, 0.16);
  box-shadow: 0 28px 90px rgba(22, 34, 59, 0.18);
  padding: 22px;
}

.dialog-head h2 {
  margin-top: 6px;
  font-size: 28px;
  color: #172133;
}

.close-btn {
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 14px;
  background: #f1f4f9;
  cursor: pointer;
}

.dialog-form {
  margin-top: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #243247;
}

.field {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(111, 132, 162, 0.24);
  background: #f8faff;
  color: #182233;
  border-radius: 16px;
  padding: 12px 14px;
  font: inherit;
}

.field:focus {
  outline: none;
  border-color: #3b72f5;
  box-shadow: 0 0 0 4px rgba(59, 114, 245, 0.14);
}

.primary-btn {
  border: 0;
  padding: 12px 18px;
  background: linear-gradient(135deg, #3a72ff, #214ebc);
  color: white;
  font-weight: 700;
  cursor: pointer;
}

.primary-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (max-width: 720px) {
  .world-shell {
    padding: 18px;
  }

  .world-topbar {
    flex-direction: column;
  }

  .world-meta h1 {
    font-size: 30px;
  }

  .creation-grid,
  .entity-grid {
    grid-template-columns: 1fr;
  }
}
</style>
