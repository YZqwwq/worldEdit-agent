<template>
  <iframe
    ref="frame"
    :key="resource.id"
    class="resource-home"
    :title="resource.name"
    sandbox="allow-scripts"
    src="./home-resource-host.html"
    @load="publish"
  />
</template>
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { HomeResource } from '../../composables/useHomeStyle'
import { useHomePage } from './useHomePage'
const props = defineProps<{ resource: HomeResource }>()
const emit = defineEmits<{ action: [action: string, worldId?: string] }>()
const home = useHomePage()
const frame = ref<HTMLIFrameElement | null>(null)
function publish(): void {
  frame.value?.contentWindow?.postMessage(
    {
      type: 'worldedit:home-state',
      apiVersion: 1,
      worlds: JSON.parse(JSON.stringify(home.sortedWorlds.value)),
      loading: home.loading.value,
      error: home.error.value
    },
    '*'
  )
}
function receive(event: MessageEvent): void {
  if (event.source !== frame.value?.contentWindow || event.origin !== 'null') return
  const data = event.data
  if (!data || typeof data !== 'object') return
  if (data.type === 'worldedit:host-ready') {
    frame.value?.contentWindow?.postMessage({ type: 'worldedit:host-init', html: props.resource.html }, '*')
    return
  }
  if (data.type === 'worldedit:home-ready') {
    publish()
    return
  }
  if (data.type !== 'worldedit:home-action' || typeof data.action !== 'string') return
  if (!['create', 'open', 'edit', 'delete', 'assistant', 'reload'].includes(data.action)) return
  if (
    ['open', 'edit', 'delete'].includes(data.action) &&
    (typeof data.worldId !== 'string' ||
      !home.worlds.value.some((world) => world.id === data.worldId))
  )
    return
  emit('action', data.action, data.worldId)
}
watch([home.worlds, home.loading, home.error], publish, { deep: true })
onMounted(() => window.addEventListener('message', receive))
onBeforeUnmount(() => window.removeEventListener('message', receive))
</script>
<style scoped>
.resource-home {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #181818;
}
</style>
