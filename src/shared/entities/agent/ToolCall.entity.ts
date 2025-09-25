import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ChatMessage } from './ChatMessage.entity';
import { ChatSession } from './ChatSession.entity';

export enum ToolCallStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum ToolType {
  FUNCTION = 'function',
  MCP = 'mcp',
  BUILTIN = 'builtin',
  EXTERNAL = 'external'
}

@Entity('tool_calls')
export class ToolCall {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  callId!: string;

  @Column({ type: 'uuid' })
  sessionId!: string;

  @ManyToOne(() => ChatSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session!: ChatSession;

  @Column({ type: 'uuid', nullable: true })
  messageId?: string;

  @ManyToOne(() => ChatMessage, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message?: ChatMessage;

  @Column({ type: 'varchar', length: 100 })
  toolName!: string;

  @Column({ type: 'varchar', length: 20 })
  toolType!: ToolType;

  @Column({ type: 'json' })
  parameters!: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  result?: any;

  @Column({ type: 'varchar', length: 20, default: ToolCallStatus.PENDING })
  status!: ToolCallStatus;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ type: 'float', nullable: true })
  executionTime?: number;

  @Column({ type: 'int', nullable: true })
  retryCount?: number;

  @Column({ type: 'int', default: 3 })
  maxRetries!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'datetime', nullable: true })
  startedAt?: Date;

  @Column({ type: 'datetime', nullable: true })
  completedAt?: Date;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  parentCallId?: string;

  @Column({ type: 'boolean', default: false })
  isAsync!: boolean;
}