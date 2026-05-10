<template>
  <GenericWorldEntityEditorView v-if="entityResolved && !isCharacter" />

  <div v-else class="worldbuilding-white-theme feature-shell">
    <header class="feature-topbar">
      <div class="topbar-links">
        <router-link
          v-if="worldId"
          :to="{ name: 'WorldEditor', params: { worldId } }"
          class="nav-link"
        >
          返回世界实例
        </router-link>
        <router-link to="/chat" class="nav-link subtle-link">AI 助手</router-link>
      </div>
    </header>

    <main class="feature-main">
      <section class="feature-hero">
        <div class="eyebrow">Character Workspace</div>
        <h1>{{ entityDetail?.entity.name || '人物功能选择' }}</h1>
        <p>
          人物实例按功能拆分为独立工作区。你可以分别维护人物简介、立绘展示和叙事文本，减少不同编辑任务之间的干扰。
        </p>
      </section>

      <section v-if="entityResolved && isCharacter" class="feature-grid">
        <router-link
          :to="{ name: 'CharacterProfileEditor', params: { worldId, entityId } }"
          class="feature-card"
        >
          <div class="feature-icon">简</div>
          <div class="feature-eyebrow">Profile Workspace</div>
          <h2>人物简介</h2>
          <p>维护人物名、称谓与一句话简介，快速整理角色对外展示信息。</p>
          <span class="feature-action">进入功能页</span>
        </router-link>

        <router-link
          :to="{ name: 'CharacterPortraitEditor', params: { worldId, entityId } }"
          class="feature-card"
        >
          <div class="feature-icon">像</div>
          <div class="feature-eyebrow">Visual Workspace</div>
          <h2>人物立绘展示</h2>
          <p>进入人物立绘、版式和展示型基础信息编辑页。</p>
          <span class="feature-action">进入功能页</span>
        </router-link>

        <router-link
          :to="{ name: 'CharacterNarrativeEditor', params: { worldId, entityId } }"
          class="feature-card"
        >
          <div class="feature-icon">文</div>
          <div class="feature-eyebrow">Narrative Workspace</div>
          <h2>文本编辑</h2>
          <p>进入人物介绍、经历、秘密与叙事文案的专属编辑页。</p>
          <span class="feature-action">进入功能页</span>
        </router-link>
      </section>

      <section v-else-if="entityResolved" class="fallback-card">
        <h2>当前实体不是人物</h2>
        <p>该实例会直接进入通用实体编辑器，不经过人物功能选择页。</p>
      </section>

      <section v-else class="fallback-card">
        <h2>正在读取实体信息</h2>
        <p>请稍候，我正在确认当前实例的类型。</p>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { WorldEntityDetailPayload } from '@share/cache/worldbuilding/worldbuilding'
import GenericWorldEntityEditorView from './GenericWorldEntityEditorView.vue'
import { worldbuildingClientService } from '../services/worldbuildingClientService'
import '../styles/worldbuildingWhiteTheme.css'

const route = useRoute()

const entityDetail = ref<WorldEntityDetailPayload | null>(null)
const entityResolved = ref(false)

const worldId = computed(() => String(route.params.worldId || ''))
const entityId = computed(() => String(route.params.entityId || ''))
const isCharacter = computed(() => entityDetail.value?.entity.type === 'character')

const loadEntityDetail = async (): Promise<void> => {
  if (!entityId.value) {
    entityDetail.value = null
    entityResolved.value = true
    return
  }

  entityDetail.value = await worldbuildingClientService.getEntityDetail(entityId.value)
  entityResolved.value = true
}

onMounted(async () => {
  await loadEntityDetail()
})
</script>

<style scoped>
.feature-shell {
  min-height: 100vh;
  padding: 24px;
  box-sizing: border-box;
  background:
    radial-gradient(circle at top left, rgba(17, 17, 17, 0.06), transparent 26%),
    linear-gradient(180deg, #fbfbfb 0%, #f3f4f6 100%);
  color: var(--wb-text-primary);
}

.feature-topbar {
  margin-bottom: 20px;
}

.topbar-links {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.nav-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 16px;
  border-radius: var(--wb-radius-pill);
  border: 1px solid var(--wb-panel-line-strong);
  background: rgba(255, 255, 255, 0.9);
  color: var(--wb-text-primary);
  box-shadow: var(--wb-shadow-card);
  text-decoration: none;
  font: inherit;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.nav-link:hover {
  transform: translateY(-1px);
  border-color: rgba(17, 17, 17, 0.18);
}

.subtle-link {
  color: var(--wb-text-secondary);
}

.feature-main {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.feature-hero,
.fallback-card {
  padding: 30px 32px;
  border-radius: var(--wb-radius-panel);
  border: 1px solid var(--wb-panel-line);
  background:
    radial-gradient(circle at top right, rgba(17, 17, 17, 0.05), transparent 24%),
    var(--wb-panel-bg);
  box-shadow: var(--wb-shadow-soft);
}

.eyebrow,
.feature-eyebrow {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--wb-text-tertiary);
}

.feature-hero h1,
.fallback-card h2,
.feature-card h2 {
  margin: 10px 0 0;
  font-size: 30px;
  line-height: 1.2;
  color: var(--wb-text-primary);
}

.feature-hero p,
.fallback-card p,
.feature-card p {
  margin: 14px 0 0;
  color: var(--wb-text-secondary);
  line-height: 1.75;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}

.feature-card {
  display: flex;
  flex-direction: column;
  min-height: 260px;
  padding: 26px;
  border-radius: var(--wb-radius-panel);
  border: 1px solid var(--wb-panel-line);
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(247, 247, 247, 0.98));
  box-shadow: var(--wb-shadow-soft);
  color: inherit;
  text-decoration: none;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.feature-card:hover {
  transform: translateY(-3px);
  border-color: rgba(17, 17, 17, 0.14);
  box-shadow: 0 22px 60px rgba(15, 23, 42, 0.1);
}

.feature-icon {
  width: 54px;
  height: 54px;
  border-radius: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
  background: var(--wb-accent-soft);
  color: var(--wb-accent);
  font-size: 22px;
  font-weight: 700;
}

.feature-action {
  display: inline-flex;
  align-items: center;
  margin-top: auto;
  padding-top: 20px;
  font-weight: 700;
  color: var(--wb-accent);
}

@media (max-width: 1120px) {
  .feature-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .feature-shell {
    padding: 18px;
  }

  .feature-hero,
  .fallback-card,
  .feature-card {
    padding: 22px;
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }

  .feature-hero h1,
  .fallback-card h2,
  .feature-card h2 {
    font-size: 24px;
  }
}
</style>
