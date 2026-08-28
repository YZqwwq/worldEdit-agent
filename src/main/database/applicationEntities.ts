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
import { AgentWorldCognitionSpaceRecord } from '../../share/entity/database/AgentWorldCognitionSpaceRecord'
import { AgentWorldCognitionNodeRecord } from '../../share/entity/database/AgentWorldCognitionNodeRecord'
import { SelfExperienceRecord } from '../../share/entity/database/SelfExperienceRecord'
import { SelfCoreRevisionRecord } from '../../share/entity/database/SelfCoreRevisionRecord'
import { AgentLifeStateRecord } from '../../share/entity/database/AgentLifeStateRecord'

export const applicationEntities = [
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
  AgentWorldCognitionSpaceRecord,
  AgentWorldCognitionNodeRecord,
  SelfExperienceRecord,
  SelfCoreRevisionRecord,
  AgentLifeStateRecord,
  CharacterImpressionRecord,
  ToolUsageStatsRecord
]
