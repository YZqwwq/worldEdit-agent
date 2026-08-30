const path = require('node:path')

const userData = process.env.WORLDEDIT_AGENT_TEST_USER_DATA || path.join(process.cwd(), '.tmp-electron-test')

const app = {
  getPath(name) {
    if (name === 'userData') return userData
    if (name === 'logs') return path.join(userData, 'logs')
    return userData
  },
  setPath() {},
  whenReady: async () => undefined,
  on() {},
  once() {},
  quit() {},
  requestSingleInstanceLock: () => true,
  commandLine: { appendSwitch() {} }
}

const protocol = {
  registerSchemesAsPrivileged() {},
  handle() {}
}

const ipcMain = { handle() {}, on() {}, removeHandler() {} }
const dialog = {}
const nativeImage = {}
const shell = {}
const net = {}
class BrowserWindow {
  static getAllWindows() { return [] }
}

module.exports = { app, protocol, ipcMain, dialog, nativeImage, shell, net, BrowserWindow }
