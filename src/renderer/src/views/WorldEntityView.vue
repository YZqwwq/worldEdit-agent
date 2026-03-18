<template>
  <div class="entity-shell">
    <header class="entity-topbar">
      <div class="topbar-left">
        <router-link
          v-if="worldId"
          :to="{ name: 'WorldEditor', params: { worldId } }"
          class="back-link"
        >
          返回世界实例
        </router-link>
        <div v-if="entityDetail" class="entity-meta">
          <div class="eyebrow">Entity Instance</div>
          <h1>{{ entityDetail.entity.name }}</h1>
          <p>{{ displayEntityType }}</p>
        </div>
      </div>

      <router-link to="/chat" class="assistant-link">AI 助手</router-link>
    </header>

    <main v-if="entityDetail" class="entity-main">
      <section class="panel description-panel">
        <div class="panel-head">
          <h2>描述文案</h2>
          <button class="primary-btn" :disabled="savingDescription" @click="saveDescription">
            {{ savingDescription ? '保存中...' : '保存描述' }}
          </button>
        </div>

        <div class="form-stack">
          <label class="form-label">
            描述
            <textarea
              v-model="descriptionText"
              class="field field-area"
              placeholder="输入人物或种族的详细描述文案"
            />
          </label>
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
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type {
  WorldEntityComponentPayload,
  WorldEntityDetailPayload,
  WorldEntityType
} from '@share/cache/worldbuilding/worldbuilding'
import { worldbuildingClientService } from '../services/worldbuildingClientService'

const route = useRoute()

const entityDetail = ref<WorldEntityDetailPayload | null>(null)
const savingDescription = ref(false)

const descriptionText = ref('')

const worldId = computed(() => String(route.params.worldId || ''))
const entityId = computed(() => String(route.params.entityId || ''))

const editableComponentByType: Partial<Record<WorldEntityType, string>> = {
  character: 'character_profile',
  race: 'race_profile',
  faction: 'faction_profile',
  nation: 'nation_profile'
}

const editableComponentType = computed(
  () => (entityDetail.value ? editableComponentByType[entityDetail.value.entity.type] || '' : '')
)

const displayEntityType = computed(() => {
  const currentType = entityDetail.value?.entity.type
  if (currentType === 'character') return '人物'
  if (currentType === 'race') return '种族'
  if (currentType === 'faction') return '势力'
  if (currentType === 'nation') return '国家'
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
}

const loadEntityDetail = async (): Promise<void> => {
  if (!entityId.value) {
    entityDetail.value = null
    return
  }

  entityDetail.value = await worldbuildingClientService.getEntityDetail(entityId.value)
  syncFormFromDetail()
}

const saveDescription = async (): Promise<void> => {
  if (!entityDetail.value || !editableComponentType.value) return

  const editableComponent = getEditableComponent()
  const nextData = {
    ...(editableComponent?.data ?? {}),
    description: descriptionText.value
  }

  savingDescription.value = true
  try {
    await worldbuildingClientService.upsertComponent({
      entityId: entityDetail.value.entity.id,
      componentType: editableComponentType.value,
      schemaVersion: editableComponent?.schemaVersion ?? 1,
      data: nextData
    })
    await loadEntityDetail()
  } finally {
    savingDescription.value = false
  }
}

onMounted(async () => {
  await loadEntityDetail()
})
</script>

<style scoped>
.entity-shell {
  min-height: 100vh;
  padding: 24px;
  background:
    radial-gradient(circle at top left, rgba(229, 237, 255, 0.92), transparent 26%),
    linear-gradient(180deg, #f4f7fb 0%, #edf2f8 100%);
}

.entity-topbar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
}

.topbar-left {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.back-link,
.assistant-link,
.primary-btn {
  border-radius: 16px;
  font: inherit;
  text-decoration: none;
}

.back-link,
.assistant-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 16px;
  border: 1px solid rgba(111, 132, 162, 0.22);
  background: rgba(255, 255, 255, 0.86);
  color: #243247;
}

.eyebrow {
  font-size: 11px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #66758a;
}

.entity-meta h1,
.entity-meta p,
.panel h2 {
  margin: 0;
}

.entity-meta h1 {
  margin-top: 6px;
  font-size: 40px;
  line-height: 1;
  color: #182233;
}

.entity-meta p {
  margin-top: 8px;
  font-size: 15px;
  color: #5f6f86;
}

.entity-main {
  margin-top: 24px;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  gap: 20px;
}

.panel {
  border-radius: 26px;
  border: 1px solid rgba(109, 129, 158, 0.16);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 24px 60px rgba(24, 39, 68, 0.08);
  padding: 20px;
}

.panel-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.form-stack {
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

.field-area {
  min-height: 320px;
  resize: vertical;
  line-height: 1.7;
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

@media (max-width: 980px) {
  .entity-main {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .entity-shell {
    padding: 18px;
  }

  .entity-topbar {
    flex-direction: column;
  }

  .entity-meta h1 {
    font-size: 30px;
  }
}
</style>
