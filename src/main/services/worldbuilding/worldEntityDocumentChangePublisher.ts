import { BrowserWindow } from 'electron'
import type { WorldEntityDocumentChangeEvent } from '@share/cache/worldbuilding/worldEntityDocument'

class WorldEntityDocumentChangePublisher {
  publish(
    change: WorldEntityDocumentChangeEvent,
    options: { excludeWebContentsId?: number } = {}
  ): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) continue
      if (
        options.excludeWebContentsId !== undefined &&
        window.webContents.id === options.excludeWebContentsId
      ) {
        continue
      }
      window.webContents.send('worldEntityDocument:changed', change)
    }
  }
}

export const worldEntityDocumentChangePublisher =
  new WorldEntityDocumentChangePublisher()
