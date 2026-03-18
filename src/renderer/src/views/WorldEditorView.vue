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
            <button
              v-for="entity in groupedEntities[definition.entityType]"
              :key="entity.id"
              class="entity-card"
              @click="openEntity(entity.id)"
            >
              <div class="entity-card-head">
                <span class="entity-name">{{ entity.name }}</span>
                <span class="entity-enter">编辑</span>
              </div>
              <p class="entity-summary">{{ entity.summary || '点击进入实例页继续完善描述文案。' }}</p>
            </button>
          </div>

          <div v-else class="empty-copy">
            还没有{{ definition.displayName }}实例。点击上方“新建{{ definition.displayName }}”开始。
          </div>
        </section>
      </section>
    </main>

    <teleport to="body">
      <div v-if="showCreateDialog && currentCreateDefinition" class="dialog-backdrop" @click.self="closeCreateDialog">
        <div class="dialog-card">
          <div class="dialog-head">
            <div>
              <div class="eyebrow">Create Instance</div>
              <h2>新建{{ currentCreateDefinition.displayName }}</h2>
            </div>
            <button type="button" class="close-btn" @click="closeCreateDialog">✕</button>
          </div>

          <form class="dialog-form" @submit.prevent="handleCreateEntity">
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
              <button type="button" class="ghost-btn" @click="closeCreateDialog">取消</button>
              <button class="primary-btn" :disabled="creatingEntity || !newEntityName">
                {{ creatingEntity ? '创建中...' : '创建并进入' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type {
  WorldEntityPayload,
  WorldEntityType,
  WorldbuildingEntityDefinition,
  WorldPayload
} from '@share/cache/worldbuilding/worldbuilding'
import { worldbuildingClientService } from '../services/worldbuildingClientService'

const route = useRoute()
const router = useRouter()

const worlds = ref<WorldPayload[]>([])
const entities = ref<WorldEntityPayload[]>([])
const entityDefinitions = ref<WorldbuildingEntityDefinition[]>([])

const showCreateDialog = ref(false)
const creatingEntity = ref(false)
const createEntityType = ref<WorldEntityType>('character')
const newEntityName = ref('')
const newEntitySummary = ref('')

const worldId = computed(() => String(route.params.worldId || ''))

const selectedWorld = computed(
  () => worlds.value.find((item) => item.id === worldId.value) ?? null
)

const currentCreateDefinition = computed(
  () => entityDefinitions.value.find((item) => item.entityType === createEntityType.value) ?? null
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
  createEntityType.value = entityType
  newEntityName.value = ''
  newEntitySummary.value = ''
  showCreateDialog.value = true
}

const closeCreateDialog = (): void => {
  showCreateDialog.value = false
  creatingEntity.value = false
  newEntityName.value = ''
  newEntitySummary.value = ''
}

const openEntity = async (entityId: string): Promise<void> => {
  await router.push({ name: 'WorldEntityEditor', params: { worldId: worldId.value, entityId } })
}

const handleCreateEntity = async (): Promise<void> => {
  if (!worldId.value || !newEntityName.value.trim()) return

  creatingEntity.value = true
  try {
    const created = await worldbuildingClientService.createEntity({
      worldId: worldId.value,
      type: createEntityType.value,
      name: newEntityName.value,
      summary: newEntitySummary.value,
      initializeStarterComponents: true
    })
    closeCreateDialog()
    await loadEntities()
    await openEntity(created.id)
  } finally {
    creatingEntity.value = false
  }
}

watch(worldId, async () => {
  await loadWorlds()
  await loadEntities()
})

onMounted(async () => {
  await loadEntityDefinitions()
  await loadWorlds()
  await loadEntities()
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
