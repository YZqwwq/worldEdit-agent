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

  /**
   * 更新内容
   */
  updateContent(content: any): void {
    if (content.text) this.text = content.text;
    if (content.timeline) this.timeline = content.timeline;
    if (content.geography) this.geography = content.geography;
    if (content.nations) this.nations = content.nations;
    if (content.factions) this.factions = content.factions;
    if (content.powerSystems) this.powerSystems = content.powerSystems;
    if (content.characters) this.characters = content.characters;
    if (content.maps) this.maps = content.maps;
    if (content.relationships) this.relationships = content.relationships;
    if (content.items) this.items = content.items;
    if (content.events) this.events = content.events;
  }

  /**
   * 转换为统一世界数据格式
   */
  toUnifiedWorldData(): any {
    return {
      text: this.text || {},
      timeline: this.timeline || [],
      geography: this.geography || [],
      nations: this.nations || [],
      factions: this.factions || [],
      powerSystems: this.powerSystems || [],
      characters: this.characters || [],
      maps: this.maps || [],
      relationships: this.relationships || [],
      items: this.items || [],
      events: this.events || [],
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * 从统一世界数据创建实例
   */
  static fromUnifiedWorldData(worldId: string, content: any): Partial<WorldContent> {
    return {
      worldId,
      text: content.text || {},
      timeline: content.timeline || [],
      geography: content.geography || [],
      nations: content.nations || [],
      factions: content.factions || [],
      powerSystems: content.powerSystems || [],
      characters: content.characters || [],
      maps: content.maps || [],
      relationships: content.relationships || [],
      items: content.items || [],
      events: content.events || []
    };
  }
}