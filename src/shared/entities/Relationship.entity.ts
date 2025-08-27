import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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
}