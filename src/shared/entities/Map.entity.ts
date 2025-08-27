import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('maps')
export class Map {
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
  type?: string; // 如：world, region, city, building等

  // 地图尺寸和比例
  @Column({ type: 'json', nullable: true })
  dimensions?: {
    width?: number;
    height?: number;
    scale?: string;
    units?: string;
  };

  // 地图图像
  @Column({ type: 'varchar', length: 1000, nullable: true })
  imageUrl?: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  thumbnailUrl?: string;

  // 地图数据
  @Column({ type: 'json', nullable: true })
  mapData?: {
    layers?: Array<{
      id: string;
      name: string;
      type: string;
      visible: boolean;
      data: any;
    }>;
    markers?: Array<{
      id: string;
      name: string;
      type: string;
      coordinates: { x: number; y: number };
      description?: string;
    }>;
    regions?: Array<{
      id: string;
      name: string;
      type: string;
      boundaries: Array<{ x: number; y: number }>;
      properties?: Record<string, any>;
    }>;
  };

  // 地理信息
  @Column({ type: 'json', nullable: true })
  geography?: {
    terrain?: Record<string, any>;
    climate?: Record<string, any>;
    resources?: Record<string, any>;
    landmarks?: Array<{
      name: string;
      type: string;
      coordinates: { x: number; y: number };
      description?: string;
    }>;
  };

  // 政治边界
  @Column({ type: 'json', nullable: true })
  politicalBoundaries?: {
    nations?: Array<{
      id: string;
      name: string;
      boundaries: Array<{ x: number; y: number }>;
      capital?: { x: number; y: number };
    }>;
    regions?: Array<{
      id: string;
      name: string;
      type: string;
      boundaries: Array<{ x: number; y: number }>;
    }>;
  };

  // 交通网络
  @Column({ type: 'json', nullable: true })
  transportation?: {
    roads?: Array<{
      id: string;
      name: string;
      type: string;
      path: Array<{ x: number; y: number }>;
    }>;
    waterways?: Array<{
      id: string;
      name: string;
      type: string;
      path: Array<{ x: number; y: number }>;
    }>;
    ports?: Array<{
      name: string;
      coordinates: { x: number; y: number };
      type: string;
    }>;
  };

  // 城市和定居点
  @Column({ type: 'json', nullable: true })
  settlements?: Array<{
    id: string;
    name: string;
    type: string;
    coordinates: { x: number; y: number };
    population?: number;
    description?: string;
  }>;

  // 地图元数据
  @Column({ type: 'json', nullable: true })
  metadata?: {
    projection?: string;
    coordinateSystem?: string;
    dataSources?: string[];
    accuracy?: string;
    lastSurvey?: string;
  };

  // 版本控制
  @Column({ type: 'varchar', length: 50, default: '1.0' })
  version!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  parentMapId?: string;

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
      dimensions: this.dimensions,
      imageUrl: this.imageUrl,
      thumbnailUrl: this.thumbnailUrl,
      mapData: this.mapData,
      geography: this.geography,
      politicalBoundaries: this.politicalBoundaries,
      transportation: this.transportation,
      settlements: this.settlements || [],
      metadata: this.metadata,
      version: this.version,
      parentMapId: this.parentMapId
    };
  }

  // 转换为MapData格式
  toMapData(): any {
    return {
      id: this.id,
      name: this.name,
      version: this.version || '1.0.0',
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      dimensions: {
        width: this.dimensions?.width || 1000,
        height: this.dimensions?.height || 1000
      },
      layers: {
        pixel: this.mapData?.layers?.filter(layer => layer.type === 'pixel').map(layer => ({
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          opacity: 1,
          zIndex: 0,
          type: 'pixel' as const,
          imageData: layer.data?.imageData || '',
          filters: []
        })) || [],
        vector: this.mapData?.layers?.filter(layer => layer.type === 'vector').map(layer => ({
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          opacity: 1,
          zIndex: 0,
          type: 'vector' as const,
          elements: layer.data?.elements || []
        })) || []
      },
      landmarks: this.geography?.landmarks?.map(landmark => ({
        id: `${this.id}-${landmark.name}`,
        name: landmark.name,
        type: landmark.type,
        coordinates: landmark.coordinates,
        description: landmark.description || '',
        importance: 5
      })) || [],
      regions: this.mapData?.regions?.map(region => ({
        id: region.id,
        name: region.name,
        boundaries: region.boundaries,
        type: region.type,
        properties: region.properties || {}
      })) || [],
      routes: this.transportation?.roads?.map(road => ({
        id: road.id,
        name: road.name,
        points: road.path,
        type: 'road' as const,
        description: ''
      })) || [],
      scale: parseFloat(this.dimensions?.scale || '1'),
      projection: this.metadata?.projection || 'mercator'
    };
  }

  // 从数据创建实体
  static fromData(worldId: string, data: any): Partial<Map> {
    return {
      id: data.id,
      worldId,
      name: data.name,
      description: data.description,
      type: data.type,
      dimensions: data.dimensions,
      imageUrl: data.imageUrl,
      thumbnailUrl: data.thumbnailUrl,
      mapData: data.mapData,
      geography: data.geography,
      politicalBoundaries: data.politicalBoundaries,
      transportation: data.transportation,
      settlements: data.settlements,
      metadata: data.metadata,
      version: data.version || '1.0',
      parentMapId: data.parentMapId
    };
  }
}