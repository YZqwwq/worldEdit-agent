import { DataSource } from 'typeorm'
import { app } from 'electron'
import { join } from 'node:path'
import { Message } from '../../share/entity/database/Message'

// 数据库文件路径：UserData/database.sqlite
const dbPath = join(app.getPath('userData'), 'database.sqlite')

export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: dbPath,
  synchronize: true, // 开发阶段自动同步 schema，生产环境建议配合 migration
  logging: false,
  entities: [Message],
  subscribers: [],
  migrations: []
})

export const initDatabase = async (): Promise<void> => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize()
      console.log('Data Source has been initialized!')
      console.log('Database path:', dbPath)
    }
  } catch (err) {
    console.error('Error during Data Source initialization:', err)
    throw err
  }
}
