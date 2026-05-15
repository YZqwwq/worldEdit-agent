import { reactive, readonly, onBeforeUnmount, watch, type MaybeRefOrGetter } from 'vue'
import { toValue } from 'vue'

export type AppTitleBarPayload = {
  title?: string
  subtitle?: string
  meta?: string
  trailing?: string
}

type AppTitleBarState = Required<AppTitleBarPayload>

const defaultTitleBarState: AppTitleBarState = {
  title: 'worldedit-agent',
  subtitle: '',
  meta: '',
  trailing: ''
}

const titleBarState = reactive<AppTitleBarState>({ ...defaultTitleBarState })

const normalizePayload = (payload: AppTitleBarPayload): AppTitleBarState => ({
  title: String(payload.title || defaultTitleBarState.title),
  subtitle: String(payload.subtitle || ''),
  meta: String(payload.meta || ''),
  trailing: String(payload.trailing || '')
})

export const setAppTitleBar = (payload: AppTitleBarPayload): void => {
  Object.assign(titleBarState, normalizePayload(payload))
}

export const resetAppTitleBar = (): void => {
  Object.assign(titleBarState, defaultTitleBarState)
}

export const useAppTitleBarState = () => readonly(titleBarState)

export const useAppTitleBar = (payload: MaybeRefOrGetter<AppTitleBarPayload>): void => {
  const stop = watch(
    () => toValue(payload),
    (value) => {
      setAppTitleBar(value)
    },
    { immediate: true, deep: true }
  )

  onBeforeUnmount(() => {
    stop()
    resetAppTitleBar()
  })
}
