import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('worldContent')
export class WorldContent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // 关联的世界ID（通过应用逻辑维护关系，不使用外键）
  @Column({ type: 'varchar', length: 255 })
  worldId!: string;

  // 世界文本内容
  @Column({ type: 'json', nullable: true })
  text?: {
    description?: string;
    background?: string;
    rules?: string;
    notes?: string;
  };

  // 时间线数据
  @Column({ type: 'json', nullable: true })
  timeline?: any[];

  // 地理数据
  @Column({ type: 'json', nullable: true })
  geography?: any[];

  // 国家数据
  @Column({ type: 'json', nullable: true })
  nations?: any[];

  // 势力数据
  @Column({ type: 'json', nullable: true })
  factions?: any[];

  // 力量体系数据
  @Column({ type: 'json', nullable: true })
  powerSystems?: any[];

  // 角色数据
  @Column({ type: 'json', nullable: true })
  characters?: any[];

  // 地图数据
  @Column({ type: 'json', nullable: true })
  maps?: any[];

  // 关系数据
  @Column({ type: 'json', nullable: true })
  relationships?: any[];

  // 物品数据
  @Column({ type: 'json', nullable: true })
  items?: any[];

  // 事件数据
  @Column({ type: 'json', nullable: true })
  events?: any[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}