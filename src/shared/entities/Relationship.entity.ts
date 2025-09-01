import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import type { RelationshipData } from '../types/world';

@Entity('relationships')
export class Relationship {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // 关联的世界ID（通过应用逻辑维护关系）
  @Column({ type: 'varchar', length: 255 })
  worldId!: string;

  // 关系的源实体
  @Column({ type: 'varchar', length: 255 })
  sourceId!: string;

  @Column({ type: 'varchar', length: 100 })
  sourceType!: string; // character, nation, faction, geography等

  // 关系的目标实体
  @Column({ type: 'varchar', length: 255 })
  targetId!: string;

  @Column({ type: 'varchar', length: 100 })
  targetType!: string; // character, nation, faction, geography等

  // 关系类型
  @Column({ type: 'varchar', length: 100 })
  relationshipType!: string; // ally, enemy, neutral, family, trade, etc.

  // 关系状态
  @Column({ type: 'varchar', length: 100, default: 'active' })
  status!: string; // active, inactive, historical, secret等

  // 关系强度
  @Column({ type: 'integer', nullable: true })
  strength?: number; // -100 to 100, 负数表示敌对，正数表示友好

  // 关系描述
  @Column({ type: 'text', nullable: true })
  description?: string;

  // 关系历史
  @Column({ type: 'json', nullable: true })
  history?: Array<{
    date: string;
    event: string;
    description?: string;
    impact?: string;
    strengthChange?: number;
  }>;

  // 关系属性
  @Column({ type: 'json', nullable: true })
  properties?: {
    isPublic?: boolean;
    isOfficial?: boolean;
    duration?: string;
    conditions?: string[];
    benefits?: string[];
    obligations?: string[];
  };

  // 相关文档或协议
  @Column({ type: 'json', nullable: true })
  documents?: Array<{
    name: string;
    type: string;
    date: string;
    description?: string;
  }>;

  // 影响因素
  @Column({ type: 'json', nullable: true })
  influences?: {
    externalFactors?: string[];
    keyEvents?: string[];
    mediators?: string[];
    obstacles?: string[];
  };

  // 未来展望
  @Column({ type: 'json', nullable: true })
  future?: {
    trajectory?: string;
    potentialChanges?: string[];
    risks?: string[];
    opportunities?: string[];
  };

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // 获取关系的反向表示
  getReverse(): Partial<Relationship> {
    return {
      worldId: this.worldId,
      sourceId: this.targetId,
      sourceType: this.targetType,
      targetId: this.sourceId,
      targetType: this.sourceType,
      relationshipType: this.relationshipType,
      status: this.status,
      strength: this.strength,
      description: this.description,
      history: this.history,
      properties: this.properties,
      documents: this.documents,
      influences: this.influences,
      future: this.future
    };
  }

  // 更新关系强度
  updateStrength(change: number, reason?: string): void {
    const oldStrength = this.strength || 0;
    this.strength = Math.max(-100, Math.min(100, oldStrength + change));
    
    if (reason && this.history) {
      this.history.push({
        date: new Date().toISOString(),
        event: 'Strength Change',
        description: reason,
        strengthChange: change,
        impact: `Strength changed from ${oldStrength} to ${this.strength}`
      });
    }
  }

  // 检查关系是否为敌对
  isHostile(): boolean {
    return (this.strength || 0) < -30;
  }

  // 检查关系是否为友好
  isFriendly(): boolean {
    return (this.strength || 0) > 30;
  }

  // 检查关系是否为中立
  isNeutral(): boolean {
    const strength = this.strength || 0;
    return strength >= -30 && strength <= 30;
  }

  // 添加历史事件
  addHistoryEvent(event: string, description?: string, strengthChange?: number): void {
    if (!this.history) {
      this.history = [];
    }
    
    this.history.push({
      date: new Date().toISOString(),
      event,
      description,
      strengthChange,
      impact: strengthChange ? `Strength ${strengthChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(strengthChange)}` : undefined
    });
    
    if (strengthChange) {
      this.updateStrength(strengthChange);
    }
  }

  // 添加文档
  addDocument(name: string, type: string, description?: string): void {
    if (!this.documents) {
      this.documents = [];
    }
    
    this.documents.push({
      name,
      type,
      date: new Date().toISOString(),
      description
    });
  }

  // 设置关系属性
  setProperties(properties: Partial<{
    isPublic?: boolean;
    isOfficial?: boolean;
    duration?: string;
    conditions?: string[];
    benefits?: string[];
    obligations?: string[];
  }>): void {
    this.properties = {
      ...this.properties,
      ...properties
    };
  }

  // 添加影响因素
  addInfluence(type: 'externalFactors' | 'keyEvents' | 'mediators' | 'obstacles', value: string): void {
    if (!this.influences) {
      this.influences = {};
    }
    
    if (!this.influences[type]) {
      this.influences[type] = [];
    }
    
    this.influences[type]!.push(value);
  }

  // 设置未来展望
  setFuture(future: Partial<{
    trajectory?: string;
    potentialChanges?: string[];
    risks?: string[];
    opportunities?: string[];
  }>): void {
    this.future = {
      ...this.future,
      ...future
    };
  }

  // 获取关系强度描述
  getStrengthDescription(): string {
    const strength = this.strength || 0;
    if (strength >= 80) return '极其友好';
    if (strength >= 60) return '非常友好';
    if (strength >= 30) return '友好';
    if (strength >= 10) return '较为友好';
    if (strength >= -10) return '中立';
    if (strength >= -30) return '较为敌对';
    if (strength >= -60) return '敌对';
    if (strength >= -80) return '非常敌对';
    return '极其敌对';
  }

  // 获取关系状态描述
  getStatusDescription(): string {
    switch (this.status) {
      case 'active': return '活跃';
      case 'inactive': return '非活跃';
      case 'historical': return '历史性';
      case 'secret': return '秘密';
      default: return this.status;
    }
  }

  // 检查关系是否可以公开
  isPublic(): boolean {
    return this.properties?.isPublic !== false && this.status !== 'secret';
  }

  // 检查关系是否为官方关系
  isOfficial(): boolean {
    return this.properties?.isOfficial === true;
  }

  // 获取最近的历史事件
  getRecentHistory(limit: number = 5): Array<{
    date: string;
    event: string;
    description?: string;
    impact?: string;
    strengthChange?: number;
  }> {
    if (!this.history) return [];
    
    return this.history
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, limit);
  }

  // 计算关系持续时间（天数）
  getDurationInDays(): number {
    const now = new Date();
    const created = new Date(this.createdAt);
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  }

  // 转换为RelationshipData格式
  toRelationshipData(): RelationshipData {
    return {
      id: this.id,
      worldId: this.worldId,
      sourceId: this.sourceId,
      sourceType: this.sourceType,
      targetId: this.targetId,
      targetType: this.targetType,
      relationshipType: this.relationshipType,
      status: this.status,
      strength: this.strength,
      description: this.description,
      history: this.history,
      properties: this.properties,
      documents: this.documents,
      influences: this.influences,
      future: this.future,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}