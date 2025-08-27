import { DataSource } from 'typeorm';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { entities } from '../entities';

// 获取数据库路径
function getDatabasePath(): string {
  const userDataPath = app.getPath('userData');
  const dataDir = path.join(userDataPath, 'data');
  
  // 确保数据目录存在
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  return path.join(dataDir, 'world.db');
}

// TypeORM数据源配置
export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: getDatabasePath(),
  entities: entities,
  synchronize: true, // 开发环境自动同步表结构
  logging: process.env.NODE_ENV === 'development', // 开发环境启用日志
  migrations: [],
  subscribers: [],
});

// 导出便捷函数
export const initializeDataSource = async (): Promise<void> => {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
    console.log('数据库连接已建立');
  }
};

export const closeDataSource = async (): Promise<void> => {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
    console.log('数据库连接已关闭');
  }
};

export const getDataSource = () => {
  return AppDataSource;
};

export const getWorldRepository = () => {
  return AppDataSource.getRepository('World');
};

export const getWorldContentRepository = () => {
  return AppDataSource.getRepository('WorldContent');
};