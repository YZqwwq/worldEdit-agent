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
import type {
  CommitWorldEntityDocumentHistorySessionInput,
  ResolveWorldEntityDocumentHistorySessionInput,
  WorldEntityDocumentHistorySessionResolution,
  CreateWorldEntityDocumentInput,
  DeleteWorldEntityDocumentInput,
  MoveWorldEntityDocumentInput,
  UpdateWorldEntityDocumentInput,
  WorldEntityDocumentChangeEvent,
  WorldEntityDocumentPayload
} from '../share/cache/worldbuilding/worldEntityDocument'
import type {
  CharacterImpressionPayload,
  UpsertCharacterImpressionInput
} from '../share/cache/worldbuilding/characterImpression'
import type { AgentArtifactPayload } from '../share/cache/AItype/states/agentArtifact'
import type { PromptInspectionPayload, SavePromptInspectionInput } from '../share/cache/AItype/states/promptInspection'
import type {
  ApplyWorldDocumentMergeInput,
  ApplyWorldDocumentCommitInput,
  CompareWorldDocumentCommitsInput,
  DeleteWorldDocumentCommitInput,
  DeleteWorldDocumentCommitResult,
  CreateWorldDocumentBranchInput,
  RenameWorldDocumentBranchInput,
  PreviewWorldDocumentMergeInput,
  RestoreWorldDocumentCommitInput,
  RestoreWorldDocumentCommitResult,
  SaveWorldDocumentCheckpointInput,
  WorldDocumentCheckpointPayload,
  WorldDocumentBranchPayload,
  WorldDocumentCommitComparisonPayload,
  WorldDocumentCommitDetailPayload,
  WorldDocumentCommitHistoryPayload,
  WorldDocumentIntegrityReport,
  WorldDocumentGarbageCollectionResult,
  WorldDocumentVersionPackageImportResult,
  WorldDocumentMergePreviewPayload,
  WorldDocumentCommitSummary,
  WorldDocumentDiffReferencePayload,
  WorldDocumentVersionStatusPayload
} from '../share/cache/worldbuilding/worldDocumentHistory'

// Local type to ensure availability in this module
type Api = {
  // 流式发送
  sendMessageStream: (message: MainAgentUserMessageInput) => void
  // 监听流数据包（返回移除监听函数）
  onStreamChunk: (callback: (chunk: StreamChunk) => void) => () => void

  // 获取历史记录
  getHistory: () => Promise<any[]>
  getAgentArtifact: (artifactId: string) => Promise<AgentArtifactPayload | null>
  interruptCurrentRun: () => Promise<{ ok: boolean; message: string }>
  revertLastChatTurn: () => Promise<{
    ok: boolean
    message: string
    revertedTurnId?: number
    restoredInput?: MainAgentUserMessageInput
  }>
  clearHistory: () => Promise<void>
  resetAgentSession: () => Promise<void>
  resetAgentState: () => Promise<void>
  getMemorySnapshot: () => Promise<MemoryInspectionPayload>
  getTaskMonitorSnapshot: () => Promise<TaskMonitorSnapshot>
  getPromptInspection: () => Promise<PromptInspectionPayload>
  savePromptInspection: (input: SavePromptInspectionInput) => Promise<PromptInspectionPayload>

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
  uploadFileData: (input: { fileName: string; mimeType?: string; data: ArrayBuffer }) => Promise<{
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

  listWorldEntityDocuments: (worldId: string) => Promise<WorldEntityDocumentPayload[]>
  getWorldEntityDocument: (documentId: string) => Promise<WorldEntityDocumentPayload | null>
  createWorldEntityDocument: (
    input: CreateWorldEntityDocumentInput
  ) => Promise<WorldEntityDocumentPayload>
  updateWorldEntityDocument: (
    input: UpdateWorldEntityDocumentInput
  ) => Promise<WorldEntityDocumentPayload>
  moveWorldEntityDocument: (
    input: MoveWorldEntityDocumentInput
  ) => Promise<WorldEntityDocumentPayload>
  deleteWorldEntityDocument: (input: DeleteWorldEntityDocumentInput) => Promise<void>
  commitWorldEntityDocumentHistorySession: (
    input: CommitWorldEntityDocumentHistorySessionInput
  ) => Promise<void>
  resolveWorldEntityDocumentHistorySession: (
    input: ResolveWorldEntityDocumentHistorySessionInput
  ) => Promise<WorldEntityDocumentHistorySessionResolution>
  initializeWorldDocumentHistory: (worldId: string) => Promise<WorldDocumentCommitSummary>
  listWorldDocumentCommitHistory: (
    worldId: string,
    limit?: number
  ) => Promise<WorldDocumentCommitHistoryPayload>
  getWorldDocumentCommitDetail: (
    commitId: string
  ) => Promise<WorldDocumentCommitDetailPayload | null>
  getWorldDocumentDiffByRef: (diffRef: string) => Promise<WorldDocumentDiffReferencePayload>
  inspectWorldDocumentHistory: (worldId?: string) => Promise<WorldDocumentIntegrityReport>
  pruneWorldDocumentHistory: (dryRun?: boolean) => Promise<WorldDocumentGarbageCollectionResult>
  getWorldDocumentVersionStatus: (worldId: string) => Promise<WorldDocumentVersionStatusPayload>
  listWorldDocumentCheckpoints: (worldId: string) => Promise<WorldDocumentCheckpointPayload[]>
  saveWorldDocumentCheckpoint: (
    input: SaveWorldDocumentCheckpointInput
  ) => Promise<WorldDocumentCheckpointPayload>
  deleteWorldDocumentCheckpoint: (checkpointId: string) => Promise<void>
  compareWorldDocumentCommits: (
    input: CompareWorldDocumentCommitsInput
  ) => Promise<WorldDocumentCommitComparisonPayload>
  createWorldDocumentBranch: (
    input: CreateWorldDocumentBranchInput
  ) => Promise<WorldDocumentBranchPayload>
  renameWorldDocumentBranch: (
    input: RenameWorldDocumentBranchInput
  ) => Promise<WorldDocumentBranchPayload>
  deleteWorldDocumentBranch: (branchId: string) => Promise<void>
  switchWorldDocumentBranch: (branchId: string) => Promise<WorldDocumentBranchPayload>
  previewWorldDocumentMerge: (
    input: PreviewWorldDocumentMergeInput
  ) => Promise<WorldDocumentMergePreviewPayload>
  applyWorldDocumentMerge: (input: ApplyWorldDocumentMergeInput) => Promise<WorldDocumentCommitSummary>
  exportWorldDocumentHistory: (worldId: string) => Promise<{ saved: boolean; filePath?: string }>
  importWorldDocumentHistory: (worldId: string) => Promise<{
    imported: boolean
    filePath?: string
    report?: WorldDocumentVersionPackageImportResult
  }>
  restoreWorldDocumentCommit: (
    input: RestoreWorldDocumentCommitInput
  ) => Promise<RestoreWorldDocumentCommitResult>
  applyWorldDocumentCommit: (
    input: ApplyWorldDocumentCommitInput
  ) => Promise<RestoreWorldDocumentCommitResult>
  deleteWorldDocumentCommit: (
    input: DeleteWorldDocumentCommitInput
  ) => Promise<DeleteWorldDocumentCommitResult>
  onWorldEntityDocumentChanged: (
    callback: (change: WorldEntityDocumentChangeEvent) => void
  ) => () => void
  getCharacterImpression: (characterEntityId: string) => Promise<CharacterImpressionPayload | null>
  upsertCharacterImpression: (
    input: UpsertCharacterImpressionInput
  ) => Promise<CharacterImpressionPayload>
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
  getAgentArtifact: (artifactId) => ipcRenderer.invoke('ai:getArtifact', artifactId),
  interruptCurrentRun: () => ipcRenderer.invoke('ai:interruptCurrentRun'),
  revertLastChatTurn: () => ipcRenderer.invoke('ai:revertLastChatTurn'),
  clearHistory: () => ipcRenderer.invoke('ai:clearHistory'),
  resetAgentSession: () => ipcRenderer.invoke('ai:resetAgentSession'),
  resetAgentState: () => ipcRenderer.invoke('ai:resetAgentState'),
  getMemorySnapshot: () => ipcRenderer.invoke('ai:getMemorySnapshot'),
  getTaskMonitorSnapshot: () => ipcRenderer.invoke('ai:getTaskMonitorSnapshot'),
  getPromptInspection: () => ipcRenderer.invoke('ai:getPromptInspection'),
  savePromptInspection: (input) => ipcRenderer.invoke('ai:savePromptInspection', input),
  pickFile: () => ipcRenderer.invoke('file:pick'),
  pickImageAsset: () => ipcRenderer.invoke('imageAsset:pick'),
  uploadFile: (sourcePath) => ipcRenderer.invoke('file:upload', sourcePath),
  uploadImageAsset: (sourcePath) => ipcRenderer.invoke('imageAsset:upload', sourcePath),
  uploadFileData: (input) => ipcRenderer.invoke('file:uploadData', input),
  uploadResourceData: (input) => ipcRenderer.invoke('resource:uploadData', input),
  readResourceBinary: (resourceUrl) => ipcRenderer.invoke('resource:readBinary', resourceUrl),
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
  createWorldEntityRelation: (input) => ipcRenderer.invoke('world:createRelation', input),
  listWorldEntityDocuments: (worldId) => ipcRenderer.invoke('worldEntityDocument:list', worldId),
  getWorldEntityDocument: (documentId) => ipcRenderer.invoke('worldEntityDocument:get', documentId),
  createWorldEntityDocument: (input) => ipcRenderer.invoke('worldEntityDocument:create', input),
  updateWorldEntityDocument: (input) => ipcRenderer.invoke('worldEntityDocument:update', input),
  moveWorldEntityDocument: (input) => ipcRenderer.invoke('worldEntityDocument:move', input),
  deleteWorldEntityDocument: (input) => ipcRenderer.invoke('worldEntityDocument:delete', input),
  commitWorldEntityDocumentHistorySession: (input) =>
    ipcRenderer.invoke('worldEntityDocument:commitHistorySession', input),
  resolveWorldEntityDocumentHistorySession: (input) =>
    ipcRenderer.invoke('worldEntityDocument:resolveHistorySession', input),
  initializeWorldDocumentHistory: (worldId) =>
    ipcRenderer.invoke('worldEntityDocument:history:initialize', worldId),
  listWorldDocumentCommitHistory: (worldId, limit) =>
    ipcRenderer.invoke('worldEntityDocument:history:list', worldId, limit),
  getWorldDocumentCommitDetail: (commitId) =>
    ipcRenderer.invoke('worldEntityDocument:history:get', commitId),
  getWorldDocumentDiffByRef: (diffRef) =>
    ipcRenderer.invoke('worldEntityDocument:diff:get', diffRef),
  inspectWorldDocumentHistory: (worldId) =>
    ipcRenderer.invoke('worldEntityDocument:history:inspect', worldId),
  pruneWorldDocumentHistory: (dryRun = true) =>
    ipcRenderer.invoke('worldEntityDocument:history:gc', dryRun),
  getWorldDocumentVersionStatus: (worldId) =>
    ipcRenderer.invoke('worldEntityDocument:history:status', worldId),
  listWorldDocumentCheckpoints: (worldId) =>
    ipcRenderer.invoke('worldEntityDocument:history:checkpoints', worldId),
  saveWorldDocumentCheckpoint: (input) =>
    ipcRenderer.invoke('worldEntityDocument:history:checkpoint:save', input),
  deleteWorldDocumentCheckpoint: (checkpointId) =>
    ipcRenderer.invoke('worldEntityDocument:history:checkpoint:delete', checkpointId),
  compareWorldDocumentCommits: (input) =>
    ipcRenderer.invoke('worldEntityDocument:history:compare', input),
  createWorldDocumentBranch: (input) =>
    ipcRenderer.invoke('worldEntityDocument:history:branch:create', input),
  renameWorldDocumentBranch: (input) =>
    ipcRenderer.invoke('worldEntityDocument:history:branch:rename', input),
  deleteWorldDocumentBranch: (branchId) =>
    ipcRenderer.invoke('worldEntityDocument:history:branch:delete', branchId),
  switchWorldDocumentBranch: (branchId) =>
    ipcRenderer.invoke('worldEntityDocument:history:branch:switch', branchId),
  previewWorldDocumentMerge: (input) =>
    ipcRenderer.invoke('worldEntityDocument:history:merge:preview', input),
  applyWorldDocumentMerge: (input) =>
    ipcRenderer.invoke('worldEntityDocument:history:merge:apply', input),
  exportWorldDocumentHistory: (worldId) =>
    ipcRenderer.invoke('worldEntityDocument:history:export', worldId),
  importWorldDocumentHistory: (worldId) =>
    ipcRenderer.invoke('worldEntityDocument:history:import', worldId),
  restoreWorldDocumentCommit: (input) =>
    ipcRenderer.invoke('worldEntityDocument:history:restore', input),
  applyWorldDocumentCommit: (input) =>
    ipcRenderer.invoke('worldEntityDocument:history:apply-commit', input),
  deleteWorldDocumentCommit: (input) =>
    ipcRenderer.invoke('worldEntityDocument:history:commit:delete', input),
  onWorldEntityDocumentChanged: (callback) => {
    const subscription = (_event: IpcRendererEvent, change: WorldEntityDocumentChangeEvent) =>
      callback(change)
    ipcRenderer.on('worldEntityDocument:changed', subscription)
    return () => {
      ipcRenderer.removeListener('worldEntityDocument:changed', subscription)
    }
  },
  getCharacterImpression: (characterEntityId) =>
    ipcRenderer.invoke('characterImpression:get', characterEntityId),
  upsertCharacterImpression: (input) => ipcRenderer.invoke('characterImpression:upsert', input)
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
