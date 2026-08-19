import { DataSource } from 'typeorm'
import { app } from 'electron'
import { join } from 'node:path'
import { Message } from '../../share/entity/database/Message'
import { ModelConfig } from '../../share/entity/database/ModelConfig'
import { MemoryStateRecord } from '../../share/entity/database/MemoryStateRecord'
import { MemoryEntry } from '../../share/entity/database/MemoryEntry'
import { MemorySlotRecord } from '../../share/entity/database/MemorySlotRecord'
import { MemoryStageRecord } from '../../share/entity/database/MemoryStageRecord'
import { PersonaStateRecord } from '../../share/entity/database/PersonaStateRecord'
import { InteractionObservationRecord } from '../../share/entity/database/InteractionObservationRecord'
import { TaskRecord } from '../../share/entity/database/TaskRecord'
import { TaskExecutionRecord } from '../../share/entity/database/TaskExecutionRecord'
import { TaskNotificationRecord } from '../../share/entity/database/TaskNotificationRecord'
import { TaskTraceRecord } from '../../share/entity/database/TaskTraceRecord'
import { MainAgentTurnRecord } from '../../share/entity/database/MainAgentTurnRecord'
import { MainAgentEventRecord } from '../../share/entity/database/MainAgentEventRecord'
import { MainAgentTurnVersionRecord } from '../../share/entity/database/MainAgentTurnVersionRecord'
import { WorldRecord } from '../../share/entity/database/WorldRecord'
import { WorldEntityRecord } from '../../share/entity/database/WorldEntityRecord'
import { WorldEntityComponentRecord } from '../../share/entity/database/WorldEntityComponentRecord'
import { WorldEntityRelationRecord } from '../../share/entity/database/WorldEntityRelationRecord'
import { ToolUsageStatsRecord } from '../../share/entity/database/ToolUsageStatsRecord'
import { WorldEntityDocumentRecord } from '../../share/entity/database/WorldEntityDocumentRecord'
import { CharacterImpressionRecord } from '../../share/entity/database/CharacterImpressionRecord'
import { WorldEntityMentionIndexRecord } from '../../share/entity/database/WorldEntityMentionIndexRecord'
import { WorldEntityManualMentionRecord } from '../../share/entity/database/WorldEntityManualMentionRecord'
import { MainAgentToolEffectReceiptRecord } from '../../share/entity/database/MainAgentToolEffectReceiptRecord'
import { MainAgentChangeSetRecord } from '../../share/entity/database/MainAgentChangeSetRecord'
import { AgentArtifactRecord } from '../../share/entity/database/AgentArtifactRecord'
import { WorldDocumentContentVersionRecord } from '../../share/entity/database/WorldDocumentContentVersionRecord'
import { WorldDocumentTreeObjectRecord } from '../../share/entity/database/WorldDocumentTreeObjectRecord'
import { WorldDocumentCommitRecord } from '../../share/entity/database/WorldDocumentCommitRecord'
import { WorldDocumentChangeRecord } from '../../share/entity/database/WorldDocumentChangeRecord'
import { WorldDocumentCheckpointRecord } from '../../share/entity/database/WorldDocumentCheckpointRecord'
import { WorldDocumentBranchRecord } from '../../share/entity/database/WorldDocumentBranchRecord'
import { WorldDocumentIntegrityCacheRecord } from '../../share/entity/database/WorldDocumentIntegrityCacheRecord'
import { migrateWorldEntityDocuments } from './migrations/migrateWorldEntityDocuments'
import { runAppSchemaMigrations } from './migrations/runAppSchemaMigrations'

// 数据库文件路径：UserData/database.sqlite
const dbPath = join(app.getPath('userData'), 'database.sqlite')

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: dbPath,
  synchronize: true, // 开发阶段自动同步 schema，生产环境建议配合 migration
  logging: false,
  entities: [
    Message,
    ModelConfig,
    MemoryStateRecord,
    MemoryEntry,
    MemorySlotRecord,
    MemoryStageRecord,
    PersonaStateRecord,
    InteractionObservationRecord,
    TaskRecord,
    TaskExecutionRecord,
    TaskNotificationRecord,
    TaskTraceRecord,
    MainAgentTurnRecord,
    MainAgentEventRecord,
    MainAgentTurnVersionRecord,
    WorldRecord,
    WorldEntityRecord,
    WorldEntityComponentRecord,
    WorldEntityRelationRecord,
    WorldEntityManualMentionRecord,
    WorldEntityMentionIndexRecord,
    WorldEntityDocumentRecord,
    MainAgentToolEffectReceiptRecord,
    MainAgentChangeSetRecord,
    AgentArtifactRecord,
    WorldDocumentContentVersionRecord,
    WorldDocumentTreeObjectRecord,
    WorldDocumentCommitRecord,
    WorldDocumentChangeRecord,
    WorldDocumentCheckpointRecord,
    WorldDocumentBranchRecord,
    WorldDocumentIntegrityCacheRecord,
    CharacterImpressionRecord,
    ToolUsageStatsRecord
  ],
  subscribers: [],
  migrations: []
})

export const initDatabase = async (): Promise<void> => {
  try {
    if (!AppDataSource.isInitialized) {
      migrateWorldEntityDocuments(dbPath)
      await AppDataSource.initialize()
      await AppDataSource.query('PRAGMA journal_mode = WAL')
      await AppDataSource.query('PRAGMA synchronous = NORMAL')
      await AppDataSource.query('PRAGMA foreign_keys = ON')
      await AppDataSource.query('PRAGMA busy_timeout = 5000')
      await runAppSchemaMigrations(AppDataSource)
      console.log('Data Source has been initialized!')
      console.log('Database path:', dbPath)
    }
  } catch (err) {
    console.error('Error during Data Source initialization:', err)
    throw err
  }
}
