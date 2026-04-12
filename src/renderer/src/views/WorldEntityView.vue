<template>
  <GenericWorldEntityEditorView v-if="entityResolved && !isCharacter" />

  <div v-else class="feature-shell">
    <header class="feature-topbar">
      <div class="topbar-links">
        <router-link
          v-if="worldId"
          :to="{ name: 'WorldEditor', params: { worldId } }"
          class="back-link"
        >
          返回世界实例
        </router-link>
        <router-link to="/chat" class="assistant-link">AI 助手</router-link>
      </div>
    </header>

    <main class="feature-main">
      <section class="feature-hero">
        <div class="eyebrow">Character Workspace</div>
        <h1>{{ entityDetail?.entity.name || '人物功能选择' }}</h1>
        <p>
          人物实例现在改为先选择功能，再进入对应工作区。立绘展示与文本编辑已经拆成两个独立页面，方便分别迭代。
        </p>
      </section>

      <section class="feature-grid" v-if="entityResolved && isCharacter">
        <router-link
          :to="{ name: 'CharacterPortraitEditor', params: { worldId, entityId } }"
          class="feature-card"
        >
          <div class="feature-icon">◫</div>
          <div class="feature-eyebrow">Visual Workspace</div>
          <h2>人物立绘展示</h2>
          <p>进入人物立绘、版式和展示型基础信息编辑页。</p>
          <span class="feature-action">进入功能页</span>
        </router-link>

        <router-link
          :to="{ name: 'CharacterNarrativeEditor', params: { worldId, entityId } }"
          class="feature-card"
        >
          <div class="feature-icon">✎</div>
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
  padding: 20px;
  box-sizing: border-box;
  background:
    radial-gradient(circle at top left, rgba(43, 55, 75, 0.32), transparent 24%),
    linear-gradient(180deg, #0d1118 0%, #141a24 100%);
  color: #edf2f7;
}

.feature-topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  margin-bottom: 14px;
}

.topbar-links {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.back-link,
.assistant-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 7px 14px;
  border-radius: 14px;
  border: 1px solid rgba(185, 150, 93, 0.22);
  background: rgba(13, 17, 24, 0.94);
  color: #e7d2ad;
  line-height: 1;
  text-decoration: none;
  font: inherit;
}

.feature-main {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.feature-hero,
.fallback-card {
  border-radius: 28px;
  border: 1px solid rgba(205, 161, 92, 0.16);
  background:
    radial-gradient(circle at top right, rgba(205, 161, 92, 0.1), transparent 28%),
    linear-gradient(180deg, rgba(19, 24, 34, 0.98), rgba(11, 15, 22, 0.98));
  box-shadow: 0 24px 60px rgba(2, 4, 8, 0.34);
  padding: 26px;
}

.eyebrow,
.feature-eyebrow {
  font-size: 11px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #cda15c;
}

.feature-hero h1,
.fallback-card h2,
.feature-card h2 {
  margin: 10px 0 0;
}

.feature-hero p,
.fallback-card p,
.feature-card p {
  margin: 12px 0 0;
  color: #9aa6b8;
  line-height: 1.75;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
}

.feature-card {
  border-radius: 28px;
  border: 1px solid rgba(205, 161, 92, 0.16);
  background:
    linear-gradient(180deg, rgba(22, 28, 38, 0.96), rgba(12, 17, 24, 0.98));
  box-shadow: 0 26px 60px rgba(2, 4, 8, 0.34);
  padding: 24px;
  color: inherit;
  text-decoration: none;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.feature-card:hover {
  transform: translateY(-3px);
  border-color: rgba(205, 161, 92, 0.28);
  box-shadow: 0 30px 70px rgba(2, 4, 8, 0.42);
}

.feature-icon {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(205, 161, 92, 0.12);
  color: #e7d2ad;
  font-size: 24px;
}

.feature-action {
  display: inline-flex;
  align-items: center;
  margin-top: 18px;
  color: #e7d2ad;
  font-weight: 700;
}

@media (max-width: 900px) {
  .feature-grid {
    grid-template-columns: 1fr;
  }

  .feature-topbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
