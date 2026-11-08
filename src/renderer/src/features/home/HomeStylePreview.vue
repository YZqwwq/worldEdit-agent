<template>
  <div ref="container" class="preview-viewport" aria-hidden="true" inert>
    <div class="preview-stage" :style="{ transform: `scale(${scale})` }">
      <DefaultHome v-if="id === 'default'" />
      <CanvasHome v-else-if="id === 'canvas'" />
      <ResourceHome v-else-if="resource" :resource="resource" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import type { HomeResource } from '../../composables/useHomeStyle'
import { homePageKey, type HomePage } from './useHomePage'
import DefaultHome from './DefaultHome.vue'
import ResourceHome from './ResourceHome.vue'

defineProps<{ id: string; resource?: HomeResource }>()
const CanvasHome = defineAsyncComponent(() => import('../../views/CanvasHomeView.vue'))
const container = ref<HTMLElement | null>(null)
const scale = ref(0)
const worlds = ref([
  {
    id: 'preview-north',
    name: '北境编年史',
    summary: '群山、城邦与漫长的冬季',
    status: 'active' as const,
    schemaVersion: 1
  },
  {
    id: 'preview-stars',
    name: '星海纪事',
    summary: '远航者的记录',
    status: 'draft' as const,
    schemaVersion: 1
  },
  {
    id: 'preview-city',
    name: '云上之城',
    summary: '一座漂浮城市的故事',
    status: 'active' as const,
    schemaVersion: 1
  }
])
const noop = async (): Promise<void> => {}
// Previews have their own data and cannot invoke real world mutations or navigation.
const home: HomePage = {
  worlds,
  sortedWorlds: computed(() => worlds.value),
  loading: ref(false),
  error: ref(''),
  reload: noop,
  openWorld: noop,
  openAssistant: noop,
  deleteWorld: noop,
  createWorld: async () => worlds.value[0],
  updateWorld: async () => worlds.value[0]
}
provide(homePageKey, home)
let observer: ResizeObserver | undefined
onMounted(() => {
  observer = new ResizeObserver(([entry]) => {
    scale.value = entry.contentRect.width / 900
  })
  if (container.value) observer.observe(container.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
.preview-viewport {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 2;
  overflow: hidden;
  pointer-events: none;
  background: #f5f6f8;
}
.preview-stage {
  width: 900px;
  height: 600px;
  transform-origin: top left;
}
</style>
