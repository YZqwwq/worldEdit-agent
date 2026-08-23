import { createHash } from 'node:crypto'
import type { DataSource, EntityManager } from 'typeorm'
import {
  APPLICATION_SCHEMA_BASELINE_INDEX_SQL,
  APPLICATION_SCHEMA_BASELINE_TABLE_SQL
} from './applicationSchemaBaseline'

type AppSchemaMigration = {
  id: string
  up: (manager: EntityManager) => Promise<void>
}

const migrations: AppSchemaMigration[] = [
  {
    id: '20260822_persona_state_responsibility_split',
    up: async (manager) => {
      const columns = (await manager.query('PRAGMA table_info(persona_state)')) as Array<{
        name: string
      }>
      const names = new Set(columns.map((column) => column.name))
      if (!names.has('interactionPreferencesJson')) {
        await manager.query(
          "ALTER TABLE persona_state ADD COLUMN interactionPreferencesJson text NOT NULL DEFAULT ''"
        )
      }
      if (!names.has('operationalBaselineJson')) {
        await manager.query(
          "ALTER TABLE persona_state ADD COLUMN operationalBaselineJson text NOT NULL DEFAULT ''"
        )
      }
      await manager.query(`
        UPDATE persona_state
        SET interactionPreferencesJson = CASE
              WHEN interactionPreferencesJson = '' THEN json_object(
                'autonomy_level', autonomyLevel,
                'verbosity_index', verbosityIndex,
                'formality_score', formalityScore
              )
              ELSE interactionPreferencesJson
            END,
            operationalBaselineJson = CASE
              WHEN operationalBaselineJson = '' THEN json_object(
                'risk_tolerance', riskTolerance
              )
              ELSE operationalBaselineJson
            END
      `)
    }
  },
  {
    id: '20260819_application_schema_baseline',
    up: async (manager) => {
      for (const sql of APPLICATION_SCHEMA_BASELINE_TABLE_SQL) await manager.query(sql)
    }
  },
  {
    id: '20260818_world_document_history_indexes',
    up: async (manager) => {
      await manager.query(
        'CREATE INDEX IF NOT EXISTS IDX_world_document_change_status_updated ON world_document_change (status, updatedAt)'
      )
      await manager.query(
        'CREATE INDEX IF NOT EXISTS IDX_world_document_change_commit ON world_document_change (commitId)'
      )
    }
  },
  {
    id: '20260818_world_document_checkpoints_and_metadata',
    up: async (manager) => {
      const commitColumns = (await manager.query(
        'PRAGMA table_info(world_document_commit)'
      )) as Array<{ name: string }>
      const names = new Set(commitColumns.map((column) => column.name))
      if (!names.has('restoredFromCommitId')) {
        await manager.query(
          'ALTER TABLE world_document_commit ADD COLUMN restoredFromCommitId text NULL'
        )
      }
      if (!names.has('intent')) {
        await manager.query(
          "ALTER TABLE world_document_commit ADD COLUMN intent text NOT NULL DEFAULT ''"
        )
      }
      await manager.query(`
        CREATE TABLE IF NOT EXISTS world_document_checkpoint (
          id text PRIMARY KEY NOT NULL,
          worldId text NOT NULL,
          commitId text NOT NULL,
          name text NOT NULL,
          note text NOT NULL DEFAULT '',
          createdAt datetime NOT NULL DEFAULT (datetime('now')),
          updatedAt datetime NOT NULL DEFAULT (datetime('now'))
        )
      `)
      await manager.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS IDX_world_document_checkpoint_world_name ON world_document_checkpoint (worldId, name)'
      )
      await manager.query(
        'CREATE INDEX IF NOT EXISTS IDX_world_document_checkpoint_world_updated ON world_document_checkpoint (worldId, updatedAt)'
      )
    }
  },
  {
    id: '20260818_world_document_branches',
    up: async (manager) => {
      const commitColumns = (await manager.query(
        'PRAGMA table_info(world_document_commit)'
      )) as Array<{ name: string }>
      if (!commitColumns.some((column) => column.name === 'branchId')) {
        await manager.query(
          "ALTER TABLE world_document_commit ADD COLUMN branchId text NOT NULL DEFAULT 'main'"
        )
      }
      await manager.query(`
        CREATE TABLE IF NOT EXISTS world_document_branch (
          id text PRIMARY KEY NOT NULL,
          worldId text NOT NULL,
          name text NOT NULL,
          headCommitId text NULL,
          active boolean NOT NULL DEFAULT (0),
          createdAt datetime NOT NULL DEFAULT (datetime('now')),
          updatedAt datetime NOT NULL DEFAULT (datetime('now'))
        )
      `)
      await manager.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS IDX_world_document_branch_world_name ON world_document_branch (worldId, name)'
      )
      await manager.query(
        'CREATE INDEX IF NOT EXISTS IDX_world_document_branch_world_active ON world_document_branch (worldId, active)'
      )
      await manager.query(`
        INSERT INTO world_document_branch (id, worldId, name, headCommitId, active)
        SELECT 'branch:' || worldId || ':main', worldId, '主方案', id, 1
        FROM world_document_commit AS commits
        WHERE sequence = (
          SELECT MAX(sequence) FROM world_document_commit WHERE worldId = commits.worldId
        )
        ON CONFLICT(worldId, name) DO NOTHING
      `)
      await manager.query(`
        UPDATE world_document_commit
        SET branchId = 'branch:' || worldId || ':main'
        WHERE branchId = 'main'
      `)
    }
  },
  {
    id: '20260818_world_document_merge_parent',
    up: async (manager) => {
      const columns = (await manager.query('PRAGMA table_info(world_document_commit)')) as Array<{
        name: string
      }>
      if (!columns.some((column) => column.name === 'mergeParentCommitId')) {
        await manager.query(
          'ALTER TABLE world_document_commit ADD COLUMN mergeParentCommitId text NULL'
        )
      }
    }
  },
  {
    id: '20260819_world_document_integrity_cache',
    up: async (manager) => {
      await manager.query(`
        CREATE TABLE IF NOT EXISTS world_document_integrity_cache (
          worldId text PRIMARY KEY NOT NULL,
          generation integer NOT NULL DEFAULT 0,
          verifiedGeneration integer NOT NULL DEFAULT -1,
          reportJson text NULL,
          verifiedAt datetime NULL,
          updatedAt datetime NOT NULL DEFAULT (datetime('now'))
        )
      `)
      const directTables = [
        'world_document_content_version',
        'world_document_commit',
        'world_document_change',
        'world_document_branch',
        'world_document_checkpoint'
      ]
      for (const table of directTables) {
        for (const operation of ['INSERT', 'UPDATE', 'DELETE'] as const) {
          const row = operation === 'DELETE' ? 'OLD' : 'NEW'
          const trigger = `TRG_${table}_integrity_${operation.toLowerCase()}`
          await manager.query(`
            CREATE TRIGGER IF NOT EXISTS ${trigger}
            AFTER ${operation} ON ${table}
            BEGIN
              INSERT INTO world_document_integrity_cache (
                worldId, generation, verifiedGeneration, reportJson, verifiedAt, updatedAt
              ) VALUES (${row}.worldId, 1, -1, NULL, NULL, datetime('now'))
              ON CONFLICT(worldId) DO UPDATE SET
                generation = generation + 1,
                reportJson = NULL,
                verifiedAt = NULL,
                updatedAt = datetime('now');
            END
          `)
        }
      }
      for (const operation of ['UPDATE', 'DELETE'] as const) {
        const trigger = `TRG_world_document_tree_object_integrity_${operation.toLowerCase()}`
        await manager.query(`
          CREATE TRIGGER IF NOT EXISTS ${trigger}
          AFTER ${operation} ON world_document_tree_object
          BEGIN
            UPDATE world_document_integrity_cache SET
              generation = generation + 1,
              reportJson = NULL,
              verifiedAt = NULL,
              updatedAt = datetime('now');
          END
        `)
      }
    }
  },
  {
    id: '20260819_world_document_change_content_refs',
    up: async (manager) => {
      const columns = (await manager.query('PRAGMA table_info(world_document_change)')) as Array<{
        name: string
      }>
      const names = new Set(columns.map((column) => column.name))
      if (!names.has('beforeContentVersionId')) {
        await manager.query(
          'ALTER TABLE world_document_change ADD COLUMN beforeContentVersionId text NULL'
        )
      }
      if (!names.has('afterContentVersionId')) {
        await manager.query(
          'ALTER TABLE world_document_change ADD COLUMN afterContentVersionId text NULL'
        )
      }
      const changes = (await manager.query(`
        SELECT id, worldId, documentId, beforeStateJson, afterStateJson,
               beforeSourceFormat, beforeContentSource, sourceFormat, contentSource
        FROM world_document_change
        WHERE (beforeSourceFormat IS NOT NULL AND beforeContentVersionId IS NULL)
           OR (sourceFormat IS NOT NULL AND afterContentVersionId IS NULL)
      `)) as Array<{
        id: string
        worldId: string
        documentId: string
        beforeStateJson: string | null
        afterStateJson: string | null
        beforeSourceFormat: 'markdown' | 'html_editor' | null
        beforeContentSource: string | null
        sourceFormat: 'markdown' | 'html_editor' | null
        contentSource: string | null
      }>
      const ensureContent = async (
        change: (typeof changes)[number],
        side: 'before' | 'after'
      ): Promise<string | null> => {
        const format = side === 'before' ? change.beforeSourceFormat : change.sourceFormat
        if (!format) return null
        const content =
          (side === 'before' ? change.beforeContentSource : change.contentSource) ?? ''
        const id = `content:${createHash('sha256')
          .update(`${change.documentId}\u0000${format}\u0000${content}`, 'utf8')
          .digest('hex')}`
        const stateJson = side === 'before' ? change.beforeStateJson : change.afterStateJson
        const revision = stateJson
          ? Number((JSON.parse(stateJson) as { revision?: number }).revision) || 1
          : 1
        const contentHash = createHash('sha256')
          .update(`${format}\u0000${content}`, 'utf8')
          .digest('hex')
        await manager.query(
          `INSERT OR IGNORE INTO world_document_content_version
           (id, worldId, documentId, sourceRevision, sourceFormat, contentSource, contentHash, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [id, change.worldId, change.documentId, revision, format, content, contentHash]
        )
        return id
      }
      for (const change of changes) {
        const beforeId = await ensureContent(change, 'before')
        const afterId = await ensureContent(change, 'after')
        await manager.query(
          `UPDATE world_document_change
           SET beforeContentVersionId = COALESCE(beforeContentVersionId, ?),
               afterContentVersionId = COALESCE(afterContentVersionId, ?),
               beforeSourceFormat = NULL,
               beforeContentSource = NULL,
               sourceFormat = NULL,
               contentSource = NULL
           WHERE id = ?`,
          [beforeId, afterId, change.id]
        )
      }
    }
  },
  {
    id: '20260819_application_schema_indexes',
    up: async (manager) => {
      for (const sql of APPLICATION_SCHEMA_BASELINE_INDEX_SQL) await manager.query(sql)
    }
  },
  {
    id: '20260819_remove_duplicate_document_indexes',
    up: async (manager) => {
      for (const name of [
        'IDX_world_document_checkpoint_world_name',
        'IDX_world_document_checkpoint_world_updated',
        'IDX_world_document_branch_world_name',
        'IDX_world_document_branch_world_active'
      ]) {
        await manager.query(`DROP INDEX IF EXISTS ${name}`)
      }
    }
  },
  {
    id: '20260821_agent_world_cognition',
    up: async (manager) => {
      await manager.query(`
        CREATE TABLE IF NOT EXISTS agent_world_cognition_space (
          id text PRIMARY KEY NOT NULL,
          agentId text NOT NULL,
          worldId text NOT NULL,
          revision integer NOT NULL DEFAULT 0,
          createdAt datetime NOT NULL DEFAULT (datetime('now')),
          updatedAt datetime NOT NULL DEFAULT (datetime('now'))
        )
      `)
      await manager.query(`
        CREATE TABLE IF NOT EXISTS agent_world_cognition_node (
          id text PRIMARY KEY NOT NULL,
          spaceId text NOT NULL,
          parentId text NULL,
          nodeKind text NOT NULL,
          title text NOT NULL,
          markdown text NOT NULL DEFAULT '',
          documentRefsJson text NOT NULL DEFAULT '[]',
          revision integer NOT NULL DEFAULT 1,
          status text NOT NULL DEFAULT 'available',
          createdAt datetime NOT NULL DEFAULT (datetime('now')),
          updatedAt datetime NOT NULL DEFAULT (datetime('now'))
        )
      `)
      await manager.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS IDX_agent_world_cognition_space_owner ON agent_world_cognition_space (agentId, worldId)'
      )
      await manager.query(
        'CREATE INDEX IF NOT EXISTS IDX_agent_world_cognition_node_space_parent ON agent_world_cognition_node (spaceId, parentId)'
      )
      await manager.query(
        'CREATE INDEX IF NOT EXISTS IDX_agent_world_cognition_node_space_title ON agent_world_cognition_node (spaceId, title)'
      )
      await manager.query(
        'CREATE INDEX IF NOT EXISTS IDX_agent_world_cognition_node_space_status ON agent_world_cognition_node (spaceId, status)'
      )
    }
  },
  {
    id: '20260821_agent_world_cognition_document_invalidation',
    up: async (manager) => {
      await manager.query(`
        CREATE TRIGGER IF NOT EXISTS TRG_world_document_cognition_revision
        AFTER UPDATE OF revision ON world_entity_document_record
        WHEN NEW.revision <> OLD.revision
        BEGIN
          UPDATE agent_world_cognition_space
          SET revision = revision + 1,
              updatedAt = datetime('now')
          WHERE id IN (
            SELECT DISTINCT node.spaceId
            FROM agent_world_cognition_node AS node,
                 json_each(
                   CASE WHEN json_valid(node.documentRefsJson)
                     THEN node.documentRefsJson ELSE '[]' END
                 ) AS ref
            WHERE node.status = 'available'
              AND json_extract(ref.value, '$.documentId') = NEW.id
              AND CAST(json_extract(ref.value, '$.revision') AS integer) <> NEW.revision
          );

          UPDATE agent_world_cognition_node
          SET status = 'needs_review',
              revision = revision + 1,
              updatedAt = datetime('now')
          WHERE status = 'available'
            AND json_valid(documentRefsJson)
            AND EXISTS (
              SELECT 1
              FROM json_each(
                CASE WHEN json_valid(documentRefsJson)
                  THEN documentRefsJson ELSE '[]' END
              ) AS ref
              WHERE json_extract(ref.value, '$.documentId') = NEW.id
                AND CAST(json_extract(ref.value, '$.revision') AS integer) <> NEW.revision
            );
        END
      `)
      await manager.query(`
        CREATE TRIGGER IF NOT EXISTS TRG_world_document_cognition_delete
        AFTER DELETE ON world_entity_document_record
        BEGIN
          UPDATE agent_world_cognition_space
          SET revision = revision + 1,
              updatedAt = datetime('now')
          WHERE id IN (
            SELECT DISTINCT node.spaceId
            FROM agent_world_cognition_node AS node,
                 json_each(
                   CASE WHEN json_valid(node.documentRefsJson)
                     THEN node.documentRefsJson ELSE '[]' END
                 ) AS ref
            WHERE node.status = 'available'
              AND json_extract(ref.value, '$.documentId') = OLD.id
          );

          UPDATE agent_world_cognition_node
          SET status = 'needs_review',
              revision = revision + 1,
              updatedAt = datetime('now')
          WHERE status = 'available'
            AND json_valid(documentRefsJson)
            AND EXISTS (
              SELECT 1
              FROM json_each(
                CASE WHEN json_valid(documentRefsJson)
                  THEN documentRefsJson ELSE '[]' END
              ) AS ref
              WHERE json_extract(ref.value, '$.documentId') = OLD.id
            );
        END
      `)
    }
  },
  {
    id: '20260822_self_experience',
    up: async (manager) => {
      await manager.query(`
        CREATE TABLE IF NOT EXISTS self_experience (
          id text PRIMARY KEY NOT NULL,
          eventId text NOT NULL UNIQUE,
          turnId integer NOT NULL,
          sessionId text NOT NULL DEFAULT 'default',
          kind text NOT NULL,
          summary text NOT NULL DEFAULT '',
          understanding text NOT NULL DEFAULT '',
          selfPosition text NOT NULL DEFAULT '',
          personalMeaning text NOT NULL DEFAULT '',
          stance text NOT NULL DEFAULT '',
          relationshipMeaning text NOT NULL DEFAULT '',
          selfNarrative text NOT NULL DEFAULT '',
          commitmentUpdatesJson text NOT NULL DEFAULT '[]',
          concernUpdatesJson text NOT NULL DEFAULT '[]',
          evidenceRefsJson text NOT NULL DEFAULT '[]',
          confidence real NOT NULL DEFAULT 0.5,
          revision integer NOT NULL DEFAULT 1,
          supersedesExperienceId text NULL,
          occurredAt text NOT NULL,
          createdAt datetime NOT NULL DEFAULT (datetime('now'))
        )
      `)
      await manager.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS IDX_self_experience_turn ON self_experience (turnId)'
      )
      await manager.query(
        'CREATE INDEX IF NOT EXISTS IDX_self_experience_created ON self_experience (createdAt)'
      )
    }
  }
]

export const runAppSchemaMigrations = async (dataSource: DataSource): Promise<void> => {
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS app_schema_migration (
      id text PRIMARY KEY NOT NULL,
      appliedAt datetime NOT NULL DEFAULT (datetime('now'))
    )
  `)

  for (const migration of migrations) {
    const applied = (await dataSource.query(
      'SELECT id FROM app_schema_migration WHERE id = ? LIMIT 1',
      [migration.id]
    )) as Array<{ id: string }>
    if (applied.length > 0) continue

    await dataSource.transaction(async (manager) => {
      await migration.up(manager)
      await manager.query('INSERT INTO app_schema_migration (id) VALUES (?)', [migration.id])
    })
  }
}
