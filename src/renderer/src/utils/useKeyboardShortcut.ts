import { onBeforeUnmount, onMounted, toValue } from 'vue'

type MaybeGetter<T> = T | (() => T)

type KeyboardShortcutOptions = {
  key: string
  ctrlOrMeta?: boolean
  shift?: boolean
  alt?: boolean
  preventDefault?: boolean
  enabled?: MaybeGetter<boolean>
}

const matchesModifier = (
  expected: boolean | undefined,
  actual: boolean
): boolean => (expected === undefined ? true : expected === actual)

export const useKeyboardShortcut = (
  options: KeyboardShortcutOptions,
  handler: (event: KeyboardEvent) => void | Promise<void>
): void => {
  const listener = (event: KeyboardEvent): void => {
    if (toValue(options.enabled) === false) return

    const normalizedKey = event.key.toLowerCase()
    if (normalizedKey !== options.key.toLowerCase()) return

    const ctrlOrMetaPressed = event.ctrlKey || event.metaKey
    if (!matchesModifier(options.ctrlOrMeta, ctrlOrMetaPressed)) return
    if (!matchesModifier(options.shift, event.shiftKey)) return
    if (!matchesModifier(options.alt, event.altKey)) return

    if (options.preventDefault !== false) {
      event.preventDefault()
    }

    void handler(event)
  }

  onMounted(() => {
    window.addEventListener('keydown', listener)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', listener)
  })
}
