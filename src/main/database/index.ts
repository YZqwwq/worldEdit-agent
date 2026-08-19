import { DataSource } from 'typeorm'
import { app } from 'electron'
import { join } from 'node:path'
import { applicationEntities } from './applicationEntities'
import { migrateWorldEntityDocuments } from './migrations/migrateWorldEntityDocuments'
import { runAppSchemaMigrations } from './migrations/runAppSchemaMigrations'

// 数据库文件路径：UserData/database.sqlite
const dbPath = join(app.getPath('userData'), 'database.sqlite')

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: dbPath,
  synchronize: false,
  logging: false,
  entities: applicationEntities,
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
