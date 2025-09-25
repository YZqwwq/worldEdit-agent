import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';


/**
 * 世界观实体
 * @param(id) 世界观ID
 * @param(name) 世界观名称
 * @param(description) 世界观描述
 * @param(thumbnail) 世界观缩略图
 * @param(tags) 世界观标签
 * @param(author) 世界观作者
 * @param(parentId) 世界观父ID
 * @param(version) 世界观版本
 * @param(createdAt) 世界观创建时间
 * @param(updatedAt) 世界观更新时间
 * @param(lastModified) 世界观最近修改时间
 * @param(type) 世界观类型
 * @param(background) 世界观背景
 * @param(rules) 世界观规则
 * @param(notes) 世界观备注
 * @param(isActive) 世界观是否激活
 * @param(filePath) 世界观文件路径
 */
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

}