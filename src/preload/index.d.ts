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
import type {
  ApplyWorldDocumentMergeInput,
  ApplyWorldDocumentCommitInput,
  CompareWorldDocumentCommitsInput,
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

declare global {
  // Define the shape of custom APIs exposed to renderer (global type)
  type Api = {
    // 流式聊天接口
    sendMessageStream: (message: MainAgentUserMessageInput) => void
    onStreamChunk: (callback: (chunk: StreamChunk) => void) => () => void

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
    purgeAllData: () => Promise<number>
    resetAgentState: () => Promise<void>
    getMemorySnapshot: () => Promise<MemoryInspectionPayload>
    getTaskMonitorSnapshot: () => Promise<TaskMonitorSnapshot>

    pickFile: () => Promise<{
      sourcePath: string
      fileName: string
      size: number
      mimeType?: string
    }>
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
    pruneWorldDocumentHistory: (
      dryRun?: boolean
    ) => Promise<WorldDocumentGarbageCollectionResult>
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
    applyWorldDocumentMerge: (
      input: ApplyWorldDocumentMergeInput
    ) => Promise<WorldDocumentCommitSummary>
    exportWorldDocumentHistory: (
      worldId: string
    ) => Promise<{ saved: boolean; filePath?: string }>
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
    onWorldEntityDocumentChanged: (
      callback: (change: WorldEntityDocumentChangeEvent) => void
    ) => () => void
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
