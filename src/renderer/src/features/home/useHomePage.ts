import { computed, inject, readonly, ref, type InjectionKey } from 'vue'
import { useRouter } from 'vue-router'
import type {
  CreateWorldInput,
  UpdateWorldInput,
  WorldPayload
} from '@share/cache/worldbuilding/worldbuilding'
import { worldbuildingClientService } from '../../services/worldbuildingClientService'

export function createHomePage() {
  const router = useRouter()
  const worlds = ref<WorldPayload[]>([])
  const loading = ref(false)
  const error = ref('')
  let pending: Promise<void> | null = null
  const reload = (): Promise<void> => {
    if (pending) return pending
    loading.value = true
    error.value = ''
    pending = worldbuildingClientService
      .listWorlds()
      .then((items) => {
        worlds.value = items
      })
      .catch((reason) => {
        error.value = reason instanceof Error ? reason.message : String(reason)
      })
      .finally(() => {
        loading.value = false
        pending = null
      })
    return pending
  }
  const sortedWorlds = computed(() =>
    worlds.value.slice().sort((a, b) => {
      const time = (world: WorldPayload): number =>
        Date.parse(world.updatedAt || world.createdAt || '') || 0
      return time(b) - time(a)
    })
  )
  return {
    worlds: readonly(worlds),
    sortedWorlds,
    loading: readonly(loading),
    error: readonly(error),
    reload,
    async createWorld(input: CreateWorldInput) {
      const world = await worldbuildingClientService.createWorld(input)
      worlds.value = [...worlds.value, world]
      return world
    },
    async updateWorld(input: UpdateWorldInput) {
      const world = await worldbuildingClientService.updateWorld(input)
      worlds.value = worlds.value.map((item) => (item.id === world.id ? world : item))
      return world
    },
    async deleteWorld(id: string) {
      await worldbuildingClientService.deleteWorld(id)
      worlds.value = worlds.value.filter((item) => item.id !== id)
    },
    async openWorld(worldId: string) {
      await router.push({ name: 'WorldEditor', params: { worldId } })
    },
    async openAssistant() {
      await router.push({ name: 'AIChat' })
    }
  }
}

export type HomePage = ReturnType<typeof createHomePage>
export const homePageKey: InjectionKey<HomePage> = Symbol('homePage')
export function useHomePage(): HomePage {
  const page = inject(homePageKey)
  if (!page) throw new Error('首页必须在首页宿主内运行')
  return page
}
