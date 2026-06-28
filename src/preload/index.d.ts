import { ElectronAPI } from '@electron-toolkit/preload'
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
  WorldEntityPayload,
  WorldbuildingComponentDefinition,
  WorldbuildingEntityDefinition,
  WorldbuildingRelationDefinition,
  WorldbuildingSchemaCatalogPayload,
  WorldPayload
} from '../share/cache/worldbuilding/worldbuilding'
import type {
  CharacterNarrativeDocumentPayload,
  CreateCharacterNarrativeDocumentInput,
  DeleteCharacterNarrativeDocumentInput,
  MoveCharacterNarrativeDocumentInput,
  UpdateCharacterNarrativeDocumentInput
} from '../share/cache/worldbuilding/characterNarrativeDocument'
import type {
  CharacterImpressionPayload,
  UpsertCharacterImpressionInput
} from '../share/cache/worldbuilding/characterImpression'

declare global {
  // Define the shape of custom APIs exposed to renderer (global type)
  type Api = {
    // 流式聊天接口
    sendMessageStream: (message: MainAgentUserMessageInput) => void
    onStreamChunk: (callback: (chunk: StreamChunk) => void) => () => void

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
    pickImageAsset: () => Promise<{
      sourcePath: string
      fileName: string
      size: number
      mimeType?: string
      width?: number
      height?: number
    }>
    uploadFile: (sourcePath: string) => Promise<{
      resourceUrl: string
      fileName: string
      size: number
      mimeType?: string
    }>
    uploadImageAsset: (sourcePath: string) => Promise<{
      resourceUrl: string
      fileName: string
      size: number
      mimeType?: string
      width?: number
      height?: number
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
    uploadResourceData: (input: {
      fileName: string
      mimeType?: string
      data: ArrayBuffer
      relativeDir?: string
    }) => Promise<{
      resourceUrl: string
      fileName: string
      size: number
      mimeType?: string
    }>
    readResourceBinary: (resourceUrl: string) => Promise<{
      fileName: string
      size: number
      mimeType?: string
      data: ArrayBuffer
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

    listCharacterNarrativeDocuments: (
      characterEntityId: string
    ) => Promise<CharacterNarrativeDocumentPayload[]>
    getCharacterNarrativeDocument: (
      documentId: string
    ) => Promise<CharacterNarrativeDocumentPayload | null>
    createCharacterNarrativeDocument: (
      input: CreateCharacterNarrativeDocumentInput
    ) => Promise<CharacterNarrativeDocumentPayload>
    updateCharacterNarrativeDocument: (
      input: UpdateCharacterNarrativeDocumentInput
    ) => Promise<CharacterNarrativeDocumentPayload>
    moveCharacterNarrativeDocument: (
      input: MoveCharacterNarrativeDocumentInput
    ) => Promise<CharacterNarrativeDocumentPayload>
    deleteCharacterNarrativeDocument: (
      input: DeleteCharacterNarrativeDocumentInput
    ) => Promise<void>
    getCharacterImpression: (
      characterEntityId: string
    ) => Promise<CharacterImpressionPayload | null>
    upsertCharacterImpression: (
      input: UpsertCharacterImpressionInput
    ) => Promise<CharacterImpressionPayload>
  }

  interface Window {
    electron: ElectronAPI
    api: Api
  }
}
