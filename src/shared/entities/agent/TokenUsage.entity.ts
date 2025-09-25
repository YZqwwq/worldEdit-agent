import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ChatSession } from './ChatSession.entity';
import { ChatMessage } from './ChatMessage.entity';

export enum UsageType {
  INPUT = 'input',
  OUTPUT = 'output',
  TOTAL = 'total'
}

@Entity('token_usages')
export class TokenUsage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  sessionId!: string;

  @ManyToOne(() => ChatSession, session => session.tokenUsages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session!: ChatSession;

  @Column({ type: 'uuid', nullable: true })
  messageId?: string;

  @ManyToOne(() => ChatMessage, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message?: ChatMessage;

  @Column({ type: 'varchar', length: 100 })
  model!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: UsageType;

  @Column({ type: 'int' })
  promptTokens!: number;

  @Column({ type: 'int' })
  completionTokens!: number;

  @Column({ type: 'int' })
  totalTokens!: number;

  @Column({ type: 'float', nullable: true })
  cost?: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  currency?: string;

  @Column({ type: 'float', nullable: true })
  responseTime?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  provider?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  endpoint?: string;
}