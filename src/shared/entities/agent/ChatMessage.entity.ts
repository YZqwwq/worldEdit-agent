import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ChatSession } from './ChatSession.entity';

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
  TOOL = 'tool'
}

export enum MessageType {
  TEXT = 'text',
  IMAGE = 'image',
  TOOL_CALL = 'tool_call',
  TOOL_RESULT = 'tool_result'
}

@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  sessionId!: string;

  @ManyToOne(() => ChatSession, session => session.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session!: ChatSession;

  @Column({ type: 'varchar', length: 20 })
  role!: MessageRole;

  @Column({ type: 'varchar', length: 20, default: MessageType.TEXT })
  type!: MessageType;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'json', nullable: true })
  toolCalls?: any[];

  @Column({ type: 'varchar', length: 255, nullable: true })
  toolCallId?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model?: string;

  @Column({ type: 'int', nullable: true })
  tokenCount?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ type: 'boolean', default: false })
  isDeleted!: boolean;
}