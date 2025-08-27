import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('factions')
export class Faction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // 关联的世界ID（通过应用逻辑维护关系）
  @Column({ type: 'varchar', length: 255 })
  worldId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  type?: string; // 如：political, religious, military, criminal等

  // 领导层信息
  @Column({ type: 'json', nullable: true })
  leadership?: {
    leader?: string;
    structure?: string;
    hierarchy?: string[];
    decisionMaking?: string;
  };

  // 目标和理念
  @Column({ type: 'json', nullable: true })
  ideology?: {
    goals?: string[];
    beliefs?: string[];
    methods?: string[];
    values?: string[];
  };

  // 成员信息
  @Column({ type: 'json', nullable: true })
  membership?: {
    size?: number;
    requirements?: string[];
    ranks?: string[];
    recruitment?: string;
  };

  // 资源和能力
  @Column({ type: 'json', nullable: true })
  resources?: {
    financial?: string;
    military?: string[];
    political?: string[];
    information?: string[];
    territory?: string[];
  };

  // 活动和影响
  @Column({ type: 'json', nullable: true })
  activities?: {
    primary?: string[];
    secondary?: string[];
    influence?: Record<string, string>;
    operations?: string[];
  };

  // 关系网络
  @Column({ type: 'json', nullable: true })
  relationships?: Record<string, {
    type: string;
    status: string;
    description?: string;
    history?: string;
  }>;

  // 历史背景
  @Column({ type: 'json', nullable: true })
  history?: {
    founded?: string;
    founder?: string;
    majorEvents?: Array<{
      date: string;
      event: string;
      description?: string;
      impact?: string;
    }>;
    evolution?: string[];
  };

  // 秘密和弱点
  @Column({ type: 'json', nullable: true })
  secrets?: {
    hiddenAgenda?: string[];
    weaknesses?: string[];
    vulnerabilities?: string[];
    internalConflicts?: string[];
  };

  // 地理分布
  @Column({ type: 'json', nullable: true })
  geography?: {
    headquarters?: string;
    strongholds?: string[];
    influence?: Record<string, string>;
    territories?: string[];
  };

  // 经济状况
  @Column({ type: 'json', nullable: true })
  economics?: {
    funding?: string[];
    income?: string[];
    expenses?: string[];
    assets?: string[];
  };

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // 转换为简单对象格式
  toSimpleObject(): any {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type as any,
      leadership: this.leadership,
      ideology: this.ideology,
      membership: this.membership,
      resources: this.resources,
      activities: this.activities,
      relationships: this.relationships || {},
      history: this.history,
      secrets: this.secrets,
      geography: this.geography,
      economics: this.economics
    };
  }

  // 转换为FactionData格式
  toFactionData(): any {
    return {
      id: this.id,
      name: this.name,
      type: this.type as any || 'political',
      description: this.description || '',
      goals: this.ideology?.goals || [],
      resources: this.resources?.financial ? [this.resources.financial] : [],
      influence: this.membership?.size || 0,
      territories: this.geography?.territories || [],
      members: [] // 需要从关系中获取
    };
  }

  // 从数据创建实体
  static fromData(worldId: string, data: any): Partial<Faction> {
    return {
      id: data.id,
      worldId,
      name: data.name,
      description: data.description,
      type: data.type,
      leadership: data.leadership,
      ideology: data.ideology,
      membership: data.membership,
      resources: data.resources,
      activities: data.activities,
      relationships: data.relationships,
      history: data.history,
      secrets: data.secrets,
      geography: data.geography,
      economics: data.economics
    };
  }
}