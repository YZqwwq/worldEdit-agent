import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { StreamChunk } from '../share/cache/render/aiagent/aiContent'
import type { MainAgentUserMessageInput } from '../share/cache/AItype/states/mainAgentMessageContent'
import type {
  ModelConfigInput,
  ModelConfigPayload,
  ModelSpeedTestResult,
  ModelSpeedTestTarget
} from '../share/cache/AItype/model/modelConfigPayload'
import type { MemoryInspectionPayload } from '../share/cache/AItype/states/memoryInspection'
import type { TaskMonitorSnapshot } from '../share/cache/AItype/states/taskLifecycleState'
import type {
  ChatAvatarProfilesPayload,
  PersistedChatAvatarProfile,
  SaveChatAvatarInput
} from '../share/cache/render/aiagent/chatAvatarProfile'
import type {
  CreateWorldEntityInput,
  CreateWorldEntityRelationInput,
  CreateWorldInput,
  UpdateWorldEntityInput,
  UpdateWorldInput,
  UpsertWorldEntityComponentInput,
  WorldEntityComponentPayload,
  WorldEntityDetailPayload,
  WorldEntityRelationPayload,
  WorldPayload,
  WorldbuildingComponentDefinition,
  WorldbuildingEntityDefinition,
  WorldEntityPayload,
  WorldbuildingRelationDefinition,
  WorldbuildingSchemaCatalogPayload
} from '../share/cache/worldbuilding/worldbuilding'

// Local type to ensure availability in this module
type Api = {
  // 流式发送
  sendMessageStream: (message: MainAgentUserMessageInput) => void
  // 监听流数据包（返回移除监听函数）
  onStreamChunk: (callback: (chunk: StreamChunk) => void) => () => void

  // 获取历史记录
  getHistory: () => Promise<any[]>
  interruptCurrentRun: () => Promise<{ ok: boolean; message: string }>
  revertLastChatTurn: () => Promise<{
    ok: boolean
    message: string
    revertedTurnId?: number
    restoredInput?: MainAgentUserMessageInput
  }>
  clearHistory: () => Promise<void>
  purgeAllData: () => Promise<number>
  resetAgentState: () => Promise<void>
  getMemorySnapshot: () => Promise<MemoryInspectionPayload>
  getTaskMonitorSnapshot: () => Promise<TaskMonitorSnapshot>

  pickFile: () => Promise<{ sourcePath: string; fileName: string; size: number; mimeType?: string }>
  uploadFile: (sourcePath: string) => Promise<{
    resourceUrl: string
    fileName: string
    size: number
    mimeType?: string
  }>
  uploadFileData: (input: {
    fileName: string
    mimeType?: string
    data: ArrayBuffer
  }) => Promise<{
    resourceUrl: string
    fileName: string
    size: number
    mimeType?: string
  }>
  deleteFile: (resourceUrl: string) => Promise<boolean>
  pickAndUploadFile: () => Promise<{
    resourceUrl: string
    fileName: string
    size: number
    mimeType?: string
  }>
  clearUploads: () => Promise<number>

  getAvatarProfiles: () => Promise<ChatAvatarProfilesPayload>
  saveAvatarProfile: (input: SaveChatAvatarInput) => Promise<PersistedChatAvatarProfile>

  getModelConfig: () => Promise<ModelConfigPayload>
  saveModelConfig: (config: ModelConfigInput) => Promise<ModelConfigPayload>
  testModelSpeed: (
    config: ModelConfigInput,
    target: ModelSpeedTestTarget
  ) => Promise<ModelSpeedTestResult>

  listWorlds: () => Promise<WorldPayload[]>
  createWorld: (input: CreateWorldInput) => Promise<WorldPayload>
  updateWorld: (input: UpdateWorldInput) => Promise<WorldPayload>
  deleteWorld: (worldId: string) => Promise<void>
  listWorldEntityDefinitions: () => Promise<WorldbuildingEntityDefinition[]>
  listWorldComponentDefinitions: (
    entityType?: WorldEntityPayload['type']
  ) => Promise<WorldbuildingComponentDefinition[]>
  listWorldRelationDefinitions: () => Promise<WorldbuildingRelationDefinition[]>
  getWorldSchemaCatalog: () => Promise<WorldbuildingSchemaCatalogPayload>
  listWorldEntities: (
    worldId: string,
    type?: WorldEntityPayload['type']
  ) => Promise<WorldEntityPayload[]>
  createWorldEntity: (input: CreateWorldEntityInput) => Promise<WorldEntityPayload>
  updateWorldEntity: (input: UpdateWorldEntityInput) => Promise<WorldEntityPayload>
  deleteWorldEntity: (entityId: string) => Promise<void>
  getWorldEntityDetail: (entityId: string) => Promise<WorldEntityDetailPayload | null>
  upsertWorldEntityComponent: (
    input: UpsertWorldEntityComponentInput
  ) => Promise<WorldEntityComponentPayload>
  createWorldEntityRelation: (
    input: CreateWorldEntityRelationInput
  ) => Promise<WorldEntityRelationPayload>
}

// Custom APIs for renderer
const api: Api = {
  sendMessageStream: (message: MainAgentUserMessageInput) =>
    ipcRenderer.send('ai:sendMessageStream', message),
  
  onStreamChunk: (callback) => {
    const subscription = (_event: IpcRendererEvent, chunk: StreamChunk) => callback(chunk)
    ipcRenderer.on('ai:streamChunk', subscription)
    
    // 返回 cleanup 函数
    return () => {
      ipcRenderer.removeListener('ai:streamChunk', subscription)
    }
  },

  getHistory: () => ipcRenderer.invoke('ai:getHistory'),
  interruptCurrentRun: () => ipcRenderer.invoke('ai:interruptCurrentRun'),
  revertLastChatTurn: () => ipcRenderer.invoke('ai:revertLastChatTurn'),
  clearHistory: () => ipcRenderer.invoke('ai:clearHistory'),
  purgeAllData: () => ipcRenderer.invoke('ai:purgeAllData'),
  resetAgentState: () => ipcRenderer.invoke('ai:resetAgentState'),
  getMemorySnapshot: () => ipcRenderer.invoke('ai:getMemorySnapshot'),
  getTaskMonitorSnapshot: () => ipcRenderer.invoke('ai:getTaskMonitorSnapshot'),
  pickFile: () => ipcRenderer.invoke('file:pick'),
  uploadFile: (sourcePath) => ipcRenderer.invoke('file:upload', sourcePath),
  uploadFileData: (input) => ipcRenderer.invoke('file:uploadData', input),
  deleteFile: (resourceUrl) => ipcRenderer.invoke('file:delete', resourceUrl),
  pickAndUploadFile: () => ipcRenderer.invoke('file:pickAndUpload'),
  clearUploads: () => ipcRenderer.invoke('file:clearUploads'),
  getAvatarProfiles: () => ipcRenderer.invoke('avatar:getProfiles'),
  saveAvatarProfile: (input) => ipcRenderer.invoke('avatar:saveProfile', input),
  getModelConfig: () => ipcRenderer.invoke('config:getModelConfig'),
  saveModelConfig: (config) => ipcRenderer.invoke('config:saveModelConfig', config),
  testModelSpeed: (config, target) => ipcRenderer.invoke('config:testModelSpeed', config, target),
  listWorlds: () => ipcRenderer.invoke('world:listWorlds'),
  createWorld: (input) => ipcRenderer.invoke('world:createWorld', input),
  updateWorld: (input) => ipcRenderer.invoke('world:updateWorld', input),
  deleteWorld: (worldId) => ipcRenderer.invoke('world:deleteWorld', worldId),
  listWorldEntityDefinitions: () => ipcRenderer.invoke('world:listEntityDefinitions'),
  listWorldComponentDefinitions: (entityType) =>
    ipcRenderer.invoke('world:listComponentDefinitions', entityType),
  listWorldRelationDefinitions: () => ipcRenderer.invoke('world:listRelationDefinitions'),
  getWorldSchemaCatalog: () => ipcRenderer.invoke('world:getSchemaCatalog'),
  listWorldEntities: (worldId, type) => ipcRenderer.invoke('world:listEntities', worldId, type),
  createWorldEntity: (input) => ipcRenderer.invoke('world:createEntity', input),
  updateWorldEntity: (input) => ipcRenderer.invoke('world:updateEntity', input),
  deleteWorldEntity: (entityId) => ipcRenderer.invoke('world:deleteEntity', entityId),
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
