import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('memory_stage')
export class MemoryStageRecord {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'text', default: 'default' })
  sessionId!: string

  @Column({ type: 'integer', default: 0 })
  stageIndex!: number

  @Column({ type: 'text', default: 'completed' })
  status!: string

  @Column({ type: 'text', default: 'window_overflow' })
  triggerKind!: string

  @Column({ type: 'integer', default: 0 })
  messageCount!: number

  @Column({ type: 'integer', default: 0 })
  startSequence!: number

  @Column({ type: 'integer', default: 0 })
  endSequence!: number

  @Column({ type: 'text', default: '' })
  startedAtIso!: string

  @Column({ type: 'text', default: '' })
  endedAtIso!: string

  @Column({ type: 'text', default: '' })
  summary!: string

  @Column({ type: 'text', default: '' })
  moodLabel!: string

  @UpdateDateColumn()
  updatedAt!: Date
}
