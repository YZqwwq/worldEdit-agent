import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerAIAgentIPC, unregisterAIAgentIPC } from './ipc/ai-agent'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // Register AI Agent IPC handlers
  registerAIAgentIPC()

  // World IPC handlers
  ipcMain.handle('world:list', async () => {
    // 返回世界观列表，这里先返回空数组
    // 实际应用中应该从文件系统或数据库读取
    return []
  })

  ipcMain.handle('world:recent', async () => {
    // 返回最近使用的文件列表
    return []
  })

  ipcMain.handle('world:create', async (_event, worldData) => {
    // 创建新的世界观
    const newWorld = {
      id: Date.now().toString(),
      name: worldData.name || 'New World',
      description: worldData.description || '',
      tags: worldData.tags || [],
      author: worldData.author || 'Unknown',
      lastModified: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0'
    }
    // 这里应该保存到文件系统或数据库
    return newWorld
  })

  ipcMain.handle('world:open', async (_event, worldId) => {
    // 打开指定的世界观
    // 这里应该从文件系统或数据库读取
    return {
      id: worldId,
      name: 'Sample World',
      description: 'A sample world for testing',
      tags: ['示例', '测试'],
      author: 'System',
      lastModified: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0'
    }
  })

  ipcMain.handle('world:save', async (_event, worldData) => {
    // 保存世界观数据
    // 这里应该保存到文件系统或数据库
    return true
  })

  ipcMain.handle('world:delete', async (_event, worldId) => {
    // 删除指定的世界观
    // 这里应该从文件系统或数据库删除
    return true
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Clean up AI Agent IPC handlers when app is quitting
app.on('before-quit', () => {
  unregisterAIAgentIPC()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
