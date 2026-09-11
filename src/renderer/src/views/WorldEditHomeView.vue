<template>
  <div class="home-host">
    <CanvasHome v-if="homeStyle === 'canvas'" />
    <ResourceHome v-else-if="activeResource" :resource="activeResource" @action="handleAction" />
    <DefaultHome v-else @action="handleAction" />
    <div v-if="home.error.value || actionError" class="home-error" role="alert">
      {{ actionError || home.error.value }}<button @click="retry">重试</button>
    </div>
    <dialog ref="formDialog" class="world-form" @cancel="preventBusyClose">
      <form @submit.prevent="saveWorld">
        <h2>{{ editingId ? '编辑世界观' : '创建世界观' }}</h2>
        <label
          >世界观名称<input
            v-model.trim="name"
            required
            maxlength="120"
            autofocus
            :disabled="saving"
        /></label>
        <label
          >一句话摘要<textarea v-model.trim="summary" maxlength="300" rows="3" :disabled="saving" />
        </label>
        <p v-if="formError" role="alert">{{ formError }}</p>
        <footer>
          <button type="button" :disabled="saving" @click="formDialog?.close()">取消</button
          ><button :disabled="saving || !name">
            {{ saving ? '保存中…' : editingId ? '保存' : '创建并进入' }}
          </button>
        </footer>
      </form>
    </dialog>
    <ConfirmDialog
      v-model="deleteOpen"
      title="删除世界观"
      :message="`确认删除「${deleteName}」及其内容？此操作无法撤销。`"
      :loading="saving"
      :danger="true"
      @confirm="deleteWorld"
    />
  </div>
</template>
<script setup lang="ts">
import { defineAsyncComponent, onMounted, provide, ref } from 'vue'
import { createHomePage, homePageKey } from '../features/home/useHomePage'
import { useHomeStyle } from '../composables/useHomeStyle'
import DefaultHome from '../features/home/DefaultHome.vue'
import ResourceHome from '../features/home/ResourceHome.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
const CanvasHome = defineAsyncComponent(() => import('./CanvasHomeView.vue'))
const home = createHomePage()
provide(homePageKey, home)
const { homeStyle, activeResource } = useHomeStyle()
const formDialog = ref<HTMLDialogElement | null>(null)
const editingId = ref('')
const name = ref('')
const summary = ref('')
const saving = ref(false)
const formError = ref('')
const actionError = ref('')
const deleteOpen = ref(false)
const deleteId = ref('')
const deleteName = ref('')
const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
function preventBusyClose(event: Event): void {
  if (saving.value) event.preventDefault()
}
async function handleAction(action: string, worldId?: string): Promise<void> {
  if (saving.value || formDialog.value?.open || deleteOpen.value) return
  actionError.value = ''
  const world = home.worlds.value.find((item) => item.id === worldId)
  try {
    if (action === 'reload') await home.reload()
    if (action === 'assistant') await home.openAssistant()
    if (action === 'open' && world) await home.openWorld(world.id)
    if (action === 'create' || (action === 'edit' && world)) {
      editingId.value = action === 'edit' ? world!.id : ''
      name.value = action === 'edit' ? world!.name : ''
      summary.value = action === 'edit' ? world!.summary || '' : ''
      formError.value = ''
      formDialog.value?.showModal()
    }
    if (action === 'delete' && world) {
      deleteId.value = world.id
      deleteName.value = world.name
      deleteOpen.value = true
    }
  } catch (error) {
    actionError.value = errorText(error)
  }
}
async function saveWorld(): Promise<void> {
  if (saving.value || !name.value) return
  saving.value = true
  formError.value = ''
  try {
    const input = { name: name.value, summary: summary.value }
    const world = editingId.value
      ? await home.updateWorld({ ...input, worldId: editingId.value })
      : await home.createWorld(input)
    formDialog.value?.close()
    if (!editingId.value) await home.openWorld(world.id)
  } catch (error) {
    formError.value = errorText(error)
  } finally {
    saving.value = false
  }
}
async function deleteWorld(): Promise<void> {
  if (saving.value) return
  saving.value = true
  try {
    await home.deleteWorld(deleteId.value)
    deleteOpen.value = false
  } catch (error) {
    actionError.value = errorText(error)
    deleteOpen.value = false
  } finally {
    saving.value = false
  }
}
function retry(): void {
  actionError.value = ''
  void home.reload()
}
onMounted(() => {
  void home.reload()
})
</script>
<style scoped>
.home-host {
  position: relative;
  height: 100%;
  min-height: 0;
}
.home-error {
  position: absolute;
  bottom: 12px;
  left: 20px;
  right: 20px;
  padding: 12px;
  border: 1px solid #c45b61;
  background: #fff1f1;
  color: #832c35;
  font-size: 13px;
}
.home-error button {
  margin-left: 12px;
}
.world-form {
  width: 420px;
  max-width: calc(100vw - 40px);
  padding: 24px;
  border: 1px solid #dce1e7;
  border-radius: 8px;
  background: #ffffff;
  color: #24272c;
  color-scheme: light;
}
.world-form::backdrop {
  background: #18212c40;
}
.world-form h2 {
  margin: 0 0 24px;
  font-size: 18px;
}
.world-form label {
  display: grid;
  gap: 8px;
  margin-bottom: 18px;
  font-size: 13px;
}
.world-form input,
.world-form textarea {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #cbd2da;
  background: #ffffff;
  color: #24272c;
  padding: 10px;
  border-radius: 4px;
  font: inherit;
}
.world-form footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
.world-form button {
  padding: 8px 16px;
  border-radius: 4px;
  border: 1px solid #cbd2da;
  background: #f5f6f8;
  color: #24272c;
  cursor: pointer;
}
.world-form button:disabled {
  opacity: 0.5;
  cursor: default;
}
.world-form button:hover:not(:disabled) {
  background: #ebeef2;
}
.world-form input:focus-visible,
.world-form textarea:focus-visible,
.world-form button:focus-visible {
  outline: 2px solid #397c68;
  outline-offset: 2px;
}
.world-form p {
  color: #a53039;
  font-size: 13px;
}
</style>
