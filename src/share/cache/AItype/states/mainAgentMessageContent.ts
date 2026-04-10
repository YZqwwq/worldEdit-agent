export type MainAgentMessageFileMediaType = 'image' | 'audio' | 'video' | 'document' | 'file'

export interface MainAgentUserInputFile {
  fileId: string
  fileUrl: string
  fileName: string
  sizeBytes?: number
  mimeType?: string
  mediaType?: MainAgentMessageFileMediaType
}

export interface MainAgentUserMessageInput {
  requestId?: string
  text?: string
  files?: MainAgentUserInputFile[]
}

export interface MainAgentTextContentPart {
  type: 'text'
  text: string
}

export interface MainAgentFileContentPart {
  type: 'file'
  fileId: string
  fileUrl: string
  fileName: string
  sizeBytes?: number
  mimeType?: string
  mediaType: MainAgentMessageFileMediaType
}

export type MainAgentMessageContentPart =
  | MainAgentTextContentPart
  | MainAgentFileContentPart

const IMAGE_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.svg',
  '.heic',
  '.heif'
])

export const SUPPORTED_CHAT_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
  'image/heic',
  'image/heif'
] as const

export const MAX_CHAT_IMAGE_UPLOAD_BYTES = 2 * 1024 * 1024

const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.flac',
  '.ogg'
])

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.m4v'
])

const DOCUMENT_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.txt',
  '.md',
  '.csv',
  '.json'
])

const getExtension = (fileName: string): string => {
  const dotIndex = fileName.lastIndexOf('.')
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : ''
}

export const inferMimeTypeFromFileName = (fileName: string): string | undefined => {
  const ext = getExtension(fileName)
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.bmp') return 'image/bmp'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.heic') return 'image/heic'
  if (ext === '.heif') return 'image/heif'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.txt') return 'text/plain'
  if (ext === '.md') return 'text/markdown'
  if (ext === '.csv') return 'text/csv'
  if (ext === '.json') return 'application/json'
  return undefined
}

const deriveFileNameFromUrl = (fileUrl: string): string => {
  try {
    const pathname = new URL(fileUrl).pathname
    const segments = pathname.split('/').filter(Boolean)
    const last = segments[segments.length - 1]
    return last ? decodeURIComponent(last) : 'file'
  } catch {
    return 'file'
  }
}

export const inferMainAgentFileMediaType = (input: {
  fileName?: string
  mimeType?: string
}): MainAgentMessageFileMediaType => {
  const mimeType = String(input.mimeType || '').trim().toLowerCase()
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  if (mimeType.startsWith('video/')) return 'video'
  if (
    mimeType === 'application/pdf' ||
    mimeType.startsWith('text/') ||
    mimeType.includes('word') ||
    mimeType.includes('excel') ||
    mimeType.includes('spreadsheet') ||
    mimeType.includes('presentation') ||
    mimeType.includes('json')
  ) {
    return 'document'
  }

  const ext = getExtension(String(input.fileName || ''))
  if (IMAGE_EXTENSIONS.has(ext)) return 'image'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (DOCUMENT_EXTENSIONS.has(ext)) return 'document'
  return 'file'
}

const normalizeText = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : ''
}

const normalizeSizeBytes = (value: unknown): number | undefined => {
  const size = Number(value)
  if (!Number.isFinite(size) || size < 0) {
    return undefined
  }
  return Math.round(size)
}

export const isSupportedChatImageUpload = (input: {
  fileName?: string
  mimeType?: string
  sizeBytes?: number
}): { ok: true } | { ok: false; reason: string } => {
  const mediaType = inferMainAgentFileMediaType(input)
  if (mediaType !== 'image') {
    return {
      ok: false,
      reason: '当前聊天仅支持上传图片文件。'
    }
  }

  const mimeType =
    String(input.mimeType || '').trim().toLowerCase() ||
    inferMimeTypeFromFileName(String(input.fileName || '')) ||
    ''
  if (!SUPPORTED_CHAT_IMAGE_MIME_TYPES.includes(mimeType as (typeof SUPPORTED_CHAT_IMAGE_MIME_TYPES)[number])) {
    return {
      ok: false,
      reason: '当前仅支持 PNG、JPEG、WebP、GIF、BMP、SVG、HEIC、HEIF 图片。'
    }
  }

  const sizeBytes = normalizeSizeBytes(input.sizeBytes)
  if (typeof sizeBytes === 'number' && sizeBytes > MAX_CHAT_IMAGE_UPLOAD_BYTES) {
    return {
      ok: false,
      reason: '图片大小不能超过 2MB。'
    }
  }

  return { ok: true }
}

export const normalizeMainAgentUserInput = (
  input: unknown
): MainAgentUserMessageInput => {
  if (typeof input === 'string') {
    return { text: input }
  }

  if (!input || typeof input !== 'object') {
    return {}
  }

  const raw = input as {
    requestId?: unknown
    text?: unknown
    files?: unknown
  }

  const requestId = normalizeText(raw.requestId) || undefined
  const text = typeof raw.text === 'string' ? raw.text : undefined
  const files = Array.isArray(raw.files)
    ? raw.files.flatMap((item) => {
        if (!item || typeof item !== 'object') {
          return []
        }
        const rawFile = item as {
          fileId?: unknown
          fileUrl?: unknown
          fileName?: unknown
          sizeBytes?: unknown
          mimeType?: unknown
          mediaType?: unknown
        }
        const fileId = normalizeText(rawFile.fileId)
        const fileUrl = normalizeText(rawFile.fileUrl)
        const fileName =
          normalizeText(rawFile.fileName) || deriveFileNameFromUrl(fileUrl)

        if (!fileId || !fileUrl || !fileName) {
          return []
        }

        const inferredMediaType = inferMainAgentFileMediaType({
          fileName,
          mimeType: typeof rawFile.mimeType === 'string' ? rawFile.mimeType : undefined
        })

        return [
          {
            fileId,
            fileUrl,
            fileName,
            sizeBytes: normalizeSizeBytes(rawFile.sizeBytes),
            mimeType: typeof rawFile.mimeType === 'string' ? rawFile.mimeType : undefined,
            mediaType:
              rawFile.mediaType === 'image' ||
              rawFile.mediaType === 'audio' ||
              rawFile.mediaType === 'video' ||
              rawFile.mediaType === 'document' ||
              rawFile.mediaType === 'file'
                ? rawFile.mediaType
                : inferredMediaType
          } satisfies MainAgentUserInputFile
        ]
      })
    : undefined

  return {
    requestId,
    text,
    files
  }
}

export const buildMainAgentMessageContent = (
  input: MainAgentUserMessageInput
): MainAgentMessageContentPart[] => {
  const parts: MainAgentMessageContentPart[] = []
  const text = typeof input.text === 'string' ? input.text.trim() : ''
  if (text) {
    parts.push({
      type: 'text',
      text
    })
  }

  for (const file of input.files ?? []) {
    const fileId = normalizeText(file.fileId)
    const fileUrl = normalizeText(file.fileUrl)
    const fileName = normalizeText(file.fileName) || deriveFileNameFromUrl(fileUrl)
    if (!fileId || !fileUrl || !fileName) {
      continue
    }

    parts.push({
      type: 'file',
      fileId,
      fileUrl,
      fileName,
      sizeBytes: normalizeSizeBytes(file.sizeBytes),
      mimeType: typeof file.mimeType === 'string' ? file.mimeType.trim() || undefined : undefined,
      mediaType: inferMainAgentFileMediaType({
        fileName,
        mimeType: file.mimeType
      })
    })
  }

  return parts
}

export const normalizeMainAgentMessageContent = (
  input: unknown
): MainAgentMessageContentPart[] => {
  if (typeof input === 'string') {
    const text = input.trim()
    return text ? [{ type: 'text', text }] : []
  }

  if (!Array.isArray(input)) {
    return []
  }

  return input.flatMap<MainAgentMessageContentPart>((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }

    const raw = item as Record<string, unknown>
    if (raw.type === 'text') {
      const text = normalizeText(raw.text)
      return text ? [{ type: 'text', text } satisfies MainAgentTextContentPart] : []
    }

    if (raw.type === 'file') {
      const fileId = normalizeText(raw.fileId)
      const fileUrl = normalizeText(raw.fileUrl)
      const fileName = normalizeText(raw.fileName) || deriveFileNameFromUrl(fileUrl)
      if (!fileId || !fileUrl || !fileName) {
        return []
      }

      const mediaType = inferMainAgentFileMediaType({
        fileName,
        mimeType: typeof raw.mimeType === 'string' ? raw.mimeType : undefined
      })

      return [
        {
          type: 'file',
          fileId,
          fileUrl,
          fileName,
          sizeBytes: normalizeSizeBytes(raw.sizeBytes),
          mimeType: typeof raw.mimeType === 'string' ? raw.mimeType.trim() || undefined : undefined,
          mediaType:
            raw.mediaType === 'image' ||
            raw.mediaType === 'audio' ||
            raw.mediaType === 'video' ||
            raw.mediaType === 'document' ||
            raw.mediaType === 'file'
              ? raw.mediaType
              : mediaType
        } satisfies MainAgentFileContentPart
      ]
    }

    return []
  })
}

export const hasMainAgentFileContent = (
  content: MainAgentMessageContentPart[]
): boolean => content.some((part) => part.type === 'file')

export const serializeMainAgentMessageContent = (
  content: MainAgentMessageContentPart[]
): string => JSON.stringify(normalizeMainAgentMessageContent(content))

export const parseMainAgentMessageContentJson = (
  raw: string | null | undefined
): MainAgentMessageContentPart[] => {
  if (!raw) {
    return []
  }

  try {
    return normalizeMainAgentMessageContent(JSON.parse(raw))
  } catch {
    return []
  }
}

export const buildMainAgentUserInputFromContent = (
  content: MainAgentMessageContentPart[]
): MainAgentUserMessageInput => {
  const normalized = normalizeMainAgentMessageContent(content)
  const text = normalized
    .filter((part): part is MainAgentTextContentPart => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n')

  const files = normalized
    .filter((part): part is MainAgentFileContentPart => part.type === 'file')
    .map((part) => ({
      fileId: part.fileId,
      fileUrl: part.fileUrl,
      fileName: part.fileName,
      sizeBytes: part.sizeBytes,
      mimeType: part.mimeType,
      mediaType: part.mediaType
    }))

  return {
    text: text || undefined,
    files: files.length > 0 ? files : undefined
  }
}
