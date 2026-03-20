<template>
  <div class="shortcut-help">
    <button
      type="button"
      class="shortcut-help-btn"
      aria-label="查看编辑器快捷键"
    >
      !
    </button>

    <div class="shortcut-popover">
      <section v-for="group in worldEditorShortcutGroups" :key="group.title" class="shortcut-group">
        <div class="shortcut-group-title">{{ group.title }}</div>
        <div v-for="item in group.items" :key="`${group.title}-${item.label}`" class="shortcut-row">
          <span class="shortcut-label">{{ item.label }}</span>
          <span class="shortcut-key">{{ item.shortcut }}</span>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { worldEditorShortcutGroups } from '../model/keyboardShortcuts'
</script>

<style scoped>
.shortcut-help {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.shortcut-help-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid rgba(205, 161, 92, 0.18);
  border-radius: 999px;
  background: rgba(11, 15, 22, 0.94);
  color: #d8c29d;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  cursor: help;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.shortcut-popover {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  min-width: 300px;
  padding: 12px 14px;
  border: 1px solid rgba(205, 161, 92, 0.18);
  border-radius: 16px;
  background: rgba(11, 15, 22, 0.98);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.42);
  opacity: 0;
  transform: translateY(-4px);
  pointer-events: none;
  transition:
    opacity 120ms ease,
    transform 120ms ease;
  z-index: 30;
}

.shortcut-help:hover .shortcut-popover,
.shortcut-help:focus-within .shortcut-popover {
  opacity: 1;
  transform: translateY(0);
  pointer-events: auto;
}

.shortcut-group + .shortcut-group {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(205, 161, 92, 0.12);
}

.shortcut-group-title {
  margin-bottom: 6px;
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #a79272;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
}

.shortcut-label {
  font-size: 14px;
  color: #f4ede1;
}

.shortcut-key {
  font-size: 12px;
  color: #a9b3c4;
  white-space: nowrap;
}
</style>
