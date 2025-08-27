import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('characters')
export class Character {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // 关联的世界ID（通过应用逻辑维护关系）
  @Column({ type: 'varchar', length: 255 })
  worldId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  // 基本信息
  @Column({ type: 'json', nullable: true })
  basicInfo?: {
    age?: number;
    gender?: string;
    race?: string;
    occupation?: string;
    birthplace?: string;
    currentLocation?: string;
  };

  // 外貌特征
  @Column({ type: 'json', nullable: true })
  appearance?: {
    height?: string;
    build?: string;
    hairColor?: string;
    eyeColor?: string;
    distinguishingMarks?: string[];
    clothing?: string;
  };

  // 性格特征
  @Column({ type: 'json', nullable: true })
  personality?: {
    traits?: string[];
    values?: string[];
    fears?: string[];
    motivations?: string[];
    quirks?: string[];
  };

  // 背景故事
  @Column({ type: 'json', nullable: true })
  background?: {
    family?: string;
    education?: string;
    pastEvents?: Array<{
      date: string;
      event: string;
      description?: string;
      impact?: string;
    }>;
    secrets?: string[];
  };

  // 能力和技能
  @Column({ type: 'json', nullable: true })
  abilities?: {
    skills?: Record<string, number>;
    talents?: string[];
    powers?: string[];
    weaknesses?: string[];
  };

  // 关系网络
  @Column({ type: 'json', nullable: true })
  relationships?: Record<string, {
    type: string;
    status: string;
    description?: string;
    history?: string;
  }>;

  // 目标和动机
  @Column({ type: 'json', nullable: true })
  goals?: {
    shortTerm?: string[];
    longTerm?: string[];
    conflicts?: string[];
    methods?: string[];
  };

  // 装备和财产
  @Column({ type: 'json', nullable: true })
  possessions?: {
    weapons?: string[];
    armor?: string[];
    tools?: string[];
    valuables?: string[];
    property?: string[];
  };

  // 社会地位
  @Column({ type: 'json', nullable: true })
  socialStatus?: {
    class?: string;
    reputation?: string;
    influence?: string;
    connections?: string[];
  };

  // 角色发展
  @Column({ type: 'json', nullable: true })
  development?: {
    characterArc?: string;
    growth?: string[];
    challenges?: string[];
    achievements?: string[];
  };

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // 转换为简单对象格式
  toSimpleObject(): any {
    return {
      id: this.id,
      worldId: this.worldId,
      name: this.name,
      description: this.description,
      basicInfo: this.basicInfo,
      appearance: this.appearance,
      personality: this.personality,
      background: this.background,
      abilities: this.abilities,
      relationships: this.relationships || {},
      goals: this.goals,
      possessions: this.possessions,
      socialStatus: this.socialStatus,
      development: this.development,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  // 转换为CharacterData格式
  toCharacterData(): any {
    return {
      id: this.id,
      worldId: this.worldId,
      name: this.name,
      version: '1.0.0',
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      description: {
        appearance: this.appearance ? JSON.stringify(this.appearance) : '',
        personality: this.personality ? JSON.stringify(this.personality) : '',
        background: this.background ? JSON.stringify(this.background) : '',
        abilities: this.abilities ? Object.entries(this.abilities.skills || {}).map(([name, level]) => ({
          id: `${this.id}-${name}`,
          name,
          description: `${name} (Level ${level})`,
          type: 'skill'
        })) : []
      },
      relationships: this.relationships ? Object.entries(this.relationships).map(([targetId, rel]) => ({
        targetId,
        type: rel.type as any,
        description: rel.description || '',
        strength: 5
      })) : [],
      timeline: this.background?.pastEvents?.map(event => ({
        id: `${this.id}-${event.date}`,
        date: event.date,
        title: event.event,
        description: event.description || '',
        importance: 5
      })) || [],
      factionId: undefined,
      powerLevel: undefined
    };
  }

  // 从数据创建实体
  static fromData(worldId: string, data: any): Partial<Character> {
    return {
      id: data.id,
      worldId,
      name: data.name,
      description: data.description,
      basicInfo: data.basicInfo,
      appearance: data.appearance,
      personality: data.personality,
      background: data.background,
      abilities: data.abilities,
      relationships: data.relationships,
      goals: data.goals,
      possessions: data.possessions,
      socialStatus: data.socialStatus,
      development: data.development
    };
  }
}