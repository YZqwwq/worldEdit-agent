import Database from 'better-sqlite3'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'

const LEGACY_TABLE_NAME = 'character_narrative_document_record'
const TARGET_TABLE_NAME = 'world_entity_document_record'
const UPGRADE_TABLE_NAME = 'world_entity_document_record_v2'

type SqliteRow = Record<string, unknown>

interface WorldEntityDocumentBackup {
  migration: 'world-entity-document-v1' | 'world-entity-document-owner-v2'
  sourceTable: string
  createdAt: string
  rows: SqliteRow[]
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
  database
    .prepare(`SELECT * FROM ${quoteIdentifier(tableName)} ORDER BY id ASC`)
    .all() as SqliteRow[]

const normalizeLegacyRows = (rows: SqliteRow[]): SqliteRow[] =>
  rows.map(({ characterEntityId, ...row }) => ({
    ...row,
    ownerEntityId: characterEntityId
  }))

const stableSerializeRows = (rows: SqliteRow[]): string =>
  JSON.stringify(
    rows.map((row) =>
      Object.fromEntries(Object.entries(row).sort(([left], [right]) => left.localeCompare(right)))
    )
  )

const assertMigratedRowsMatch = (
  legacyRows: SqliteRow[],
  migratedRows: SqliteRow[]
): void => {
  const expected = normalizeLegacyRows(legacyRows)
  if (stableSerializeRows(expected) !== stableSerializeRows(migratedRows)) {
    throw new Error(
      `World entity document migration validation failed: expected ${expected.length} rows, received ${migratedRows.length}`
    )
  }
}

const writeBackup = (
  backupPath: string,
  migration: WorldEntityDocumentBackup['migration'],
  sourceTable: string,
  rows: SqliteRow[]
): void => {
  const backup: WorldEntityDocumentBackup = {
    migration,
    sourceTable,
    createdAt: new Date().toISOString(),
    rows
  }
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), { encoding: 'utf8', flag: 'w' })
}

const assertTargetSchema = (database: Database.Database): void => {
  const columns = new Set(getTableColumns(database, TARGET_TABLE_NAME))
  if (
    !columns.has('ownerKind') ||
    !columns.has('worldId') ||
    !columns.has('ownerEntityId') ||
    !columns.has('revision') ||
    columns.has('characterEntityId')
  ) {
    throw new Error('World entity document table exists with an unexpected owner column')
  }
}

const ensureDocumentRevisionSchema = (database: Database.Database): void => {
  const columns = new Set(getTableColumns(database, TARGET_TABLE_NAME))
  if (columns.has('revision')) return
  database
    .prepare(
      `ALTER TABLE ${quoteIdentifier(TARGET_TABLE_NAME)}
       ADD COLUMN revision integer NOT NULL DEFAULT 1`
    )
    .run()
}

const upgradeDocumentOwnerSchema = (
  database: Database.Database,
  backupPath: string
): void => {
  const columns = new Set(getTableColumns(database, TARGET_TABLE_NAME))
  if (columns.has('ownerKind') && columns.has('worldId')) {
    assertTargetSchema(database)
    return
  }
  if (!columns.has('ownerEntityId')) {
    throw new Error('Cannot upgrade world entity documents without ownerEntityId')
  }

  const missingWorldRows = database
    .prepare(
      `SELECT d.id
       FROM ${quoteIdentifier(TARGET_TABLE_NAME)} d
       LEFT JOIN ${quoteIdentifier('world_entity_record')} e ON e.id = d.ownerEntityId
       WHERE e.worldId IS NULL
       LIMIT 1`
    )
    .get()
  if (missingWorldRows) {
    throw new Error('Cannot resolve the world for one or more existing entity documents')
  }

  const rows = readRows(database, TARGET_TABLE_NAME)
  writeBackup(
    backupPath,
    'world-entity-document-owner-v2',
    TARGET_TABLE_NAME,
    rows
  )

  database.transaction(() => {
    database.prepare(`DROP TABLE IF EXISTS ${quoteIdentifier(UPGRADE_TABLE_NAME)}`).run()
    database
      .prepare(
        `CREATE TABLE ${quoteIdentifier(UPGRADE_TABLE_NAME)} (
          id text PRIMARY KEY NOT NULL,
          ownerKind text NOT NULL DEFAULT 'entity',
          worldId text NOT NULL,
          ownerEntityId text,
          parentDocumentId text,
          title text NOT NULL DEFAULT '新建文件',
          contentHtml text NOT NULL DEFAULT '',
          contentFormat text NOT NULL DEFAULT 'html',
          sortKey text NOT NULL DEFAULT '',
          revision integer NOT NULL DEFAULT 1,
          schemaVersion integer NOT NULL DEFAULT 1,
          createdAt datetime NOT NULL DEFAULT (datetime('now')),
          updatedAt datetime NOT NULL DEFAULT (datetime('now'))
        )`
      )
      .run()
    database
      .prepare(
        `INSERT INTO ${quoteIdentifier(UPGRADE_TABLE_NAME)} (
          id, ownerKind, worldId, ownerEntityId, parentDocumentId, title,
          contentHtml, contentFormat, sortKey, revision, schemaVersion, createdAt, updatedAt
        )
        SELECT
          d.id, 'entity', e.worldId, d.ownerEntityId, d.parentDocumentId, d.title,
          d.contentHtml, d.contentFormat, d.sortKey, d.revision, d.schemaVersion, d.createdAt, d.updatedAt
        FROM ${quoteIdentifier(TARGET_TABLE_NAME)} d
        INNER JOIN ${quoteIdentifier('world_entity_record')} e ON e.id = d.ownerEntityId`
      )
      .run()
    database.prepare(`DROP TABLE ${quoteIdentifier(TARGET_TABLE_NAME)}`).run()
    database
      .prepare(
        `ALTER TABLE ${quoteIdentifier(UPGRADE_TABLE_NAME)} RENAME TO ${quoteIdentifier(TARGET_TABLE_NAME)}`
      )
      .run()
  })()

  assertTargetSchema(database)
  const migratedCount = readRows(database, TARGET_TABLE_NAME).length
  if (migratedCount !== rows.length) {
    throw new Error(
      `World entity document owner migration validation failed: expected ${rows.length} rows, received ${migratedCount}`
    )
  }
  unlinkSync(backupPath)
  console.log(
    `World entity document owner migration completed: ${rows.length} rows upgraded and temporary backup removed.`
  )
}

export const migrateWorldEntityDocuments = (databasePath: string): void => {
  if (!existsSync(databasePath)) return

  const backupPath = `${databasePath}.world-entity-document-migration.temp.json`
  const database = new Database(databasePath)

  try {
    const legacyExists = tableExists(database, LEGACY_TABLE_NAME)
    const targetExists = tableExists(database, TARGET_TABLE_NAME)

    if (!legacyExists) {
      if (targetExists) {
        ensureDocumentRevisionSchema(database)
        upgradeDocumentOwnerSchema(database, backupPath)
      }
      if (existsSync(backupPath)) unlinkSync(backupPath)
      return
    }

    if (targetExists) {
      throw new Error(
        'Both legacy and target world entity document tables exist; refusing to merge automatically'
      )
    }

    const legacyRows = readRows(database, LEGACY_TABLE_NAME)
    writeBackup(
      backupPath,
      'world-entity-document-v1',
      LEGACY_TABLE_NAME,
      legacyRows
    )

    database.transaction(() => {
      database
        .prepare(
          `ALTER TABLE ${quoteIdentifier(LEGACY_TABLE_NAME)} RENAME TO ${quoteIdentifier(TARGET_TABLE_NAME)}`
        )
        .run()
      database
        .prepare(
          `ALTER TABLE ${quoteIdentifier(TARGET_TABLE_NAME)} RENAME COLUMN ${quoteIdentifier('characterEntityId')} TO ${quoteIdentifier('ownerEntityId')}`
        )
        .run()
    })()

    assertMigratedRowsMatch(legacyRows, readRows(database, TARGET_TABLE_NAME))
    console.log(
      `World entity document migration completed: ${legacyRows.length} rows migrated.`
    )
    ensureDocumentRevisionSchema(database)
    upgradeDocumentOwnerSchema(database, backupPath)
  } finally {
    database.close()
  }
}
