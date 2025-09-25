import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('agent_configs')
export class AgentConfig {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ type: 'text' })
  systemPrompt!: string;

  @Column({ type: 'float', default: 0.7 })
  temperature!: number;

  @Column({ type: 'int', default: 4000 })
  maxTokens!: number;

  @Column({ type: 'float', default: 1.0 })
  topP!: number;

  @Column({ type: 'float', default: 0.0 })
  frequencyPenalty!: number;

  @Column({ type: 'float', default: 0.0 })
  presencePenalty!: number;

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