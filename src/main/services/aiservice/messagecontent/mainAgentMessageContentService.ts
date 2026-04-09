import { readFile } from 'node:fs/promises'
import { basename, extname } from 'node:path'
import type { BaseMessage } from '@langchain/core/messages'
import { resolveAppResourcePath } from '../../../protocols/resourceProtocol'
import {
  hasMainAgentFileContent,
  inferMainAgentFileMediaType,
  normalizeMainAgentMessageContent,
  parseMainAgentMessageContentJson,
  type MainAgentFileContentPart,
  type MainAgentMessageContentPart
} from '@share/cache/AItype/states/mainAgentMessageContent'
import type { Message as PersistedMessage } from '@share/entity/database/Message'

export const MAIN_AGENT_CONTENT_PARTS_KEY = '__main_agent_content_parts'

type MessageAdditionalKwargs = Record<string, unknown> & {
  [MAIN_AGENT_CONTENT_PARTS_KEY]?: unknown
}

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.heic': 'image/heic',
  '.heif': 'image/heif'
}

const humanizeFileStem = (fileName: string): string => {
  return basename(fileName, extname(fileName))
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const resolvePersistedFilePath = (file: MainAgentFileContentPart): string => {
  try {
    return resolveAppResourcePath(file.fileUrl, 'uploads')
  } catch {
    return file.fileUrl
  }
}

export const formatFileLine = (
  file: MainAgentFileContentPart,
  description?: string
): string => {
  const filePath = resolvePersistedFilePath(file)
  const normalizedDescription = String(description || humanizeFileStem(file.fileName)).trim()
  return normalizedDescription
    ? `${file.mediaType}: ${filePath} - ${normalizedDescription}`
    : `${file.mediaType}: ${filePath}`
}

export const attachMainAgentContentPartsMetadata = (
  additionalKwargs: Record<string, unknown> | undefined,
  content: MainAgentMessageContentPart[]
): MessageAdditionalKwargs => {
  return {
    ...(additionalKwargs ?? {}),
    [MAIN_AGENT_CONTENT_PARTS_KEY]: normalizeMainAgentMessageContent(content)
  }
}

export const getMainAgentContentPartsFromMessage = (
  message: BaseMessage
): MainAgentMessageContentPart[] => {
  const additionalKwargs = (message.additional_kwargs ?? {}) as MessageAdditionalKwargs
  const fromAdditionalKwargs = normalizeMainAgentMessageContent(
    additionalKwargs[MAIN_AGENT_CONTENT_PARTS_KEY]
  )
  if (fromAdditionalKwargs.length > 0) {
    return fromAdditionalKwargs
  }
  return normalizeMainAgentMessageContent(message.content)
}

export const getMainAgentContentPartsFromPersistedMessage = (
  message: Pick<PersistedMessage, 'contentJson' | 'content'> | null | undefined
): MainAgentMessageContentPart[] => {
  if (!message) {
    return []
  }

  const fromJson = parseMainAgentMessageContentJson(message.contentJson)
  if (fromJson.length > 0) {
    return fromJson
  }

  return normalizeMainAgentMessageContent(message.content)
}

export const stripMainAgentContentPartsMetadata = (
  additionalKwargs: Record<string, unknown> | undefined
): Record<string, unknown> => {
  if (!additionalKwargs) {
    return {}
  }
  const next = { ...additionalKwargs } as MessageAdditionalKwargs
  delete next[MAIN_AGENT_CONTENT_PARTS_KEY]
  return next
}

export const parseMainAgentContentForPersistence = (
  content: MainAgentMessageContentPart[]
): string => {
  const normalized = normalizeMainAgentMessageContent(content)
  const textBlocks = normalized
    .filter((part): part is Extract<MainAgentMessageContentPart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean)
  const fileLines = normalized
    .filter((part): part is MainAgentFileContentPart => part.type === 'file')
    .map((part) => formatFileLine(part))

  return [...textBlocks, ...fileLines].filter(Boolean).join('\n')
}

export const getMainAgentPersistenceTextFromPersistedMessage = (
  message: Pick<PersistedMessage, 'contentJson' | 'content'> | null | undefined
): string => {
  const content = getMainAgentContentPartsFromPersistedMessage(message)
  if (content.length > 0) {
    return parseMainAgentContentForPersistence(content).trim()
  }

  return typeof message?.content === 'string' ? message.content.trim() : ''
}

const toDataUrl = async (file: MainAgentFileContentPart): Promise<string> => {
  const filePath = resolvePersistedFilePath(file)
  const buffer = await readFile(filePath)
  const mimeType =
    file.mimeType ||
    MIME_TYPE_BY_EXTENSION[extname(file.fileName).toLowerCase()] ||
    'application/octet-stream'

  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

export const isQwenVisionModel = (model: string): boolean => {
  const normalized = model.trim().toLowerCase()
  return normalized.includes('vl') || normalized.includes('omni') || normalized.includes('qvq')
}

export const buildQwenInputContent = async (
  content: MainAgentMessageContentPart[]
): Promise<Array<Record<string, unknown>>> => {
  const normalized = normalizeMainAgentMessageContent(content)
  const parts: Array<Record<string, unknown>> = []

  for (const part of normalized) {
    if (part.type === 'text') {
      if (part.text.trim()) {
        parts.push({
          type: 'text',
          text: part.text
        })
      }
      continue
    }

    const mediaType = part.mediaType || inferMainAgentFileMediaType(part)
    if (mediaType === 'image') {
      try {
        const dataUrl = await toDataUrl(part)
        parts.push({
          type: 'image_url',
          image_url: {
            url: dataUrl
          }
        })
        continue
      } catch {
        // fall through to text fallback
      }
    }

    parts.push({
      type: 'text',
      text: formatFileLine(part)
    })
  }

  if (parts.length === 0) {
    return [
      {
        type: 'text',
        text: ''
      }
    ]
  }

  return parts
}

export const messageHasMainAgentFiles = (message: BaseMessage): boolean => {
  return hasMainAgentFileContent(getMainAgentContentPartsFromMessage(message))
}
