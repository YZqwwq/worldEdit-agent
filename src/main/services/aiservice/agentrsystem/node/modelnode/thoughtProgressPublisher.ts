export type ThoughtProgressUpdate = {
  thoughtId: string
  text: string
  sequence: number
  followsToolResult: boolean
}

type ThoughtProgressPublisherOptions = {
  thoughtId: string
  sequence: number
  followsToolResult: boolean
  emit: (update: ThoughtProgressUpdate) => void
  now?: () => number
  minimumInitialChars?: number
  minimumGrowthChars?: number
  minimumIntervalMs?: number
}

export type ThoughtProgressPublisher = {
  publish: (text: string, options?: { force?: boolean }) => boolean
}

export const createThoughtProgressPublisher = (
  options: ThoughtProgressPublisherOptions
): ThoughtProgressPublisher => {
  const now = options.now ?? Date.now
  const minimumInitialChars = options.minimumInitialChars ?? 12
  const minimumGrowthChars = options.minimumGrowthChars ?? 16
  const minimumIntervalMs = options.minimumIntervalMs ?? 80
  let lastPublishedText = ''
  let lastPublishedAt = 0

  return {
    publish(text, publishOptions) {
      const nextText = text.trim()
      if (!nextText || nextText === lastPublishedText) return false

      const currentTime = now()
      const growth = nextText.length - lastPublishedText.length
      const reachesNaturalPause = /[。！？；：\n]$/.test(nextText)
      const force = publishOptions?.force === true
      if (!force && nextText.length < minimumInitialChars && !reachesNaturalPause) return false
      if (
        !force &&
        lastPublishedText &&
        growth < minimumGrowthChars &&
        currentTime - lastPublishedAt < minimumIntervalMs &&
        !reachesNaturalPause
      )
        return false

      options.emit({
        thoughtId: options.thoughtId,
        text: nextText,
        sequence: options.sequence,
        followsToolResult: options.followsToolResult
      })
      lastPublishedText = nextText
      lastPublishedAt = currentTime
      return true
    }
  }
}
