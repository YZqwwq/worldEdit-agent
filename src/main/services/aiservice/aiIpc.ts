import { dialog, ipcMain, nativeImage } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, stat, unlink, readdir, writeFile } from 'node:fs/promises'
import { basename, extname, join, normalize, sep } from 'node:path'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import {
  inferMimeTypeFromFileName,
  isSupportedChatImageUpload,
  type MainAgentUserMessageInput
} from '@share/cache/AItype/states/mainAgentMessageContent'
import { aiService } from './aiService'
import type { StreamChunk } from '../../../share/cache/render/aiagent/aiContent'
import { getStaticUploadDir } from '../../config/pathConfig'
import { buildAppResourceUrl, resolveAppResourcePath } from '../../protocols/resourceProtocol'
import { modelConfigService } from '../modelconfig/modelConfigService'
import type {
  ModelConfigInput,
  ModelSpeedTestResult,
  ModelSpeedTestTarget
} from '@share/cache/AItype/model/modelConfigPayload'
import type { MemoryInspectionPayload } from '@share/cache/AItype/states/memoryInspection'
import type { TaskMonitorSnapshot } from '@share/cache/AItype/states/taskLifecycleState'
import { memoryManager } from './agentrsystem/manager/memory/MemoryManager'
import { memorySlotService } from './agentrsystem/manager/memory/memorySlotService'
import { loadPersonaState } from './agentrsystem/manager/personal/personalManager'
import { avatarProfileService } from '../avatar/avatarProfileService'
import type {
  ChatAvatarProfilesPayload,
  PersistedChatAvatarProfile,
  SaveChatAvatarInput
} from '../../../share/cache/render/aiagent/chatAvatarProfile'
import { worldbuildingService } from '../worldbuilding/worldbuildingService'
import { characterNarrativeDocumentService } from '../worldbuilding/characterNarrativeDocumentService'
import type {
  CreateWorldEntityInput,
  CreateWorldEntityRelationInput,
  CreateWorldInput,
  UpdateWorldEntityInput,
  UpdateWorldInput,
  UpsertWorldEntityComponentInput,
  WorldEntityPayload,
  WorldbuildingSchemaCatalogPayload
} from '@share/cache/worldbuilding/worldbuilding'
import type {
  CreateCharacterNarrativeDocumentInput,
  DeleteCharacterNarrativeDocumentInput,
  MoveCharacterNarrativeDocumentInput,
  UpdateCharacterNarrativeDocumentInput
} from '@share/cache/worldbuilding/characterNarrativeDocument'
import { taskService } from '../task/taskService'
import { createConfiguredModelRuntime } from './model-adapters/modelProviderAdapter'
import { contentToText } from './messageoutput/transformRespones'

type UploadResult = {
  resourceUrl: string
  fileName: string
  size: number
  mimeType?: string
}

type ImageAssetResult = UploadResult & {
  width?: number
  height?: number
}

type PickResult = {
  sourcePath: string
  fileName: string
  size: number
  mimeType?: string
}

type PickImageAssetResult = PickResult & {
  width?: number
  height?: number
}

type UploadDataInput = {
  fileName: string
  mimeType?: string
  data: ArrayBuffer
  relativeDir?: string
}

type ReadBinaryResult = {
  fileName: string
  size: number
  mimeType?: string
  data: ArrayBuffer
}

const clearUploadFiles = async (): Promise<number> => {
  const dir = getStaticUploadDir()
  const files = await readdir(dir, { withFileTypes: true })
  let removed = 0
  for (const entry of files) {
    if (entry.isFile()) {
      const full = join(dir, entry.name)
      await unlink(full).catch(() => {})
      removed++
    }
  }
  return removed
}

const readImageDimensions = (sourcePath: string): { width?: number; height?: number } => {
  try {
    const image = nativeImage.createFromPath(sourcePath)
    if (image.isEmpty()) return {}
    const size = image.getSize()
    if (!size.width || !size.height) return {}
    return {
      width: size.width,
      height: size.height
    }
  } catch {
    return {}
  }
}

const ensureSupportedImageAsset = (fileName: string, mimeType?: string): void => {
  const normalizedMime = String(mimeType || '').trim().toLowerCase()
  const normalizedExt = extname(fileName).trim().toLowerCase()
  const allowedExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg', '.heic', '.heif'])
  const allowedMimes = new Set([
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/bmp',
    'image/svg+xml',
    'image/heic',
    'image/heif'
  ])
  if (!allowedExts.has(normalizedExt) && !allowedMimes.has(normalizedMime)) {
    throw new Error('当前仅支持导入常见图片格式。')
  }
}

const copyToUploadDir = async (sourcePath: string): Promise<UploadResult> => {
  const fileStat = await stat(sourcePath)
  const fileName = basename(sourcePath)
  const mimeType = inferMimeTypeFromFileName(fileName)
  const validation = isSupportedChatImageUpload({
    fileName,
    mimeType,
    sizeBytes: fileStat.size
  })
  if (!validation.ok) {
    throw new Error(validation.reason)
  }
  const uploadDir = getStaticUploadDir()
  const ext = extname(sourcePath)
  const destName = `${randomUUID()}${ext}`
  const destPath = join(uploadDir, destName)
  await copyFile(sourcePath, destPath)
  return {
    resourceUrl: buildAppResourceUrl('uploads', destPath),
    fileName,
    size: fileStat.size,
    mimeType
  }
}

const copyImageAssetToUploadDir = async (sourcePath: string): Promise<ImageAssetResult> => {
  const fileStat = await stat(sourcePath)
  const fileName = basename(sourcePath)
  const mimeType = inferMimeTypeFromFileName(fileName)
  ensureSupportedImageAsset(fileName, mimeType)
  const uploadDir = getStaticUploadDir()
  const ext = extname(sourcePath)
  const destName = `${randomUUID()}${ext}`
  const destPath = join(uploadDir, destName)
  await copyFile(sourcePath, destPath)
  return {
    resourceUrl: buildAppResourceUrl('uploads', destPath),
    fileName,
    size: fileStat.size,
    mimeType,
    ...readImageDimensions(destPath)
  }
}

const inferExtensionFromMimeType = (mimeType?: string): string => {
  const normalized = String(mimeType || '').trim().toLowerCase()
  if (normalized === 'image/png') return '.png'
  if (normalized === 'image/jpeg') return '.jpg'
  if (normalized === 'image/webp') return '.webp'
  if (normalized === 'image/gif') return '.gif'
  if (normalized === 'image/bmp') return '.bmp'
  if (normalized === 'image/svg+xml') return '.svg'
  if (normalized === 'image/heic') return '.heic'
  if (normalized === 'image/heif') return '.heif'
  return ''
}

const sanitizeRelativeDir = (value: string | undefined): string => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return normalize(raw)
    .split(/[\\/]+/u)
    .filter(Boolean)
    .map((segment) => segment.replace(/[^a-zA-Z0-9._-]/g, '_'))
    .filter((segment) => segment !== '.' && segment !== '..')
    .join(sep)
}

const writeUploadDataToDir = async (input: UploadDataInput): Promise<UploadResult> => {
  const fileName = String(input.fileName || '').trim() || `pasted-image${inferExtensionFromMimeType(input.mimeType)}`
  const mimeType = String(input.mimeType || '').trim() || inferMimeTypeFromFileName(fileName)
  const byteLength = input.data?.byteLength ?? 0
  const validation = isSupportedChatImageUpload({
    fileName,
    mimeType,
    sizeBytes: byteLength
  })
  if (!validation.ok) {
    throw new Error(validation.reason)
  }

  const uploadDir = getStaticUploadDir()
  const ext = extname(fileName) || inferExtensionFromMimeType(mimeType)
  const destName = `${randomUUID()}${ext}`
  const destPath = join(uploadDir, destName)
  const buffer = Buffer.from(new Uint8Array(input.data))
  await writeFile(destPath, buffer)
  return {
    resourceUrl: buildAppResourceUrl('uploads', destPath),
    fileName,
    size: buffer.byteLength,
    mimeType: mimeType || undefined
  }
}

const writeResourceDataToDir = async (input: UploadDataInput): Promise<UploadResult> => {
  const fileName = String(input.fileName || '').trim() || 'resource.bin'
  const mimeType = String(input.mimeType || '').trim() || inferMimeTypeFromFileName(fileName)
  const uploadDir = getStaticUploadDir()
  const relativeDir = sanitizeRelativeDir(input.relativeDir)
  const targetDir = relativeDir ? join(uploadDir, relativeDir) : uploadDir
  await mkdir(targetDir, { recursive: true })
  const ext = extname(fileName) || inferExtensionFromMimeType(mimeType)
  const normalizedFileName = extname(fileName) ? fileName : `${fileName}${ext}`
  const destPath = join(targetDir, normalizedFileName)
  const buffer = Buffer.from(new Uint8Array(input.data))
  await writeFile(destPath, buffer)
  return {
    resourceUrl: buildAppResourceUrl('uploads', destPath),
    fileName,
    size: buffer.byteLength,
    mimeType: mimeType || undefined
  }
}

const readResourceBinary = async (resourceUrl: string): Promise<ReadBinaryResult> => {
  const targetPath = resolveAppResourcePath(resourceUrl, 'uploads')
  const buffer = await readFile(targetPath)
  const fileName = basename(targetPath)
  const mimeType = inferMimeTypeFromFileName(fileName)
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  return {
    fileName,
    size: buffer.byteLength,
    mimeType,
    data
  }
}

const runModelSpeedTest = async (
  input: ModelConfigInput,
  target: ModelSpeedTestTarget
): Promise<ModelSpeedTestResult> => {
  const runtime = createConfiguredModelRuntime(
    target === 'quick'
      ? modelConfigService.buildQuickModelOptionsFromInput(input)
      : {
          ...modelConfigService.buildModelOptionsFromInput(input),
          streaming: false
        }
  )

  const startedAt = Date.now()
  try {
    const response = await runtime.model.invoke([
      new SystemMessage('你是一个测速助手。只回复一句极短中文，不超过12个字。'),
      new HumanMessage('请回复：测速成功')
    ])
    return {
      target,
      ok: true,
      elapsedMs: Date.now() - startedAt,
      model: runtime.effectiveOptions.model || runtime.options.model,
      profile: runtime.profile,
      previewText: contentToText(response.content).trim().slice(0, 80)
    }
  } catch (error: unknown) {
    return {
      target,
      ok: false,
      elapsedMs: Date.now() - startedAt,
      model: runtime.effectiveOptions.model || runtime.options.model,
      profile: runtime.profile,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * Initializes IPC handlers for the AI service.
 */
export function initializeAIEndpoints(): void {
  // 流式传输：渲染进程发送消息后，主进程逐 chunk 推送
  ipcMain.on('ai:sendMessageStream', async (event, input: MainAgentUserMessageInput) => {
    try {
      await aiService.sendStreamMessage(input, (chunk: StreamChunk) => {
        // 直接发送对象
        event.sender.send('ai:streamChunk', chunk)
      })
      // 注意：结束信号现在由 chunk.type === 'done' 携带，不再需要单独的 ai:streamDone
    } catch (error: unknown) {
      // 这里的 catch 主要是捕获 aiService 本身未处理的异常
      const errMsg = error instanceof Error ? error.message : String(error)
      event.sender.send('ai:streamChunk', {
        type: 'stream_error',
        message: errMsg
      } as StreamChunk)
    }
  })

  // 获取历史记录
  ipcMain.handle('ai:getHistory', (_event) => {
    return aiService.getHistory()
  })

  ipcMain.handle('ai:interruptCurrentRun', () => {
    return aiService.interruptCurrentRun()
  })

  ipcMain.handle('ai:revertLastChatTurn', async () => {
    return aiService.revertLastChatTurn()
  })

  // 清除历史记录
  ipcMain.handle('ai:clearHistory', async (_event) => {
    return aiService.clearHistory()
  })

  ipcMain.handle('ai:purgeAllData', async (_event) => {
    await aiService.purgeAllData()
    avatarProfileService.clearAll()
    return clearUploadFiles()
  })

  ipcMain.handle('ai:resetAgentState', async (_event) => {
    await aiService.resetAgentState()
  })

  ipcMain.handle('ai:getMemorySnapshot', async (): Promise<MemoryInspectionPayload> => {
    await memoryManager.initialize()
    await memorySlotService.reconcileFromObservations()
    const memory = await memoryManager.getSnapshot()
    const slots = await memorySlotService.getSnapshot()
    const persona = await loadPersonaState()
    return {
      memory,
      slots,
      persona
    }
  })

  ipcMain.handle('ai:getTaskMonitorSnapshot', async (): Promise<TaskMonitorSnapshot> => {
    return taskService.getTaskMonitorSnapshot()
  })

  ipcMain.handle('config:getModelConfig', async () => {
    return modelConfigService.getModelConfig()
  })

  ipcMain.handle('config:saveModelConfig', async (_event, input: ModelConfigInput) => {
    return modelConfigService.saveModelConfig(input)
  })

  ipcMain.handle(
    'config:testModelSpeed',
    async (_event, input: ModelConfigInput, target: ModelSpeedTestTarget): Promise<ModelSpeedTestResult> => {
      return runModelSpeedTest(input, target)
    }
  )

  ipcMain.handle('world:listWorlds', async () => {
    return worldbuildingService.listWorlds()
  })

  ipcMain.handle('world:createWorld', async (_event, input: CreateWorldInput) => {
    return worldbuildingService.createWorld(input)
  })

  ipcMain.handle('world:updateWorld', async (_event, input: UpdateWorldInput) => {
    return worldbuildingService.updateWorld(input)
  })

  ipcMain.handle('world:deleteWorld', async (_event, worldId: string) => {
    return worldbuildingService.deleteWorld(worldId)
  })

  ipcMain.handle('world:listEntityDefinitions', async () => {
    return worldbuildingService.listEntityDefinitions()
  })

  ipcMain.handle(
    'world:listComponentDefinitions',
    async (_event, entityType?: WorldEntityPayload['type']) => {
      return worldbuildingService.listComponentDefinitions(entityType)
    }
  )

  ipcMain.handle('world:listRelationDefinitions', async () => {
    return worldbuildingService.listRelationDefinitions()
  })

  ipcMain.handle('world:getSchemaCatalog', async (): Promise<WorldbuildingSchemaCatalogPayload> => {
    return worldbuildingService.getSchemaCatalog()
  })

  ipcMain.handle('world:listEntities', async (_event, worldId: string, type?: WorldEntityPayload['type']) => {
    return worldbuildingService.listEntities(worldId, type)
  })

  ipcMain.handle('world:createEntity', async (_event, input: CreateWorldEntityInput) => {
    return worldbuildingService.createEntity(input)
  })

  ipcMain.handle('world:updateEntity', async (_event, input: UpdateWorldEntityInput) => {
    return worldbuildingService.updateEntity(input)
  })

  ipcMain.handle('world:deleteEntity', async (_event, entityId: string) => {
    return worldbuildingService.deleteEntity(entityId)
  })

  ipcMain.handle('world:getEntityDetail', async (_event, entityId: string) => {
    return worldbuildingService.getEntityDetail(entityId)
  })

  ipcMain.handle(
    'world:upsertComponent',
    async (_event, input: UpsertWorldEntityComponentInput) => {
      return worldbuildingService.upsertComponent(input)
    }
  )

  ipcMain.handle(
    'world:createRelation',
    async (_event, input: CreateWorldEntityRelationInput) => {
      return worldbuildingService.createRelation(input)
    }
  )

  ipcMain.handle('characterNarrative:listDocuments', async (_event, characterEntityId: string) => {
    return characterNarrativeDocumentService.listDocuments(characterEntityId)
  })

  ipcMain.handle('characterNarrative:getDocument', async (_event, documentId: string) => {
    return characterNarrativeDocumentService.getDocument(documentId)
  })

  ipcMain.handle(
    'characterNarrative:createDocument',
    async (_event, input: CreateCharacterNarrativeDocumentInput) => {
      return characterNarrativeDocumentService.createDocument(input)
    }
  )

  ipcMain.handle(
    'characterNarrative:updateDocument',
    async (_event, input: UpdateCharacterNarrativeDocumentInput) => {
      return characterNarrativeDocumentService.updateDocument(input)
    }
  )

  ipcMain.handle(
    'characterNarrative:moveDocument',
    async (_event, input: MoveCharacterNarrativeDocumentInput) => {
      return characterNarrativeDocumentService.moveDocument(input)
    }
  )

  ipcMain.handle(
    'characterNarrative:deleteDocument',
    async (_event, input: DeleteCharacterNarrativeDocumentInput) => {
      return characterNarrativeDocumentService.deleteDocument(input)
    }
  )

  ipcMain.handle('avatar:getProfiles', async (): Promise<ChatAvatarProfilesPayload> => {
    return avatarProfileService.getProfiles()
  })

  ipcMain.handle(
    'avatar:saveProfile',
    async (_event, input: SaveChatAvatarInput): Promise<PersistedChatAvatarProfile> => {
      return avatarProfileService.saveProfile(input)
    }
  )

  ipcMain.handle('file:upload', async (_event, sourcePath: string): Promise<UploadResult> => {
    if (!sourcePath || typeof sourcePath !== 'string') {
      throw new Error('Invalid file path')
    }
    return copyToUploadDir(sourcePath)
  })

  ipcMain.handle('file:uploadData', async (_event, input: UploadDataInput): Promise<UploadResult> => {
    if (!input || typeof input !== 'object' || !(input.data instanceof ArrayBuffer)) {
      throw new Error('Invalid file payload')
    }
    return writeUploadDataToDir(input)
  })

  ipcMain.handle('resource:uploadData', async (_event, input: UploadDataInput): Promise<UploadResult> => {
    if (!input || typeof input !== 'object' || !(input.data instanceof ArrayBuffer)) {
      throw new Error('Invalid resource payload')
    }
    return writeResourceDataToDir(input)
  })

  ipcMain.handle('resource:readBinary', async (_event, resourceUrl: string): Promise<ReadBinaryResult> => {
    if (!resourceUrl || typeof resourceUrl !== 'string') {
      throw new Error('Invalid resource url')
    }
    return readResourceBinary(resourceUrl)
  })

  ipcMain.handle('file:pick', async (): Promise<PickResult> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'heic', 'heif']
        }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) {
      throw new Error('No file selected')
    }
    const sourcePath = result.filePaths[0]
    const fileStat = await stat(sourcePath)
    const fileName = basename(sourcePath)
    const mimeType = inferMimeTypeFromFileName(fileName)
    const validation = isSupportedChatImageUpload({
      fileName,
      mimeType,
      sizeBytes: fileStat.size
    })
    if (!validation.ok) {
      throw new Error(validation.reason)
    }
    return {
      sourcePath,
      fileName,
      size: fileStat.size,
      mimeType
    }
  })

  ipcMain.handle('imageAsset:pick', async (): Promise<PickImageAssetResult> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'heic', 'heif']
        }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) {
      throw new Error('No file selected')
    }
    const sourcePath = result.filePaths[0]
    const fileStat = await stat(sourcePath)
    const fileName = basename(sourcePath)
    const mimeType = inferMimeTypeFromFileName(fileName)
    ensureSupportedImageAsset(fileName, mimeType)
    return {
      sourcePath,
      fileName,
      size: fileStat.size,
      mimeType,
      ...readImageDimensions(sourcePath)
    }
  })

  ipcMain.handle('file:pickAndUpload', async (): Promise<UploadResult> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'heic', 'heif']
        }
      ]
    })
    if (result.canceled || result.filePaths.length === 0) {
      throw new Error('No file selected')
    }
    const sourcePath = result.filePaths[0]
    return copyToUploadDir(sourcePath)
  })

  ipcMain.handle('imageAsset:upload', async (_event, sourcePath: string): Promise<ImageAssetResult> => {
    if (!sourcePath || typeof sourcePath !== 'string') {
      throw new Error('Invalid file path')
    }
    return copyImageAssetToUploadDir(sourcePath)
  })

  ipcMain.handle('file:delete', async (_event, resourceUrl: string): Promise<boolean> => {
    if (!resourceUrl || typeof resourceUrl !== 'string') {
      throw new Error('Invalid resource url')
    }
    const targetPath = resolveAppResourcePath(resourceUrl, 'uploads')
    await unlink(targetPath)
    return true
  })

  ipcMain.handle('file:clearUploads', async (): Promise<number> => {
    return clearUploadFiles()
  })
}
