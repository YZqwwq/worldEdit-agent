import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { AgentConfig } from './AgentConfig.entity';
import { ChatMessage } from './ChatMessage.entity';
import { TokenUsage } from './TokenUsage.entity';

export enum SessionStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error'
}

@Entity('chat_sessions')
export class ChatSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'uuid' })
  agentConfigId!: string;

  @ManyToOne(() => AgentConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agentConfigId' })
  agentConfig!: AgentConfig;

  @OneToMany(() => ChatMessage, message => message.session)
  messages!: ChatMessage[];

  @OneToMany(() => TokenUsage, usage => usage.session)
  tokenUsages!: TokenUsage[];

  @Column({ type: 'varchar', length: 20, default: SessionStatus.ACTIVE })
  status!: SessionStatus;

  @Column({ type: 'text', nullable: true })
  context?: string;

  @Column({ type: 'json', nullable: true })
  variables?: Record<string, any>;

  @Column({ type: 'int', default: 0 })
  messageCount!: number;

  @Column({ type: 'int', default: 0 })
  totalTokens!: number;

  @Column({ type: 'float', default: 0.0 })
  totalCost!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  lastActivityAt?: Date;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'boolean', default: false })
  isArchived!: boolean;
}