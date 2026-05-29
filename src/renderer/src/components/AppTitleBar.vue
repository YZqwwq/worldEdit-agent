<template>
  <header class="app-titlebar">
    <div class="titlebar-content">
      <span class="titlebar-title">{{ titleBar.title }}</span>
      <span v-if="titleBar.subtitle" class="titlebar-subtitle">{{ titleBar.subtitle }}</span>
      <span v-if="titleBar.meta" class="titlebar-meta">{{ titleBar.meta }}</span>
      <span v-if="titleBar.trailing" class="titlebar-trailing">{{ titleBar.trailing }}</span>
    </div>

    <router-link to="/chat" class="titlebar-link">AI 助手</router-link>
  </header>
</template>

<script setup lang="ts">
import { useAppTitleBarState } from '../composables/useAppTitleBar'

const titleBar = useAppTitleBarState()
</script>

<style scoped>
.app-titlebar {
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
</style>
