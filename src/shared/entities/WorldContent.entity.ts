import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { UnifiedWorldData } from '../types/world';

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

  // 转换为UnifiedWorldData格式
  toUnifiedWorldData(): UnifiedWorldData {
    return {
      id: this.id,
      name: '',
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      version: '1.0.0',
      description: '',
      thumbnail: undefined,
      tags: [],
      author: '',
      lastModified: this.updatedAt,
      timeline: this.timeline || [],
      geography: this.geography || [],
      nations: this.nations || [],
      factions: this.factions || [],
      powerSystems: this.powerSystems || [],
      characters: this.characters || [],
      maps: this.maps || [],
      relationships: this.relationships || [],
      items: this.items || [],
      events: this.events || []
    };
  }

  // 从UnifiedWorldData创建实体
  static fromUnifiedWorldData(worldId: string, data: UnifiedWorldData): Partial<WorldContent> {
    return {
      worldId,
      timeline: data.timeline,
      geography: data.geography,
      nations: data.nations,
      factions: data.factions,
      powerSystems: data.powerSystems,
      characters: data.characters,
      maps: data.maps,
      relationships: data.relationships,
      items: data.items,
      events: data.events
    };
  }

  // 更新内容数据
  updateContent(data: Partial<UnifiedWorldData>): void {
    if (data.timeline !== undefined) this.timeline = data.timeline;
    if (data.geography !== undefined) this.geography = data.geography;
    if (data.nations !== undefined) this.nations = data.nations;
    if (data.factions !== undefined) this.factions = data.factions;
    if (data.powerSystems !== undefined) this.powerSystems = data.powerSystems;
    if (data.characters !== undefined) this.characters = data.characters;
    if (data.maps !== undefined) this.maps = data.maps;
    if (data.relationships !== undefined) this.relationships = data.relationships;
  }
}