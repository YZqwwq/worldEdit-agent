import Database from 'better-sqlite3'
import { existsSync, unlinkSync, writeFileSync } from 'node:fs'

const LEGACY_TABLE_NAME = 'character_narrative_document_record'
const TARGET_TABLE_NAME = 'world_entity_document_record'

type SqliteRow = Record<string, unknown>

interface WorldEntityDocumentBackup {
  migration: 'world-entity-document-v1'
  sourceTable: typeof LEGACY_TABLE_NAME
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

const writeBackup = (backupPath: string, rows: SqliteRow[]): void => {
  const backup: WorldEntityDocumentBackup = {
    migration: 'world-entity-document-v1',
    sourceTable: LEGACY_TABLE_NAME,
    createdAt: new Date().toISOString(),
    rows
  }
  writeFileSync(backupPath, JSON.stringify(backup, null, 2), { encoding: 'utf8', flag: 'w' })
}

const assertTargetSchema = (database: Database.Database): void => {
  const columns = new Set(getTableColumns(database, TARGET_TABLE_NAME))
  if (!columns.has('ownerEntityId') || columns.has('characterEntityId')) {
    throw new Error('World entity document table exists with an unexpected owner column')
  }
}

export const migrateWorldEntityDocuments = (databasePath: string): void => {
  if (!existsSync(databasePath)) return

  const backupPath = `${databasePath}.world-entity-document-migration.temp.json`
  const database = new Database(databasePath)

  try {
    const legacyExists = tableExists(database, LEGACY_TABLE_NAME)
    const targetExists = tableExists(database, TARGET_TABLE_NAME)

    if (!legacyExists) {
      if (targetExists) assertTargetSchema(database)
      if (existsSync(backupPath)) unlinkSync(backupPath)
      return
    }

    if (targetExists) {
      throw new Error(
        'Both legacy and target world entity document tables exist; refusing to merge automatically'
      )
    }

    const legacyRows = readRows(database, LEGACY_TABLE_NAME)
    writeBackup(backupPath, legacyRows)

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

    assertTargetSchema(database)
    assertMigratedRowsMatch(legacyRows, readRows(database, TARGET_TABLE_NAME))
    unlinkSync(backupPath)
    console.log(
      `World entity document migration completed: ${legacyRows.length} rows migrated and temporary backup removed.`
    )
  } finally {
    database.close()
  }
}
