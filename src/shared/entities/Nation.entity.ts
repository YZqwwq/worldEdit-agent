import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('nations')
export class Nation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // 关联的世界ID（通过应用逻辑维护关系）
  @Column({ type: 'varchar', length: 255 })
  worldId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  // 政府信息
  @Column({ type: 'json', nullable: true })
  government?: {
    type?: string;
    structure?: string;
    leader?: string;
    capital?: string;
    foundingDate?: string;
  };

  // 文化信息
  @Column({ type: 'json', nullable: true })
  culture?: {
    languages?: string[];
    religions?: string[];
    traditions?: string[];
    values?: string[];
    arts?: string[];
  };

  // 经济信息
  @Column({ type: 'json', nullable: true })
  economy?: {
    type?: string;
    currency?: string;
    mainIndustries?: string[];
    tradePartners?: string[];
    resources?: string[];
    gdp?: number;
  };

  // 军事信息
  @Column({ type: 'json', nullable: true })
  military?: {
    structure?: string;
    size?: number;
    technology?: string[];
    strategies?: string[];
    allies?: string[];
    enemies?: string[];
  };

  // 领土信息
  @Column({ type: 'json', nullable: true })
  territories?: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    description?: string;
  }>;

  // 关系信息
  @Column({ type: 'json', nullable: true })
  relationships?: Record<string, {
    type: string;
    status: string;
    description?: string;
    treaties?: string[];
  }>;

  // 人口信息
  @Column({ type: 'json', nullable: true })
  demographics?: {
    totalPopulation?: number;
    ethnicGroups?: Record<string, number>;
    ageDistribution?: Record<string, number>;
    urbanization?: number;
  };

  // 历史信息
  @Column({ type: 'json', nullable: true })
  history?: {
    founding?: string;
    majorEvents?: Array<{
      date: string;
      event: string;
      description?: string;
      impact?: string;
    }>;
    previousNames?: string[];
  };

  // 法律制度
  @Column({ type: 'json', nullable: true })
  legalSystem?: {
    type?: string;
    majorLaws?: string[];
    courts?: string[];
    enforcement?: string;
  };

  // 外交政策
  @Column({ type: 'json', nullable: true })
  diplomacy?: {
    stance?: string;
    embassies?: string[];
    treaties?: Array<{
      name: string;
      type: string;
      parties: string[];
      date: string;
    }>;
  };

  // 科技水平
  @Column({ type: 'json', nullable: true })
  technology?: {
    level?: string;
    specialties?: string[];
    research?: string[];
    innovations?: string[];
  };

  // 地理位置
  @Column({ type: 'json', nullable: true })
  geography?: {
    continent?: string;
    climate?: string;
    terrain?: string[];
    naturalResources?: string[];
    borders?: string[];
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
      government: this.government,
      culture: this.culture,
      economy: this.economy,
      military: this.military,
      territories: this.territories || [],
      relationships: this.relationships || {},
      demographics: this.demographics,
      history: this.history,
      legalSystem: this.legalSystem,
      diplomacy: this.diplomacy,
      technology: this.technology,
      geography: this.geography
    };
  }

  // 转换为NationData格式
  toNationData(): any {
    return {
      id: this.id,
      name: this.name,
      description: this.description || '',
      government: this.government?.type || '',
      culture: JSON.stringify(this.culture || {}),
      economy: JSON.stringify(this.economy || {}),
      military: JSON.stringify(this.military || {}),
      territories: this.territories?.map(t => t.id) || [],
      relationships: this.relationships ? Object.entries(this.relationships).map(([targetId, rel]) => ({
        id: `${this.id}-${targetId}`,
        sourceId: this.id,
        targetId,
        type: rel.type,
        description: rel.description || '',
        strength: 5,
        isPublic: true
      })) : []
    };
  }

  // 从数据创建实体
  static fromData(worldId: string, data: any): Partial<Nation> {
    return {
      id: data.id,
      worldId,
      name: data.name,
      description: data.description,
      government: data.government,
      culture: data.culture,
      economy: data.economy,
      military: data.military,
      territories: data.territories,
      relationships: data.relationships,
      demographics: data.demographics,
      history: data.history,
      legalSystem: data.legalSystem,
      diplomacy: data.diplomacy,
      technology: data.technology,
      geography: data.geography
    };
  }
}