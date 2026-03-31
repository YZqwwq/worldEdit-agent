import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'
import type {
  MainAgentTurnConsumer,
  MainAgentTurnStatus
} from '@share/cache/AItype/states/mainAgentTurnState'

@Entity('main_agent_turn')
export class MainAgentTurnRecord {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({
    type: 'text',
    unique: true
  })
  eventId!: string

  @Column({
    type: 'text',
    default: 'default'
  })
  sessionId!: string

  @Column({
    type: 'text',
    default: 'chat_runtime'
  })
  consumer!: MainAgentTurnConsumer

  @Column({
    type: 'text',
    default: 'queued'
  })
  status!: MainAgentTurnStatus

  @Column({
    type: 'integer',
    nullable: true
  })
  userMessageId!: number | null

  @Column({
    type: 'integer',
    nullable: true
  })
  aiMessageId!: number | null

  @Column({
    type: 'integer',
    default: 1
  })
  reversible!: number

  @Column({
    type: 'text',
    default: '{}'
  })
  memoryCheckpointJson!: string

  @Column({
    type: 'text',
    default: ''
  })
  errorMessage!: string

  @Column({
    type: 'datetime',
    nullable: true
  })
  startedAt!: Date | null

  @Column({
    type: 'datetime',
    nullable: true
  })
  completedAt!: Date | null

  @Column({
    type: 'datetime',
    nullable: true
  })
  interruptedAt!: Date | null

  @Column({
    type: 'datetime',
    nullable: true
  })
  revertedAt!: Date | null

  @CreateDateColumn()
  createdAt!: Date
}
