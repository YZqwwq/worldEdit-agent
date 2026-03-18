import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { StreamChunk } from '../share/cache/render/aiagent/aiContent'
import type {
  ModelConfigInput,
  ModelConfigPayload
} from '../share/cache/AItype/model/modelConfigPayload'
import type { MemoryInspectionPayload } from '../share/cache/AItype/states/memoryInspection'
import type {
  ChatAvatarProfilesPayload,
  PersistedChatAvatarProfile,
  SaveChatAvatarInput
} from '../share/cache/render/aiagent/chatAvatarProfile'
import type {
  CreateWorldEntityInput,
  CreateWorldEntityRelationInput,
  CreateWorldInput,
  UpsertWorldEntityComponentInput,
  WorldEntityComponentPayload,
  WorldEntityDetailPayload,
  WorldPayload,
  WorldbuildingComponentDefinition,
  WorldbuildingEntityDefinition,
  WorldEntityPayload
} from '../share/cache/worldbuilding/worldbuilding'

// Local type to ensure availability in this module
type Api = {
  // 流式发送
  sendMessageStream: (message: string) => void
  // 监听流数据包（返回移除监听函数）
  onStreamChunk: (callback: (chunk: StreamChunk) => void) => () => void

  // 获取历史记录
  getHistory: () => Promise<any[]>
  clearHistory: () => Promise<void>
  purgeAllData: () => Promise<number>
  resetPersonaState: () => Promise<void>
  getMemorySnapshot: () => Promise<MemoryInspectionPayload>

  pickFile: () => Promise<{ sourcePath: string; fileName: string; size: number }>
  uploadFile: (sourcePath: string) => Promise<{ resourceUrl: string; fileName: string; size: number }>
  deleteFile: (resourceUrl: string) => Promise<boolean>
  pickAndUploadFile: () => Promise<{ resourceUrl: string; fileName: string; size: number }>
  clearUploads: () => Promise<number>

  getAvatarProfiles: () => Promise<ChatAvatarProfilesPayload>
  saveAvatarProfile: (input: SaveChatAvatarInput) => Promise<PersistedChatAvatarProfile>

  getModelConfig: () => Promise<ModelConfigPayload>
  saveModelConfig: (config: ModelConfigInput) => Promise<ModelConfigPayload>

  listWorlds: () => Promise<WorldPayload[]>
  createWorld: (input: CreateWorldInput) => Promise<WorldPayload>
  listWorldEntityDefinitions: () => Promise<WorldbuildingEntityDefinition[]>
  listWorldComponentDefinitions: (
    entityType?: WorldEntityPayload['type']
  ) => Promise<WorldbuildingComponentDefinition[]>
  listWorldEntities: (
    worldId: string,
    type?: WorldEntityPayload['type']
  ) => Promise<WorldEntityPayload[]>
  createWorldEntity: (input: CreateWorldEntityInput) => Promise<WorldEntityPayload>
  getWorldEntityDetail: (entityId: string) => Promise<WorldEntityDetailPayload | null>
  upsertWorldEntityComponent: (
    input: UpsertWorldEntityComponentInput
  ) => Promise<WorldEntityComponentPayload>
  createWorldEntityRelation: (input: CreateWorldEntityRelationInput) => Promise<unknown>
}

// Custom APIs for renderer
const api: Api = {
  sendMessageStream: (message: string) => ipcRenderer.send('ai:sendMessageStream', message),
  
  onStreamChunk: (callback) => {
    const subscription = (_event: IpcRendererEvent, chunk: StreamChunk) => callback(chunk)
    ipcRenderer.on('ai:streamChunk', subscription)
    
    // 返回 cleanup 函数
    return () => {
      ipcRenderer.removeListener('ai:streamChunk', subscription)
    }
  },

  getHistory: () => ipcRenderer.invoke('ai:getHistory'),
  clearHistory: () => ipcRenderer.invoke('ai:clearHistory'),
  purgeAllData: () => ipcRenderer.invoke('ai:purgeAllData'),
  resetPersonaState: () => ipcRenderer.invoke('ai:resetPersonaState'),
  getMemorySnapshot: () => ipcRenderer.invoke('ai:getMemorySnapshot'),
  pickFile: () => ipcRenderer.invoke('file:pick'),
  uploadFile: (sourcePath) => ipcRenderer.invoke('file:upload', sourcePath),
  deleteFile: (resourceUrl) => ipcRenderer.invoke('file:delete', resourceUrl),
  pickAndUploadFile: () => ipcRenderer.invoke('file:pickAndUpload'),
  clearUploads: () => ipcRenderer.invoke('file:clearUploads'),
  getAvatarProfiles: () => ipcRenderer.invoke('avatar:getProfiles'),
  saveAvatarProfile: (input) => ipcRenderer.invoke('avatar:saveProfile', input),
  getModelConfig: () => ipcRenderer.invoke('config:getModelConfig'),
  saveModelConfig: (config) => ipcRenderer.invoke('config:saveModelConfig', config),
  listWorlds: () => ipcRenderer.invoke('world:listWorlds'),
  createWorld: (input) => ipcRenderer.invoke('world:createWorld', input),
  listWorldEntityDefinitions: () => ipcRenderer.invoke('world:listEntityDefinitions'),
  listWorldComponentDefinitions: (entityType) =>
    ipcRenderer.invoke('world:listComponentDefinitions', entityType),
  listWorldEntities: (worldId, type) => ipcRenderer.invoke('world:listEntities', worldId, type),
  createWorldEntity: (input) => ipcRenderer.invoke('world:createEntity', input),
  getWorldEntityDetail: (entityId) => ipcRenderer.invoke('world:getEntityDetail', entityId),
  upsertWorldEntityComponent: (input) => ipcRenderer.invoke('world:upsertComponent', input),
  createWorldEntityRelation: (input) => ipcRenderer.invoke('world:createRelation', input)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
