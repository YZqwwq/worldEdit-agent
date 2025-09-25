import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('powerSystems')
export class PowerSystem {
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
  type?: string; // 如：magic, technology, divine, psionic等

  // 力量来源
  @Column({ type: 'json', nullable: true })
  source?: {
    origin?: string;
    nature?: string;
    availability?: string;
    limitations?: string[];
  };

  // 使用规则
  @Column({ type: 'json', nullable: true })
  rules?: {
    activation?: string;
    requirements?: string[];
    costs?: string[];
    restrictions?: string[];
    consequences?: string[];
  };

  // 能力分类
  @Column({ type: 'json', nullable: true })
  abilities?: {
    categories?: string[];
    levels?: string[];
    specializations?: string[];
    combinations?: string[];
  };

  // 学习和掌握
  @Column({ type: 'json', nullable: true })
  mastery?: {
    learningMethod?: string;
    difficulty?: string;
    timeRequired?: string;
    prerequisites?: string[];
    stages?: string[];
  };

  // 社会影响
  @Column({ type: 'json', nullable: true })
  socialImpact?: {
    acceptance?: string;
    regulation?: string[];
    organizations?: string[];
    conflicts?: string[];
  };

  // 历史发展
  @Column({ type: 'json', nullable: true })
  history?: {
    discovery?: string;
    evolution?: string[];
    majorEvents?: Array<{
      date: string;
      event: string;
      description?: string;
      impact?: string;
    }>;
  };

  // 相关人物
  @Column({ type: 'json', nullable: true })
  notableUsers?: Array<{
    name: string;
    role: string;
    abilities: string[];
    reputation: string;
  }>;

  // 物理表现
  @Column({ type: 'json', nullable: true })
  manifestation?: {
    visual?: string[];
    auditory?: string[];
    physical?: string[];
    environmental?: string[];
  };

  // 相互作用
  @Column({ type: 'json', nullable: true })
  interactions?: {
    withOtherSystems?: Record<string, string>;
    withTechnology?: string;
    withNature?: string;
    withSociety?: string;
  };

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  // 从数据创建实体
  static fromData(worldId: string, data: any): Partial<PowerSystem> {
    return {
      id: data.id,
      worldId,
      name: data.name,
      description: data.description,
      type: data.type,
      source: data.source,
      rules: data.rules,
      abilities: data.abilities,
      mastery: data.mastery,
      socialImpact: data.socialImpact,
      history: data.history,
      notableUsers: data.notableUsers,
      manifestation: data.manifestation,
      interactions: data.interactions
    };
  }
}