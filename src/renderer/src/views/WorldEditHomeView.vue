<template>
  <div class="landing-shell">
    <header class="topbar">
      <div>
        <div class="eyebrow">Worldbuilding</div>
        <h1>世界观</h1>
      </div>

      <router-link to="/chat" class="assistant-entry" title="AI 助手">
        <span class="assistant-icon">AI</span>
      </router-link>
    </header>

    <main class="landing-main">
      <section class="intro">
        <p class="intro-copy">
          从一个世界观名字开始。创建后进入独立编辑界面，再逐步补充人物、种族、势力、国家与地图。
        </p>
      </section>

      <section class="world-grid">
        <button class="world-card create-card" @click="openCreateDialog">
          <span class="create-mark">+</span>
          <span class="create-title">创建世界观</span>
          <span class="create-copy">输入名称后进入进一步编辑界面</span>
        </button>

        <article
          v-for="world in worlds"
          :key="world.id"
          class="world-card existing-card"
          role="button"
          tabindex="0"
          @click="openWorld(world.id)"
          @keydown.enter.prevent="openWorld(world.id)"
          @keydown.space.prevent="openWorld(world.id)"
        >
          <div class="card-head">
            <span class="world-title">{{ world.name }}</span>
            <div class="card-actions">
              <button
                type="button"
                class="card-menu-trigger"
                title="编辑世界观"
                @click.stop="toggleWorldMenu(world.id)"
              >
                ⋯
              </button>
              <div v-if="activeWorldMenuId === world.id" class="card-menu" @click.stop>
                <button type="button" class="card-menu-item" @click="openEditDialog(world)">
                  编辑
                </button>
                <button type="button" class="card-menu-item danger" @click="openDeleteConfirm(world)">
                  删除
                </button>
              </div>
            </div>
          </div>
          <span class="card-arrow">进入</span>
          <p class="world-summary">{{ world.summary || '暂无摘要，点击进入继续编辑。' }}</p>
        </article>
      </section>

      <div v-if="!loadingWorlds && worlds.length === 0" class="empty-state">
        还没有已创建的世界观。先创建你的第一个世界。
      </div>
    </main>

    <teleport to="body">
      <div v-if="showWorldDialog" class="dialog-backdrop" @click.self="closeWorldDialog">
        <div class="dialog-card">
          <div class="dialog-head">
            <div>
              <div class="eyebrow">{{ isEditingWorld ? 'Edit' : 'Create' }}</div>
              <h2>{{ isEditingWorld ? '编辑世界观' : '创建世界观' }}</h2>
            </div>
            <button class="close-btn" @click="closeWorldDialog">✕</button>
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { WorldPayload } from '@share/cache/worldbuilding/worldbuilding'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import { worldbuildingClientService } from '../services/worldbuildingClientService'

const router = useRouter()

const worlds = ref<WorldPayload[]>([])
const loadingWorlds = ref(false)
const creatingWorld = ref(false)
const deletingWorld = ref(false)

const showWorldDialog = ref(false)
const editingWorldId = ref('')
const activeWorldMenuId = ref('')
const pendingDeleteWorld = ref<WorldPayload | null>(null)
const showDeleteConfirm = ref(false)
const newWorldName = ref('')
const newWorldSummary = ref('')
const createError = ref('')

const isEditingWorld = computed(() => editingWorldId.value !== '')
const deleteConfirmMessage = computed(() =>
  pendingDeleteWorld.value
    ? `将删除世界观「${pendingDeleteWorld.value.name}」及其下所有实体、组件和关系，此操作无法撤销。`
    : '确认删除该世界观吗？'
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

const toggleWorldMenu = (worldId: string): void => {
  activeWorldMenuId.value = activeWorldMenuId.value === worldId ? '' : worldId
}

const openEditDialog = (world: WorldPayload): void => {
  activeWorldMenuId.value = ''
  editingWorldId.value = world.id
  newWorldName.value = world.name
  newWorldSummary.value = world.summary || ''
  createError.value = ''
  showWorldDialog.value = true
}

const openDeleteConfirm = (world: WorldPayload): void => {
  activeWorldMenuId.value = ''
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

const handleWindowPointerDown = (event: PointerEvent): void => {
  const target = event.target as HTMLElement | null
  if (target?.closest('.card-actions')) return
  activeWorldMenuId.value = ''
}

onMounted(async () => {
  window.addEventListener('pointerdown', handleWindowPointerDown)
  await loadWorlds()
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleWindowPointerDown)
})
</script>

<style scoped>
.landing-shell {
  min-height: 100vh;
  padding: 28px 32px 40px;
  background:
    radial-gradient(circle at top left, rgba(231, 239, 255, 0.9), transparent 28%),
    linear-gradient(180deg, #f6f8fc 0%, #eef2f8 100%);
}

.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.eyebrow {
  font-size: 12px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #6d7c91;
}

h1,
h2,
p {
  margin: 0;
}

h1 {
  margin-top: 6px;
  font-size: 48px;
  line-height: 1;
  color: #182233;
}

.assistant-entry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 20px;
  border: 1px solid rgba(100, 123, 156, 0.18);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 14px 40px rgba(24, 39, 68, 0.08);
  text-decoration: none;
}

.assistant-icon {
  font-size: 16px;
  font-weight: 700;
  color: #1b4cb8;
}

.landing-main {
  margin-top: 28px;
}

.intro {
  max-width: 780px;
  margin-bottom: 28px;
}

.intro-copy {
  font-size: 17px;
  line-height: 1.7;
  color: #586881;
}

.world-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 22px;
}

.world-card {
  min-height: 220px;
  border-radius: 30px;
  border: 1px solid rgba(109, 129, 158, 0.16);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 24px 60px rgba(24, 39, 68, 0.08);
  padding: 24px;
  text-align: left;
  cursor: pointer;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease,
    border-color 0.18s ease;
}

.world-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 32px 70px rgba(24, 39, 68, 0.12);
  border-color: rgba(48, 96, 201, 0.24);
}

.create-card {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  gap: 14px;
  background:
    linear-gradient(180deg, rgba(247, 250, 255, 0.98), rgba(238, 244, 255, 0.98)),
    white;
}

.create-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border-radius: 18px;
  background: linear-gradient(135deg, #3972ff, #204cb8);
  color: white;
  font-size: 34px;
  line-height: 1;
}

.create-title,
.world-title {
  font-size: 28px;
  font-weight: 700;
  color: #182233;
}

.create-copy,
.world-summary {
  font-size: 14px;
  line-height: 1.7;
  color: #677790;
}

.existing-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.card-actions {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.card-menu-trigger {
  width: 34px;
  height: 34px;
  border: 1px solid rgba(111, 132, 162, 0.22);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.94);
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
  z-index: 4;
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

.card-arrow {
  display: inline-flex;
  align-items: center;
  padding: 6px 12px;
  border-radius: 999px;
  background: #edf3ff;
  color: #2f63da;
  font-size: 12px;
  font-weight: 600;
  margin-top: 16px;
  align-self: flex-start;
}

.empty-state {
  margin-top: 24px;
  font-size: 14px;
  color: #6e7d92;
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
  z-index: 50;
}

.dialog-card {
  width: min(560px, 100%);
  border-radius: 28px;
  background: #ffffff;
  border: 1px solid rgba(109, 129, 158, 0.16);
  box-shadow: 0 28px 90px rgba(22, 34, 59, 0.18);
  padding: 24px;
}

.dialog-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.dialog-head h2 {
  margin-top: 6px;
  font-size: 28px;
  color: #172133;
}

.close-btn,
.ghost-btn,
.primary-btn {
  border-radius: 16px;
  font: inherit;
}

.close-btn {
  width: 40px;
  height: 40px;
  border: 0;
  background: #f1f4f9;
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
  color: #243247;
}

.field {
  width: 100%;
  box-sizing: border-box;
  border: 1px solid rgba(111, 132, 162, 0.24);
  background: #f8faff;
  color: #182233;
  border-radius: 18px;
  padding: 14px 16px;
  font: inherit;
}

.field:focus {
  outline: none;
  border-color: #3c72f6;
  box-shadow: 0 0 0 4px rgba(60, 114, 246, 0.14);
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
  padding: 12px 18px;
  cursor: pointer;
}

.ghost-btn {
  border: 1px solid rgba(111, 132, 162, 0.22);
  background: white;
  color: #243247;
}

.primary-btn {
  border: 0;
  background: linear-gradient(135deg, #3a72ff, #214ebc);
  color: white;
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

@media (max-width: 720px) {
  .landing-shell {
    padding: 20px 18px 28px;
  }

  .topbar {
    align-items: center;
  }

  h1 {
    font-size: 36px;
  }

  .world-grid {
    grid-template-columns: 1fr;
  }
}
</style>
