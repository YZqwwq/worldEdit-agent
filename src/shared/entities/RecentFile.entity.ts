import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('recentFiles')
export class RecentFile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 1000 })
  path!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  type?: string; // world, project, document等

  @Column({ type: 'integer', nullable: true })
  size?: number; // 文件大小（字节）

  @Column({ type: 'datetime' })
  lastOpened!: Date;

  @Column({ type: 'datetime', nullable: true })
  lastModified?: Date;

  // 文件元数据
  @Column({ type: 'json', nullable: true })
  metadata?: {
    worldId?: string;
    worldName?: string;
    author?: string;
    version?: string;
    tags?: string[];
    description?: string;
  };

  // 访问统计
  @Column({ type: 'integer', default: 1 })
  accessCount!: number;

  // 文件状态
  @Column({ type: 'boolean', default: true })
  exists!: boolean;

  @Column({ type: 'boolean', default: false })
  isFavorite!: boolean;

  // 缩略图或预览
  @Column({ type: 'varchar', length: 1000, nullable: true })
  thumbnailPath?: string;

  @Column({ type: 'text', nullable: true })
  preview?: string; // 文件内容预览

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // 更新访问信息
  updateAccess(): void {
    this.lastOpened = new Date();
    this.accessCount += 1;
  }

  // 检查文件是否存在
  checkExists(): boolean {
    // 这里可以添加文件系统检查逻辑
    // 目前返回存储的状态
    return this.exists;
  }

  // 获取文件扩展名
  getExtension(): string {
    const parts = this.path.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  }

  // 获取文件目录
  getDirectory(): string {
    const lastSlash = Math.max(this.path.lastIndexOf('/'), this.path.lastIndexOf('\\'));
    return lastSlash > 0 ? this.path.substring(0, lastSlash) : '';
  }

  // 格式化文件大小
  getFormattedSize(): string {
    if (!this.size) return 'Unknown';
    
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = this.size;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}