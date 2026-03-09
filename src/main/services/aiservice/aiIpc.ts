import { dialog, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { copyFile, stat, unlink, readdir } from 'node:fs/promises'
import { basename, extname, join, resolve, sep } from 'node:path'
import { aiService } from './aiService'
import type { StreamChunk } from '../../../share/cache/render/aiagent/aiContent'
import { getStaticUploadDir } from '../../config/pathConfig'

type UploadResult = {
  filePath: string
  fileName: string
  size: number
}

type PickResult = {
  sourcePath: string
  fileName: string
  size: number
}

const copyToUploadDir = async (sourcePath: string): Promise<UploadResult> => {
  const fileStat = await stat(sourcePath)
  const uploadDir = getStaticUploadDir()
  const ext = extname(sourcePath)
  const destName = `${randomUUID()}${ext}`
  const destPath = join(uploadDir, destName)
  await copyFile(sourcePath, destPath)
  return {
    filePath: destPath,
    fileName: basename(sourcePath),
    size: fileStat.size
  }
}

/**
 * Initializes IPC handlers for the AI service.
 */
export function initializeAIEndpoints(): void {
  // 流式传输：渲染进程发送消息后，主进程逐 chunk 推送
  ipcMain.on('ai:sendMessageStream', async (event, message: string) => {
    try {
      await aiService.sendStreamMessage(message, (chunk: StreamChunk) => {
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

  // 清除历史记录
  ipcMain.handle('ai:clearHistory', async (_event) => {
    return aiService.clearHistory()
  })

  ipcMain.handle('file:upload', async (_event, sourcePath: string): Promise<UploadResult> => {
    if (!sourcePath || typeof sourcePath !== 'string') {
      throw new Error('Invalid file path')
    }
    return copyToUploadDir(sourcePath)
  })

  ipcMain.handle('file:pick', async (): Promise<PickResult> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      throw new Error('No file selected')
    }
    const sourcePath = result.filePaths[0]
    const fileStat = await stat(sourcePath)
    return {
      sourcePath,
      fileName: basename(sourcePath),
      size: fileStat.size
    }
  })

  ipcMain.handle('file:pickAndUpload', async (): Promise<UploadResult> => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) {
      throw new Error('No file selected')
    }
    const sourcePath = result.filePaths[0]
    return copyToUploadDir(sourcePath)
  })

  ipcMain.handle('file:delete', async (_event, filePath: string): Promise<boolean> => {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Invalid file path')
    }
    const uploadDir = resolve(getStaticUploadDir())
    const targetPath = resolve(filePath)
    if (!targetPath.startsWith(`${uploadDir}${sep}`) && targetPath !== uploadDir) {
      throw new Error('Invalid delete path')
    }
    await unlink(targetPath)
    return true
  })

  ipcMain.handle('file:clearUploads', async (): Promise<number> => {
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
  })
}
