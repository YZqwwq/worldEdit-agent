import { ElectronAPI } from '@electron-toolkit/preload'
import type { StreamChunk } from '../share/cache/render/aiagent/aiContent'
import type {
  ModelConfigInput,
  ModelConfigPayload
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
  WorldEntityPayload,
  WorldbuildingComponentDefinition,
  WorldbuildingEntityDefinition,
  WorldbuildingRelationDefinition,
  WorldbuildingSchemaCatalogPayload,
  WorldPayload
} from '../share/cache/worldbuilding/worldbuilding'

declare global {
  // Define the shape of custom APIs exposed to renderer (global type)
  type Api = {
    // 流式聊天接口
    sendMessageStream: (message: string) => void
    onStreamChunk: (callback: (chunk: StreamChunk) => void) => () => void

    getHistory: () => Promise<any[]>
    clearHistory: () => Promise<void>
    purgeAllData: () => Promise<number>
    resetPersonaState: () => Promise<void>
    getMemorySnapshot: () => Promise<MemoryInspectionPayload>
    getTaskMonitorSnapshot: () => Promise<TaskMonitorSnapshot>

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

  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
