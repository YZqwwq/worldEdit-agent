import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

import { ModelProvider } from '../../cache-types/agent/modelEnum';
import { MessageType } from '../../cache-types/agent/chatMessageTypeEnum';
@Entity('agent_configs')
export class AgentConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text' })
  systemPrompt!: string;

  // 模型配置字段 (合并自ModelConfig)
  @Column({ type: 'varchar', length: 50 })
  provider!: ModelProvider;

  @Column({ type: 'varchar', length: 100 })
  modelName!: string;

  @Column({ type: 'text' })
  apiKey!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  baseURL?: string;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.7 })
  temperature!: number;

  @Column({ type: 'integer', default: 2000 })
  maxTokens!: number;

  @Column({ type: 'integer', default: 3 })
  maxRetries!: number;

  @Column({ type: 'integer', default: 60000 })
  timeout!: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0.9, nullable: true })
  topP?: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0, nullable: true })
  frequencyPenalty?: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0, nullable: true })
  presencePenalty?: number;

  @Column({ type: 'boolean', default: false })
  stream!: boolean;

  @Column({ type: 'integer', default: 3 })
  retries!: number;

  @Column({ type: 'json', nullable: true })
  stop?: string[];

  @Column({ type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ type: 'json', nullable: true })
  tools?: string[];

  @Column({ type: 'json', nullable: true })
  mcpServers?: string[];

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;
}