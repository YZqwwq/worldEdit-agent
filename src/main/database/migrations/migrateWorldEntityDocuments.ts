import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'

const LEGACY_TABLE_NAME = 'character_narrative_document_record'
const TARGET_TABLE_NAME = 'world_entity_document_record'
const UPGRADE_TABLE_NAME = 'world_entity_document_record_world_v3'
const BACKUP_SUFFIX = '.world-document-library-v3.temp.json'

const VERSION_TABLES = [
  'world_document_change',
  'world_document_checkpoint',
  'world_document_branch',
  'world_document_commit',
  'world_document_tree_object',
  'world_document_content_version',
  'world_document_integrity_cache'
] as const

type SqliteRow = Record<string, unknown>

type LegacyDocumentRow = {
  id: string
  ownerKind: 'world' | 'entity'
  worldId: string
  ownerEntityId: string | null
  parentDocumentId: string | null
  title: string
  contentHtml: string
  contentFormat: string
  sortKey: string
  revision: number
  schemaVersion: number
  createdAt: string
  updatedAt: string
}

type MigratedDocumentRow = Omit<LegacyDocumentRow, 'ownerKind' | 'ownerEntityId'>

interface WorldDocumentLibraryBackup {
  migration: 'world-document-library-v3'
  createdAt: string
  tables: Record<string, SqliteRow[]>
}

const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`

const tableExists = (database: Database.Database, tableName: string): boolean =>
  Boolean(
    database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1")
      .get(tableName)
  )

const getTableColumns = (database: Database.Database, tableName: string): string[] =>
  (
    database.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as Array<{
      name: string
    }>
  ).map((column) => column.name)

const readRows = (database: Database.Database, tableName: string): SqliteRow[] =>
  database.prepare(`SELECT * FROM ${quoteIdentifier(tableName)}`).all() as SqliteRow[]

const stringValue = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

const nullableString = (value: unknown): string | null => {
  const normalized = stringValue(value).trim()
  return normalized || null
}

const numberValue = (value: unknown, fallback: number): number => {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? normalized : fallback
}

const folderId = (worldId: string, entityId: string): string =>
  `document-folder:${createHash('sha256')
    .update(`${worldId}\u0000${entityId}`, 'utf8')
    .digest('hex')}`

const readEntityIndex = (
  database: Database.Database
): Map<string, { worldId: string; name: string; createdAt: string; updatedAt: string }> => {
  if (!tableExists(database, 'world_entity_record')) return new Map()
  const rows = database
    .prepare('SELECT id, worldId, name, createdAt, updatedAt FROM world_entity_record')
    .all() as SqliteRow[]
  return new Map(
    rows.map((row) => [
      stringValue(row.id),
      {
        worldId: stringValue(row.worldId),
        name: stringValue(row.name),
        createdAt: stringValue(row.createdAt),
        updatedAt: stringValue(row.updatedAt)
      }
    ])
  )
}

const normalizeSourceRows = (
  rows: SqliteRow[],
  sourceTable: string,
  entities: ReturnType<typeof readEntityIndex>
): LegacyDocumentRow[] =>
  rows.map((row) => {
    const entityId = nullableString(row.ownerEntityId ?? row.characterEntityId)
    const entity = entityId ? entities.get(entityId) : undefined
    const worldId = stringValue(row.worldId) || entity?.worldId || ''
    if (!worldId) {
      throw new Error(`Cannot resolve worldId for document ${stringValue(row.id)} in ${sourceTable}`)
    }
    const ownerKind = row.ownerKind === 'world' ? 'world' : 'entity'
    return {
      id: stringValue(row.id),
      ownerKind,
      worldId,
      ownerEntityId: ownerKind === 'entity' ? entityId : null,
      parentDocumentId: nullableString(row.parentDocumentId),
      title: stringValue(row.title, '新建文件'),
      contentHtml: stringValue(row.contentHtml),
      contentFormat: stringValue(row.contentFormat, 'html'),
      sortKey: stringValue(row.sortKey),
      revision: numberValue(row.revision, 1),
      schemaVersion: numberValue(row.schemaVersion, 1),
      createdAt: stringValue(row.createdAt),
      updatedAt: stringValue(row.updatedAt)
    }
  })

const buildMigratedRows = (
  sourceRows: LegacyDocumentRow[],
  entities: ReturnType<typeof readEntityIndex>
): MigratedDocumentRow[] => {
  const folders = new Map<string, MigratedDocumentRow>()
  const migrated = sourceRows.map(({ ownerKind, ownerEntityId, ...row }) => {
    if (ownerKind !== 'entity' || !ownerEntityId) return row
    const id = folderId(row.worldId, ownerEntityId)
    if (!folders.has(id)) {
      const entity = entities.get(ownerEntityId)
      const timestamp = entity?.createdAt || row.createdAt
      folders.set(id, {
        id,
        worldId: row.worldId,
        parentDocumentId: null,
        title: entity?.name || `已删除实例 ${ownerEntityId.slice(0, 8)}`,
        contentHtml: '',
        contentFormat: 'html',
        sortKey: `legacy-entity:${entity?.name || ownerEntityId}:${ownerEntityId}`,
        revision: 1,
        schemaVersion: 1,
        createdAt: timestamp,
        updatedAt: entity?.updatedAt || row.updatedAt
      })
    }
    return {
      ...row,
      parentDocumentId: row.parentDocumentId ?? id
    }
  })
  return [...folders.values(), ...migrated]
}

const assertDocumentTree = (rows: MigratedDocumentRow[], sourceCount: number): void => {
  const byId = new Map(rows.map((row) => [row.id, row]))
  if (byId.size !== rows.length) throw new Error('World document migration produced duplicate IDs')
  if (rows.length < sourceCount) throw new Error('World document migration lost documents')

  for (const row of rows) {
    if (!row.id || !row.worldId) throw new Error('Migrated document is missing id or worldId')
    if (!row.parentDocumentId) continue
    const parent = byId.get(row.parentDocumentId)
    if (!parent || parent.worldId !== row.worldId) {
      throw new Error(`Migrated document has an invalid parent: ${row.id}`)
    }
    const visited = new Set<string>([row.id])
    let cursor: MigratedDocumentRow | undefined = parent
    while (cursor) {
      if (visited.has(cursor.id)) throw new Error(`Migrated document tree contains a cycle: ${row.id}`)
      visited.add(cursor.id)
      cursor = cursor.parentDocumentId ? byId.get(cursor.parentDocumentId) : undefined
    }
  }
}

const writeBackup = (database: Database.Database, backupPath: string): void => {
  const tableNames = [LEGACY_TABLE_NAME, TARGET_TABLE_NAME, ...VERSION_TABLES]
  const tables = Object.fromEntries(
    tableNames
      .filter((tableName) => tableExists(database, tableName))
      .map((tableName) => [tableName, readRows(database, tableName)])
  )
  const backup: WorldDocumentLibraryBackup = {
    migration: 'world-document-library-v3',
    createdAt: new Date().toISOString(),
    tables
  }
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), { encoding: 'utf8', flag: 'w' })
}

const createFinalTable = (database: Database.Database): void => {
  database.prepare(`DROP TABLE IF EXISTS ${quoteIdentifier(UPGRADE_TABLE_NAME)}`).run()
  database.prepare(`
    CREATE TABLE ${quoteIdentifier(UPGRADE_TABLE_NAME)} (
      id text PRIMARY KEY NOT NULL,
      worldId text NOT NULL,
      parentDocumentId text,
      title text NOT NULL DEFAULT '新建文件',
      contentHtml text NOT NULL DEFAULT '',
      contentFormat text NOT NULL DEFAULT 'html',
      sortKey text NOT NULL DEFAULT '',
      revision integer NOT NULL DEFAULT 1,
      schemaVersion integer NOT NULL DEFAULT 1,
      createdAt datetime NOT NULL DEFAULT (datetime('now')),
      updatedAt datetime NOT NULL DEFAULT (datetime('now'))
    )
  `).run()
}

const insertMigratedRows = (
  database: Database.Database,
  rows: MigratedDocumentRow[]
): void => {
  const insert = database.prepare(`
    INSERT INTO ${quoteIdentifier(UPGRADE_TABLE_NAME)} (
      id, worldId, parentDocumentId, title, contentHtml, contentFormat,
      sortKey, revision, schemaVersion, createdAt, updatedAt
    ) VALUES (
      @id, @worldId, @parentDocumentId, @title, @contentHtml, @contentFormat,
      @sortKey, @revision, @schemaVersion,
      COALESCE(NULLIF(@createdAt, ''), datetime('now')),
      COALESCE(NULLIF(@updatedAt, ''), datetime('now'))
    )
  `)
  for (const row of rows) insert.run(row)
}

const resetDocumentVersionHistory = (database: Database.Database): void => {
  for (const tableName of VERSION_TABLES) {
    if (tableExists(database, tableName)) {
      database.prepare(`DELETE FROM ${quoteIdentifier(tableName)}`).run()
    }
  }
}

const assertFinalSchema = (database: Database.Database): void => {
  const columns = new Set(getTableColumns(database, TARGET_TABLE_NAME))
  if (
    !columns.has('worldId') ||
    !columns.has('revision') ||
    columns.has('ownerKind') ||
    columns.has('ownerEntityId') ||
    columns.has('characterEntityId')
  ) {
    throw new Error('World document table has not reached the world-only schema')
  }
}

export const migrateWorldEntityDocuments = (databasePath: string): void => {
  if (!existsSync(databasePath)) return

  const backupPath = `${databasePath}${BACKUP_SUFFIX}`
  const database = new Database(databasePath)
  try {
    const targetExists = tableExists(database, TARGET_TABLE_NAME)
    const legacyExists = tableExists(database, LEGACY_TABLE_NAME)
    if (targetExists && legacyExists) {
      writeBackup(database, backupPath)
      throw new Error('Both legacy and current document tables exist; migration cannot choose one safely')
    }
    const sourceTable = targetExists ? TARGET_TABLE_NAME : legacyExists ? LEGACY_TABLE_NAME : null
    if (!sourceTable) {
      if (existsSync(backupPath)) unlinkSync(backupPath)
      return
    }

    const columns = new Set(getTableColumns(database, sourceTable))
    const isFinalSchema =
      sourceTable === TARGET_TABLE_NAME &&
      columns.has('worldId') &&
      !columns.has('ownerKind') &&
      !columns.has('ownerEntityId') &&
      !columns.has('characterEntityId')
    if (isFinalSchema) {
      assertFinalSchema(database)
      if (existsSync(backupPath)) unlinkSync(backupPath)
      return
    }

    writeBackup(database, backupPath)
    const entities = readEntityIndex(database)
    const sourceRows = normalizeSourceRows(readRows(database, sourceTable), sourceTable, entities)
    const migratedRows = buildMigratedRows(sourceRows, entities)
    assertDocumentTree(migratedRows, sourceRows.length)

    database.transaction(() => {
      createFinalTable(database)
      insertMigratedRows(database, migratedRows)
      if (tableExists(database, TARGET_TABLE_NAME)) {
        database.prepare(`DROP TABLE ${quoteIdentifier(TARGET_TABLE_NAME)}`).run()
      }
      database.prepare(
        `ALTER TABLE ${quoteIdentifier(UPGRADE_TABLE_NAME)} RENAME TO ${quoteIdentifier(TARGET_TABLE_NAME)}`
      ).run()
      database.prepare(
        `CREATE INDEX IF NOT EXISTS "IDX_fd71e942d059f393bcdd591642"
         ON ${quoteIdentifier(TARGET_TABLE_NAME)} (worldId, updatedAt)`
      ).run()
      database.prepare(
        `CREATE INDEX IF NOT EXISTS "IDX_d2c2a72c33b693053b95709238"
         ON ${quoteIdentifier(TARGET_TABLE_NAME)} (worldId, parentDocumentId, sortKey)`
      ).run()
      if (sourceTable === LEGACY_TABLE_NAME && tableExists(database, LEGACY_TABLE_NAME)) {
        database.prepare(`DROP TABLE ${quoteIdentifier(LEGACY_TABLE_NAME)}`).run()
      }
      resetDocumentVersionHistory(database)
      assertFinalSchema(database)
      const persisted = readRows(database, TARGET_TABLE_NAME).map((row) => ({
        id: stringValue(row.id),
        worldId: stringValue(row.worldId),
        parentDocumentId: nullableString(row.parentDocumentId),
        title: stringValue(row.title),
        contentHtml: stringValue(row.contentHtml),
        contentFormat: stringValue(row.contentFormat),
        sortKey: stringValue(row.sortKey),
        revision: numberValue(row.revision, 1),
        schemaVersion: numberValue(row.schemaVersion, 1),
        createdAt: stringValue(row.createdAt),
        updatedAt: stringValue(row.updatedAt)
      }))
      assertDocumentTree(persisted, sourceRows.length)
    })()

    unlinkSync(backupPath)
    console.log(
      `World document library migration completed: ${sourceRows.length} documents preserved, ${migratedRows.length - sourceRows.length} folders created, version history reset.`
    )
  } finally {
    database.close()
  }
}
