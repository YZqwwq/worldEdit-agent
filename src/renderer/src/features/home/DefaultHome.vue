<template>
  <main class="default-home">
    <div class="welcome">
      <div class="brand">
        <img :src="appIcon" alt="" />
        <h1>WorldEdit</h1>
      </div>
      <div class="quick-actions">
        <button @click="$emit('action', 'create')">
          <FolderPlus :size="20" /><span>创建世界观</span>
        </button>
        <button @click="searchInput?.focus()">
          <FolderOpen :size="20" /><span>打开世界观</span>
        </button>
        <button @click="$emit('action', 'assistant')">
          <MessageSquare :size="20" /><span>AI 助手</span>
        </button>
        <button :disabled="home.loading.value" @click="home.reload()">
          <RefreshCw :size="20" /><span>刷新世界观</span>
        </button>
      </div>
      <div class="list-heading">
        <h2>世界观</h2>
        <div class="search">
          <Search :size="14" /><input
            ref="searchInput"
            v-model="query"
            aria-label="搜索世界观"
            placeholder="搜索"
          />
        </div>
      </div>
      <p v-if="home.loading.value" class="status">正在读取世界观…</p>
      <p v-else-if="!filtered.length" class="status">
        {{ query ? '没有匹配的世界观' : '还没有世界观' }}
      </p>
      <ul class="world-list">
        <li v-for="world in filtered" :key="world.id">
          <button class="world-open" @click="$emit('action', 'open', world.id)">
            <span>{{ world.name }}</span
            ><small>{{ world.summary || '暂无摘要' }}</small>
          </button>
          <button
            class="icon-button"
            :title="`编辑 ${world.name}`"
            :aria-label="`编辑 ${world.name}`"
            @click="$emit('action', 'edit', world.id)"
          >
            <Pencil :size="14" />
          </button>
          <button
            class="icon-button"
            :title="`删除 ${world.name}`"
            :aria-label="`删除 ${world.name}`"
            @click="$emit('action', 'delete', world.id)"
          >
            <Trash2 :size="14" />
          </button>
        </li>
      </ul>
    </div>
  </main>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue'
import appIcon from '../../../../../resources/icon.png?url'
import {
  FolderPlus,
  FolderOpen,
  MessageSquare,
  RefreshCw,
  Search,
  Pencil,
  Trash2
} from '@lucide/vue'
import { useHomePage } from './useHomePage'
defineEmits<{ action: [action: string, worldId?: string] }>()
const home = useHomePage()
const query = ref('')
const searchInput = ref<HTMLInputElement | null>(null)
const filtered = computed(() =>
  home.sortedWorlds.value.filter((world) =>
    `${world.name} ${world.summary || ''}`.toLowerCase().includes(query.value.trim().toLowerCase())
  )
)
</script>
<style scoped>
.default-home {
  height: 100%;
  overflow: auto;
  background: #ffffff;
  color: #24272c;
  color-scheme: light;
  display: flex;
  padding: 64px 28px;
  box-sizing: border-box;
}
.welcome {
  width: 520px;
  max-width: 100%;
  margin: auto;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
}
.brand img {
  width: 34px;
  height: 34px;
  object-fit: contain;
}
.brand h1 {
  font-size: 28px;
  font-weight: 650;
  margin: 0;
}
.quick-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 30px;
}
button {
  font: inherit;
  cursor: pointer;
  color: inherit;
  border: 0;
  text-align: left;
}
.quick-actions button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  background: #f5f6f8;
  padding: 16px;
  border-radius: 6px;
  font-size: 14px;
}
.quick-actions button:hover {
  background: #ebeef2;
}
.quick-actions button:disabled {
  opacity: 0.5;
  cursor: wait;
}
.list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
h2 {
  font-size: 13px;
  color: #69717c;
  font-weight: 500;
  margin: 0;
}
.search {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #69717c;
  width: 184px;
  max-width: 50%;
  height: 32px;
  box-sizing: border-box;
  padding: 0 12px;
  border: 1px solid #e0e4e9;
  border-radius: 999px;
  background: transparent;
  transition: border-color 120ms ease;
}
.search:focus-within {
  border-color: #8c98a5;
}
.search > svg {
  flex-shrink: 0;
}
input {
  width: 100%;
  min-width: 0;
  background: transparent;
  border: 0;
  color: #24272c;
  padding: 0;
  font: inherit;
  font-size: 13px;
}
.world-list {
  padding: 0;
  margin: 0;
  list-style: none;
}
li {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 4px;
}
li:hover {
  background: #f5f6f8;
}
.world-open {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 0;
  background: transparent;
  font-size: 13px;
}
.world-open span {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.world-open small {
  color: #69717c;
  width: 45%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 12px;
}
.icon-button {
  background: transparent;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #69717c;
  border-radius: 4px;
}
.icon-button:hover {
  color: #24272c;
  background: #e8ecf0;
}
button:focus-visible {
  outline: 2px solid #397c68;
  outline-offset: 2px;
}
.search input:focus-visible {
  outline: none;
}
.status {
  color: #69717c;
  font-size: 13px;
  padding: 12px 0;
}
@media (max-width: 480px) {
  .default-home {
    padding: 36px 20px;
  }
  .world-open small {
    display: none;
  }
}
</style>
