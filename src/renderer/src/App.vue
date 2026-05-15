<template>
  <div class="app-shell">
    <AppTitleBar />
    <main class="app-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import AppTitleBar from './components/AppTitleBar.vue'
</script>

<style>
:root {
  --app-titlebar-height: 30px;
  --app-titlebar-window-control-width: 148px;
  --app-titlebar-bg: #f6f8fb;
  --app-titlebar-border: rgba(17, 24, 39, 0.1);
  --app-titlebar-text: #202124;
  --app-titlebar-muted: #7a828c;
}

html,
body,
#app {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.app-shell {
  width: 100vw;
  height: 100vh;
  display: grid;
  grid-template-rows: var(--app-titlebar-height) minmax(0, 1fr);
  overflow: hidden;
  background: #ffffff;
}

.app-content {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.app-content > * {
  height: 100%;
  min-height: 0;
}
</style>
