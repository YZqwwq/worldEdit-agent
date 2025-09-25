import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { AgentConfig } from './AgentConfig.entity';
import { ChatSession } from './ChatSession.entity';

export enum AgentStatus {
  IDLE = 'idle',
  THINKING = 'thinking',
  RESPONDING = 'responding',
  TOOL_CALLING = 'tool_calling',
  WAITING = 'waiting',
  ERROR = 'error',
  STOPPED = 'stopped'
}

export enum AgentMode {
  CHAT = 'chat',
  TASK = 'task',
  WORKFLOW = 'workflow',
  AUTONOMOUS = 'autonomous'
}

@Entity('agent_states')
export class AgentState {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  agentConfigId!: string;

  @ManyToOne(() => AgentConfig, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'agentConfigId' })
  agentConfig!: AgentConfig;

  @Column({ type: 'uuid', nullable: true })
  currentSessionId?: string;

  @ManyToOne(() => ChatSession, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'currentSessionId' })
  currentSession?: ChatSession;

  @Column({ type: 'varchar', length: 20, default: AgentStatus.IDLE })
  status!: AgentStatus;

  @Column({ type: 'varchar', length: 20, default: AgentMode.CHAT })
  mode!: AgentMode;

  @Column({ type: 'text', nullable: true })
  currentTask?: string;

  @Column({ type: 'json', nullable: true })
  context?: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  memory?: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  toolStates?: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  lastError?: string;

  @Column({ type: 'datetime', nullable: true })
  lastHeartbeat?: Date;

  @Column({ type: 'int', default: 0 })
  totalInteractions!: number;

  @Column({ type: 'float', default: 0.0 })
  averageResponseTime!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;
}