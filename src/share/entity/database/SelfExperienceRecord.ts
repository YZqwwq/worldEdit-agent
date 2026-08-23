import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity('self_experience')
@Index('IDX_self_experience_turn', ['turnId'], { unique: true })
@Index('IDX_self_experience_created', ['createdAt'])
export class SelfExperienceRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false, unique: true })
  eventId!: string

  @Column({ type: 'integer', nullable: false })
  turnId!: number

  @Column({ type: 'text', nullable: false, default: 'default' })
  sessionId!: string

  @Column({ type: 'text', nullable: false })
  kind!: string

  @Column({ type: 'text', nullable: false, default: '' })
  summary!: string

  @Column({ type: 'text', nullable: false, default: '' })
  understanding!: string

  @Column({ type: 'text', nullable: false, default: '' })
  selfPosition!: string

  @Column({ type: 'text', nullable: false, default: '' })
  personalMeaning!: string

  @Column({ type: 'text', nullable: false, default: '' })
  stance!: string

  @Column({ type: 'text', nullable: false, default: '' })
  relationshipMeaning!: string

  @Column({ type: 'text', nullable: false, default: '' })
  selfNarrative!: string

  @Column({ type: 'text', nullable: false, default: '[]' })
  commitmentUpdatesJson!: string

  @Column({ type: 'text', nullable: false, default: '[]' })
  concernUpdatesJson!: string

  @Column({ type: 'text', nullable: false, default: '[]' })
  evidenceRefsJson!: string

  @Column({ type: 'real', nullable: false, default: 0.5 })
  confidence!: number

  @Column({ type: 'integer', nullable: false, default: 1 })
  revision!: number

  @Column({ type: 'text', nullable: true })
  supersedesExperienceId!: string | null

  @Column({ type: 'text', nullable: false })
  occurredAt!: string

  @CreateDateColumn()
  createdAt!: Date
}
