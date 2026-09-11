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
          <fieldset>
            <legend>首页样式</legend>
            <div v-for="style in homeStyles" :key="style.id" class="style-row">
              <label class="style-option">
                <input
                  type="radio"
                  name="home-style"
                  :value="style.id"
                  :checked="homeStyle === style.id"
                  @change="runSetting(() => setHomeStyle(style.id))"
                />
                <span
                  >{{ style.name
                  }}<small>{{ style.removable ? style.version : '内置 · 始终保留' }}</small></span
                >
              </label>
              <button
                v-if="style.removable"
                class="settings-button"
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
            <button @click="confirmRemoval">
              移除
            </button>
            <button @click="pendingRemoval = ''">取消</button>
          </div>
          <div class="resource-actions">
            <button type="button" :disabled="importing" @click="fileInput?.click()">
              <Plus :size="14" />{{ importing ? '导入中…' : '添加样式资源' }}
            </button>
            <button v-if="!canvasInstalled" type="button" @click="runSetting(installCanvas)">
              安装动态世界
            </button>
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
import { Settings, Plus, Trash2 } from '@lucide/vue'
import { useHomeStyle } from '../composables/useHomeStyle'

const titleBar = useAppTitleBarState()
const {
  homeStyles,
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
  width: min(280px, calc(100vw - var(--app-titlebar-window-control-width) - 24px));
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  overflow: auto;
  padding: 12px;
  border: 1px solid #dce1e7;
  border-radius: 6px;
  background: #fff;
  color: #202124;
  box-shadow: 0 8px 24px #18212c1f;
  font-size: 13px;
}
.settings-panel fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.settings-panel legend {
  padding: 0 6px 8px;
  font-weight: 600;
}
.style-option {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 6px;
  cursor: pointer;
}
.style-row {
  display: flex;
  align-items: center;
  gap: 4px;
}
.style-option span {
  overflow-wrap: anywhere;
}
.style-option small {
  display: block;
  color: #7a828c;
  margin-top: 4px;
  font-size: 11px;
}
.resource-actions {
  display: grid;
  gap: 8px;
  border-top: 1px solid #e5e7eb;
  padding-top: 12px;
  margin-top: 8px;
}
.resource-actions button {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid #dce1e7;
  border-radius: 4px;
  background: #f6f8fb;
  color: #202124;
  cursor: pointer;
  font: inherit;
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
.style-option:hover {
  background: #f3f5f7;
}
.style-option input {
  accent-color: #396f63;
  margin: 0;
}
</style>
