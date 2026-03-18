import { ElectronAPI } from '@electron-toolkit/preload'
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
  WorldEntityPayload,
  WorldbuildingComponentDefinition,
  WorldbuildingEntityDefinition,
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
    createWorldEntityRelation: (
      input: CreateWorldEntityRelationInput
    ) => Promise<unknown>
  }

  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
