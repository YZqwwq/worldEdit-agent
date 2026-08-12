import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm'

export type MainAgentTurnVersionKind = 'checkpoint' | 'ready_to_commit' | 'final'

@Entity('main_agent_turn_version')
export class MainAgentTurnVersionRecord {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer' })
  turnId!: number

  @Column({ type: 'integer' })
  sequence!: number

  @Column({ type: 'integer', nullable: true })
  parentVersionId!: number | null

  @Column({ type: 'text', default: 'checkpoint' })
  kind!: MainAgentTurnVersionKind

  @Column({ type: 'text' })
  resumePoint!: string

  @Column({ type: 'text', default: '{}' })
  snapshotJson!: string

  @CreateDateColumn()
  createdAt!: Date
}
