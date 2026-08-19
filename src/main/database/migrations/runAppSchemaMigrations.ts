import type { DataSource, EntityManager } from 'typeorm'

type AppSchemaMigration = {
  id: string
  up: (manager: EntityManager) => Promise<void>
}

const migrations: AppSchemaMigration[] = [
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
      const columns = (await manager.query(
        'PRAGMA table_info(world_document_commit)'
      )) as Array<{ name: string }>
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
