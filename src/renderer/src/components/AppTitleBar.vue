<template>
  <header class="app-titlebar">
    <div class="titlebar-content">
      <span class="titlebar-title">{{ titleBar.title }}</span>
      <span v-if="titleBar.subtitle" class="titlebar-subtitle">{{ titleBar.subtitle }}</span>
      <span v-if="titleBar.meta" class="titlebar-meta">{{ titleBar.meta }}</span>
      <span v-if="titleBar.trailing" class="titlebar-trailing">{{ titleBar.trailing }}</span>
    </div>

    <div class="titlebar-actions">
      <router-link to="/chat" class="titlebar-link">AI 助手</router-link>
      <div ref="settingsRef" class="titlebar-settings" @keydown.esc.stop="closeSettings(true)">
        <button
          ref="settingsButtonRef"
          type="button"
          class="settings-button"
          title="首页样式设置"
          aria-label="首页样式设置"
          aria-controls="home-style-settings"
          :aria-expanded="settingsOpen"
          @click="settingsOpen = !settingsOpen"
        >
          <Settings :size="16" aria-hidden="true" />
        </button>
        <div v-if="settingsOpen" id="home-style-settings" class="settings-panel">
          <div class="settings-heading">
            <div class="settings-heading-title">
              <h2>首页样式</h2>
              <div class="add-style-control">
                <button
                  type="button"
                  class="settings-button"
                  :disabled="importing"
                  :title="importing ? '导入中…' : '添加样式资源'"
                  :aria-label="importing ? '导入中…' : '添加样式资源'"
                  @click="canvasInstalled ? fileInput?.click() : (addMenuOpen = !addMenuOpen)"
                >
                  <Plus :size="16" aria-hidden="true" />
                </button>
                <div v-if="addMenuOpen && !canvasInstalled" class="add-style-menu">
                  <button
                    type="button"
                    @click="
                      addMenuOpen = false
                      fileInput?.click()
                    "
                  >
                    导入样式资源
                  </button>
                  <button
                    type="button"
                    @click="
                      addMenuOpen = false
                      runSetting(installCanvas)
                    "
                  >
                    安装动态世界
                  </button>
                </div>
              </div>
            </div>
            <button
              class="settings-button"
              aria-label="关闭首页样式"
              title="关闭"
              @click="closeSettings(true)"
            >
              <X :size="16" />
            </button>
          </div>
          <fieldset class="style-gallery" aria-label="首页样式">
            <div v-for="style in homeStyles" :key="style.id" class="style-row">
              <label class="style-option">
                <input
                  type="radio"
                  name="home-style"
                  :value="style.id"
                  :checked="homeStyle === style.id"
                  @change="runSetting(() => setHomeStyle(style.id))"
                />
                <div class="style-thumbnail" :class="{ selected: homeStyle === style.id }">
                  <HomeStylePreview :id="style.id" :resource="getResource(style.id)" />
                  <span v-if="homeStyle === style.id" class="selected-badge"
                    ><Check :size="13"
                  /></span>
                </div>
                <span class="style-caption" :class="{ 'has-remove': style.removable }">
                  <span class="style-name" :title="style.name">{{ style.name }}</span>
                  <small v-if="!style.removable">默认内置</small>
                </span>
              </label>
              <button
                v-if="style.removable"
                class="settings-button remove-style"
                :title="`移除 ${style.name}`"
                :aria-label="`移除 ${style.name}`"
                @click="pendingRemoval = style.id"
              >
                <Trash2 :size="14" />
              </button>
            </div>
          </fieldset>
          <div v-if="pendingRemoval" class="remove-confirm">
            <p>移除此首页样式？世界观数据将保留。</p>
            <button @click="confirmRemoval">移除</button>
            <button @click="pendingRemoval = ''">取消</button>
          </div>
          <input
            ref="fileInput"
            type="file"
            accept=".json,application/json"
            hidden
            @change="importStyle"
          />
          <p v-if="settingsError" class="settings-error" role="alert">{{ settingsError }}</p>
        </div>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useAppTitleBarState } from '../composables/useAppTitleBar'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Settings, Plus, Trash2, Check, X } from '@lucide/vue'
import { useHomeStyle } from '../composables/useHomeStyle'
import HomeStylePreview from '../features/home/HomeStylePreview.vue'

const titleBar = useAppTitleBarState()
const {
  homeStyles,
  getResource,
  homeStyle,
  setHomeStyle,
  canvasInstalled,
  installCanvas,
  installResource,
  removeResource
} = useHomeStyle()
const fileInput = ref<HTMLInputElement | null>(null)
const pendingRemoval = ref('')
const settingsError = ref('')
const importing = ref(false)
const addMenuOpen = ref(false)
function confirmRemoval(): void {
  runSetting(() => removeResource(pendingRemoval.value))
  pendingRemoval.value = ''
}
function runSetting(action: () => void): void {
  settingsError.value = ''
  try {
    action()
  } catch (error) {
    settingsError.value = error instanceof Error ? error.message : String(error)
  }
}
async function importStyle(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importing.value = true
  settingsError.value = ''
  try {
    if (file.size > 2_000_000) throw new Error('样式资源不能超过 2 MB')
    installResource(JSON.parse(await file.text()))
  } catch (error) {
    settingsError.value = error instanceof Error ? error.message : String(error)
  } finally {
    importing.value = false
    input.value = ''
  }
}
const settingsOpen = ref(false)
const settingsRef = ref<HTMLElement | null>(null)
const settingsButtonRef = ref<HTMLButtonElement | null>(null)
const closeSettings = (restoreFocus = false): void => {
  settingsOpen.value = false
  addMenuOpen.value = false
  if (restoreFocus) settingsButtonRef.value?.focus()
}
const handleOutside = (event: Event): void => {
  if (event.target instanceof Node && !settingsRef.value?.contains(event.target)) closeSettings()
}
onMounted(() => {
  document.addEventListener('pointerdown', handleOutside)
  document.addEventListener('focusin', handleOutside)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleOutside)
  document.removeEventListener('focusin', handleOutside)
})
</script>

<style scoped>
.app-titlebar {
  position: relative;
  z-index: 20;
  height: var(--app-titlebar-height);
  min-height: var(--app-titlebar-height);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 var(--app-titlebar-window-control-width) 0 34px;
  border-bottom: 1px solid var(--app-titlebar-border);
  background: var(--app-titlebar-bg);
  color: var(--app-titlebar-text);
  user-select: none;
  -webkit-app-region: drag;
}

.titlebar-content {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  line-height: 1;
}

.titlebar-title {
  max-width: 420px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--app-titlebar-text);
}

.titlebar-subtitle,
.titlebar-meta,
.titlebar-trailing {
  color: var(--app-titlebar-muted);
  white-space: nowrap;
}

.titlebar-link {
  flex-shrink: 0;
  color: var(--app-titlebar-muted);
  text-decoration: none;
  -webkit-app-region: no-drag;
}

.titlebar-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.titlebar-settings {
  position: relative;
}
.settings-button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--app-titlebar-muted);
  cursor: pointer;
}
.settings-button:hover,
.settings-button[aria-expanded='true'] {
  background: #e5e9ef;
  color: #202124;
}
.settings-button:focus-visible {
  outline: 2px solid #527b73;
  outline-offset: -2px;
}
.settings-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: min(540px, calc(100vw - var(--app-titlebar-window-control-width) - 24px));
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  overflow: auto;
  padding: 20px;
  border: 1px solid rgba(255, 255, 255, 0.85);
  border-radius: 20px;
  background: rgba(242, 245, 249, 0.72);
  backdrop-filter: blur(28px) saturate(160%);
  -webkit-backdrop-filter: blur(28px) saturate(160%);
  color: #202124;
  box-shadow:
    0 18px 56px #24334a26,
    0 2px 8px #24334a12,
    inset 0 1px 0 #fff;
  font-size: 13px;
}
.settings-panel fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.settings-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.settings-heading h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
}
.style-gallery {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px 14px;
}
.style-option {
  position: relative;
  width: 100%;
  min-width: 0;
  display: block;
  cursor: pointer;
}
.style-row {
  position: relative;
  min-width: 0;
}
.style-option small {
  flex-shrink: 0;
  color: #7a828c;
  font-size: 11px;
  font-weight: 400;
  white-space: nowrap;
}
.style-thumbnail {
  position: relative;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 8px;
  box-shadow: 0 2px 8px #26344a12;
  transition:
    border-color 150ms,
    box-shadow 150ms;
}
.style-thumbnail.selected {
  border-color: #49877a;
  box-shadow: 0 0 0 2px #49877a18;
}
.style-option:hover .style-thumbnail {
  box-shadow: 0 4px 14px #26344a22;
}
.selected-badge {
  position: absolute;
  right: 8px;
  bottom: 8px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #39796b;
  color: white;
  box-shadow: 0 1px 4px #152d3033;
}
.style-caption {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 8px 0 0 2px;
  font-weight: 550;
  line-height: 26px;
}
.style-caption.has-remove {
  padding-right: 30px;
}
.style-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.remove-style {
  position: absolute;
  right: 0;
  bottom: 0;
}
.style-option input:focus-visible + .style-thumbnail {
  outline: 2px solid #39796b;
  outline-offset: 3px;
}
.settings-heading-title {
  display: flex;
  align-items: center;
  gap: 6px;
}
.add-style-control {
  position: relative;
}
.settings-button:disabled {
  opacity: 0.5;
  cursor: wait;
}
.add-style-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 2;
  display: grid;
  min-width: 140px;
  padding: 4px;
  border: 1px solid #dce2e9;
  border-radius: 8px;
  background: #f8fafc;
  box-shadow: 0 6px 20px #24334a20;
}
.add-style-menu button {
  border: 0;
  border-radius: 4px;
  padding: 8px 10px;
  background: transparent;
  color: #202124;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  font: inherit;
}
.add-style-menu button:hover {
  background: #e5e9ef;
}
.settings-error {
  color: #a53039;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.remove-confirm {
  padding: 8px;
  background: #fff4f4;
  font-size: 12px;
}
.remove-confirm button {
  margin-right: 12px;
  cursor: pointer;
}
.style-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
@media (max-width: 720px) {
  .settings-panel {
    position: fixed;
    top: calc(var(--app-titlebar-height) + 8px);
    right: 12px;
    width: calc(100vw - 24px);
    max-width: 540px;
    padding: 16px;
  }
}
@supports not (backdrop-filter: blur(1px)) {
  .settings-panel {
    background: #f2f5f9;
  }
}
</style>
