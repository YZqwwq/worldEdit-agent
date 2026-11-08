import { computed, ref } from 'vue'

export interface HomeResource {
  id: string
  name: string
  version: string
  apiVersion: 1
  html: string
}

const storageKey = 'worldedit.home-resources.v1'
export function parseHomeResource(value: unknown): HomeResource {
  if (!value || typeof value !== 'object') throw new Error('样式文件必须是 JSON 对象')
  const item = value as Record<string, unknown>
  if (
    typeof item.id !== 'string' ||
    !/^[a-z][a-z0-9-]{2,63}$/.test(item.id) ||
    ['default', 'canvas', 'index'].includes(item.id)
  )
    throw new Error('样式 ID 无效或使用了保留名称')
  if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 60)
    throw new Error('样式名称不能为空，且不能超过 60 字')
  if (typeof item.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(item.version))
    throw new Error('版本号应为 1.0.0 格式')
  if (item.apiVersion !== 1) throw new Error('不支持此样式接口版本')
  if (typeof item.html !== 'string' || !item.html.trim() || item.html.length > 1_000_000)
    throw new Error('样式 HTML 为空或超过大小限制')
  return {
    id: item.id,
    name: item.name.trim(),
    version: item.version,
    apiVersion: 1,
    html: item.html
  }
}

function readState(): { selected: string; canvasInstalled: boolean; resources: HomeResource[] } {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) || 'null')
    if (raw && Array.isArray(raw.resources)) {
      const resources: HomeResource[] = []
      for (const item of raw.resources) {
        try {
          const resource = parseHomeResource(item)
          if (!resources.some((entry) => entry.id === resource.id)) resources.push(resource)
        } catch {
          /* Keep other valid resources when one is damaged. */
        }
      }
      const canvasInstalled = raw.canvasInstalled === true
      const selected =
        raw.selected === 'default' ||
        (raw.selected === 'canvas' && canvasInstalled) ||
        resources.some((item) => item.id === raw.selected)
          ? raw.selected
          : 'default'
      return { selected, canvasInstalled, resources }
    }
  } catch {
    /* Fall back to the built-in homepage. */
  }
  return { selected: 'default', canvasInstalled: true, resources: [] }
}

const state = ref(readState())
function commit(next: typeof state.value): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(next))
  } catch {
    throw new Error('无法保存首页样式，请检查本地存储空间后重试。')
  }
  state.value = next
}

export function useHomeStyle() {
  const homeStyles = computed(() => [
    { id: 'default', name: '默认', version: '1.0.0', removable: false },
    ...(state.value.canvasInstalled
      ? [{ id: 'canvas', name: '动态世界', version: '1.0.0', removable: true }]
      : []),
    ...state.value.resources.map((item) => ({
      id: item.id,
      name: item.name,
      version: item.version,
      removable: true
    }))
  ])
  return {
    homeStyles,
    getResource: (id: string) => state.value.resources.find((item) => item.id === id),
    homeStyle: computed(() => state.value.selected),
    activeResource: computed(() =>
      state.value.resources.find((item) => item.id === state.value.selected)
    ),
    canvasInstalled: computed(() => state.value.canvasInstalled),
    setHomeStyle(id: string) {
      if (!homeStyles.value.some((item) => item.id === id)) throw new Error('样式未安装')
      commit({ ...state.value, selected: id })
    },
    installResource(value: unknown) {
      const resource = parseHomeResource(value)
      if (state.value.resources.some((item) => item.id === resource.id))
        throw new Error('该样式已安装，请先移除旧版本')
      commit({
        ...state.value,
        resources: [...state.value.resources, resource],
        selected: resource.id
      })
    },
    installCanvas() {
      commit({ ...state.value, canvasInstalled: true, selected: 'canvas' })
    },
    removeResource(id: string) {
      if (id === 'default') throw new Error('默认首页不能移除')
      commit({
        selected: state.value.selected === id ? 'default' : state.value.selected,
        canvasInstalled: id === 'canvas' ? false : state.value.canvasInstalled,
        resources: state.value.resources.filter((item) => item.id !== id)
      })
    }
  }
}
