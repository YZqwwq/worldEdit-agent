import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('geography')
export class Geography {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // 关联的世界ID（通过应用逻辑维护关系）
  @Column({ type: 'varchar', length: 255 })
  worldId!: string;

  // 父级地理区域ID（支持层级结构）
  @Column({ type: 'varchar', length: 255, nullable: true })
  parentId?: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  type?: string; // 如：continent, country, city, region等

  // 坐标信息
  @Column({ type: 'json', nullable: true })
  coordinates?: {
    latitude?: number;
    longitude?: number;
    x?: number;
    y?: number;
  };

  // 气候信息
  @Column({ type: 'varchar', length: 255, nullable: true })
  climate?: string;

  // 资源信息
  @Column({ type: 'json', nullable: true })
  resources?: string[];

  // 地理特征
  @Column({ type: 'json', nullable: true })
  features?: {
    terrain?: string;
    elevation?: number;
    waterBodies?: string[];
    landmarks?: string[];
  };

  // 人口信息
  @Column({ type: 'json', nullable: true })
  population?: {
    total?: number;
    density?: number;
    demographics?: Record<string, number>;
  };

  // 经济信息
  @Column({ type: 'json', nullable: true })
  economy?: {
    mainIndustries?: string[];
    tradeRoutes?: string[];
    currency?: string;
  };

  // 文化信息
  @Column({ type: 'json', nullable: true })
  culture?: {
    languages?: string[];
    religions?: string[];
    customs?: string[];
  };

  // 政治信息
  @Column({ type: 'json', nullable: true })
  politics?: {
    governmentType?: string;
    ruler?: string;
    laws?: string[];
  };

  // 军事信息
  @Column({ type: 'json', nullable: true })
  military?: {
    forces?: string[];
    fortifications?: string[];
    strategicValue?: string;
  };

  // 关系信息（与其他地区的关系）
  @Column({ type: 'json', nullable: true })
  relationships?: Record<string, {
    type: string;
    status: string;
    description?: string;
  }>;

  // 历史信息
  @Column({ type: 'json', nullable: true })
  history?: {
    founded?: string;
    majorEvents?: Array<{
      date: string;
      event: string;
      description?: string;
    }>;
  };

  // 地图相关
  @Column({ type: 'varchar', length: 500, nullable: true })
  mapImageUrl?: string;

  @Column({ type: 'json', nullable: true })
  mapData?: Record<string, any>;

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
      parentId: this.parentId,
      coordinates: this.coordinates,
      climate: this.climate,
      resources: this.resources || [],
      features: this.features,
      population: this.population,
      economy: this.economy,
      culture: this.culture,
      politics: this.politics,
      military: this.military,
      relationships: this.relationships || {},
      history: this.history,
      mapImageUrl: this.mapImageUrl,
      mapData: this.mapData
    };
  }

  // 转换为GeographyData格式
  toGeographyData(): any {
    return {
      id: this.id,
      name: this.name,
      type: this.type as any || 'region',
      description: this.description || '',
      parentId: this.parentId,
      coordinates: this.coordinates || { x: 0, y: 0 },
      climate: this.climate || '',
      terrain: this.features?.terrain || '',
      resources: this.resources || [],
      population: this.population?.total || 0,
      settlements: [], // 需要从关系中获取
      landmarks: this.features?.landmarks || []
    };
  }

  // 从数据创建实体
  static fromData(worldId: string, data: any): Partial<Geography> {
    return {
      id: data.id,
      worldId,
      name: data.name,
      description: data.description,
      type: data.type,
      parentId: data.parentId,
      coordinates: data.coordinates,
      climate: data.climate,
      resources: data.resources,
      features: data.features,
      population: data.population,
      economy: data.economy,
      culture: data.culture,
      politics: data.politics,
      military: data.military,
      relationships: data.relationships,
      history: data.history,
      mapImageUrl: data.mapImageUrl,
      mapData: data.mapData
    };
  }
}