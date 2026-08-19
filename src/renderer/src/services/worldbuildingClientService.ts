import type {
  CreateWorldEntityInput,
  CreateWorldEntityRelationInput,
  CreateWorldInput,
  UpdateWorldEntityInput,
  UpdateWorldInput,
  UpsertWorldEntityComponentInput,
  WorldEntityComponentPayload,
  WorldEntityDetailPayload,
  WorldEntityPayload,
  WorldEntityRelationPayload,
  WorldbuildingComponentDefinition,
  WorldbuildingEntityDefinition,
  WorldbuildingRelationDefinition,
  WorldbuildingSchemaCatalogPayload,
  WorldPayload
} from '@share/cache/worldbuilding/worldbuilding'
import type {
  CommitWorldEntityDocumentHistorySessionInput,
  CreateWorldEntityDocumentInput,
  DeleteWorldEntityDocumentInput,
  MoveWorldEntityDocumentInput,
  UpdateWorldEntityDocumentInput,
  WorldEntityDocumentOwnerRef,
  WorldEntityDocumentPayload
} from '@share/cache/worldbuilding/worldEntityDocument'
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
  WorldDocumentVersionStatusPayload
} from '@share/cache/worldbuilding/worldDocumentHistory'

export const worldbuildingClientService = {
  listWorlds(): Promise<WorldPayload[]> {
    return window.api.listWorlds()
  },

  createWorld(input: CreateWorldInput): Promise<WorldPayload> {
    return window.api.createWorld(input)
  },

  updateWorld(input: UpdateWorldInput): Promise<WorldPayload> {
    return window.api.updateWorld(input)
  },

  deleteWorld(worldId: string): Promise<void> {
    return window.api.deleteWorld(worldId)
  },

  listEntityDefinitions(): Promise<WorldbuildingEntityDefinition[]> {
    return window.api.listWorldEntityDefinitions()
  },

  listComponentDefinitions(
    entityType?: WorldEntityPayload['type']
  ): Promise<WorldbuildingComponentDefinition[]> {
    return window.api.listWorldComponentDefinitions(entityType)
  },

  listRelationDefinitions(): Promise<WorldbuildingRelationDefinition[]> {
    return window.api.listWorldRelationDefinitions()
  },

  getSchemaCatalog(): Promise<WorldbuildingSchemaCatalogPayload> {
    return window.api.getWorldSchemaCatalog()
  },

  listEntities(worldId: string, type?: WorldEntityPayload['type']): Promise<WorldEntityPayload[]> {
    return window.api.listWorldEntities(worldId, type)
  },

  createEntity(input: CreateWorldEntityInput): Promise<WorldEntityPayload> {
    return window.api.createWorldEntity(input)
  },

  updateEntity(input: UpdateWorldEntityInput): Promise<WorldEntityPayload> {
    return window.api.updateWorldEntity(input)
  },

  deleteEntity(entityId: string): Promise<void> {
    return window.api.deleteWorldEntity(entityId)
  },

  getEntityDetail(entityId: string): Promise<WorldEntityDetailPayload | null> {
    return window.api.getWorldEntityDetail(entityId)
  },

  upsertComponent(input: UpsertWorldEntityComponentInput): Promise<WorldEntityComponentPayload> {
    return window.api.upsertWorldEntityComponent(input)
  },

  createRelation(input: CreateWorldEntityRelationInput): Promise<WorldEntityRelationPayload> {
    return window.api.createWorldEntityRelation(input)
  },

  listWorldEntityDocuments(
    owner: WorldEntityDocumentOwnerRef
  ): Promise<WorldEntityDocumentPayload[]> {
    return window.api.listWorldEntityDocuments(owner)
  },

  getWorldEntityDocument(documentId: string): Promise<WorldEntityDocumentPayload | null> {
    return window.api.getWorldEntityDocument(documentId)
  },

  createWorldEntityDocument(
    input: CreateWorldEntityDocumentInput
  ): Promise<WorldEntityDocumentPayload> {
    return window.api.createWorldEntityDocument(input)
  },

  updateWorldEntityDocument(
    input: UpdateWorldEntityDocumentInput
  ): Promise<WorldEntityDocumentPayload> {
    return window.api.updateWorldEntityDocument(input)
  },

  moveWorldEntityDocument(
    input: MoveWorldEntityDocumentInput
  ): Promise<WorldEntityDocumentPayload> {
    return window.api.moveWorldEntityDocument(input)
  },

  deleteWorldEntityDocument(input: DeleteWorldEntityDocumentInput): Promise<void> {
    return window.api.deleteWorldEntityDocument(input)
  },

  commitWorldEntityDocumentHistorySession(
    input: CommitWorldEntityDocumentHistorySessionInput
  ): Promise<void> {
    return window.api.commitWorldEntityDocumentHistorySession(input)
  },

  initializeWorldDocumentHistory(worldId: string): Promise<WorldDocumentCommitSummary> {
    return window.api.initializeWorldDocumentHistory(worldId)
  },

  listWorldDocumentCommitHistory(
    worldId: string,
    limit?: number
  ): Promise<WorldDocumentCommitHistoryPayload> {
    return window.api.listWorldDocumentCommitHistory(worldId, limit)
  },

  getWorldDocumentCommitDetail(commitId: string): Promise<WorldDocumentCommitDetailPayload | null> {
    return window.api.getWorldDocumentCommitDetail(commitId)
  },

  inspectWorldDocumentHistory(worldId?: string): Promise<WorldDocumentIntegrityReport> {
    return window.api.inspectWorldDocumentHistory(worldId)
  },

  pruneWorldDocumentHistory(dryRun = true): Promise<WorldDocumentGarbageCollectionResult> {
    return window.api.pruneWorldDocumentHistory(dryRun)
  },

  getWorldDocumentVersionStatus(worldId: string): Promise<WorldDocumentVersionStatusPayload> {
    return window.api.getWorldDocumentVersionStatus(worldId)
  },

  listWorldDocumentCheckpoints(worldId: string): Promise<WorldDocumentCheckpointPayload[]> {
    return window.api.listWorldDocumentCheckpoints(worldId)
  },

  saveWorldDocumentCheckpoint(
    input: SaveWorldDocumentCheckpointInput
  ): Promise<WorldDocumentCheckpointPayload> {
    return window.api.saveWorldDocumentCheckpoint(input)
  },

  deleteWorldDocumentCheckpoint(checkpointId: string): Promise<void> {
    return window.api.deleteWorldDocumentCheckpoint(checkpointId)
  },

  compareWorldDocumentCommits(
    input: CompareWorldDocumentCommitsInput
  ): Promise<WorldDocumentCommitComparisonPayload> {
    return window.api.compareWorldDocumentCommits(input)
  },

  createWorldDocumentBranch(
    input: CreateWorldDocumentBranchInput
  ): Promise<WorldDocumentBranchPayload> {
    return window.api.createWorldDocumentBranch(input)
  },

  renameWorldDocumentBranch(
    input: RenameWorldDocumentBranchInput
  ): Promise<WorldDocumentBranchPayload> {
    return window.api.renameWorldDocumentBranch(input)
  },

  deleteWorldDocumentBranch(branchId: string): Promise<void> {
    return window.api.deleteWorldDocumentBranch(branchId)
  },

  switchWorldDocumentBranch(branchId: string): Promise<WorldDocumentBranchPayload> {
    return window.api.switchWorldDocumentBranch(branchId)
  },

  previewWorldDocumentMerge(
    input: PreviewWorldDocumentMergeInput
  ): Promise<WorldDocumentMergePreviewPayload> {
    return window.api.previewWorldDocumentMerge(input)
  },

  applyWorldDocumentMerge(input: ApplyWorldDocumentMergeInput): Promise<WorldDocumentCommitSummary> {
    return window.api.applyWorldDocumentMerge(input)
  },

  exportWorldDocumentHistory(worldId: string): Promise<{ saved: boolean; filePath?: string }> {
    return window.api.exportWorldDocumentHistory(worldId)
  },

  importWorldDocumentHistory(worldId: string): Promise<{
    imported: boolean
    filePath?: string
    report?: WorldDocumentVersionPackageImportResult
  }> {
    return window.api.importWorldDocumentHistory(worldId)
  },

  restoreWorldDocumentCommit(
    input: RestoreWorldDocumentCommitInput
  ): Promise<RestoreWorldDocumentCommitResult> {
    return window.api.restoreWorldDocumentCommit(input)
  },

  applyWorldDocumentCommit(
    input: ApplyWorldDocumentCommitInput
  ): Promise<RestoreWorldDocumentCommitResult> {
    return window.api.applyWorldDocumentCommit(input)
  }
}
