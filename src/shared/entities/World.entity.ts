import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { BaseMetadata } from '../types/world';

@Entity('worlds')
export class World {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  thumbnail?: string;

  @Column({ type: 'json', nullable: true })
  tags?: string[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  author?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  parentId?: string;

  @Column({ type: 'varchar', length: 50, default: '1.0' })
  version!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @UpdateDateColumn()
  lastModified!: Date;

  @Column({ type: 'varchar', length: 50, default: 'world' })
  type!: string;

  // 世界基础设定
  @Column({ type: 'text', nullable: true })
  background?: string;

  @Column({ type: 'json', nullable: true })
  rules?: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  // 世界状态
  @Column({ type: 'boolean', default: false })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  filePath?: string;

  // 转换为BaseMetadata格式
  toBaseMetadata(): BaseMetadata {
    return {
      id: this.id,
      name: this.name,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: this.version
    };
  }

  // 从WorldData创建实例
  static fromWorldData(worldData: any): World {
    const world = new World();
    world.id = worldData.id;
    world.name = worldData.name;
    world.description = worldData.description || '';
    world.thumbnail = worldData.thumbnail;
    world.tags = worldData.tags || [];
    world.author = worldData.author || '';
    world.lastModified = worldData.lastModified || new Date();
    world.type = worldData.type || 'world';
    world.parentId = worldData.parentId;
    return world;
  }
}