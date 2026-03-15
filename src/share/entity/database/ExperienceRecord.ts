import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'

@Entity('experience_record')
export class ExperienceRecord {
  @PrimaryGeneratedColumn()
  id!: number

  @Column({ type: 'integer', nullable: true })
  sourceTaskId!: number | null

  @Column({ type: 'text', nullable: false })
  title!: string

  @Column({ type: 'text', nullable: false, default: '' })
  problemPattern!: string

  @Column({ type: 'text', nullable: false, default: '' })
  executionStrategy!: string

  @Column({ type: 'text', nullable: false, default: '' })
  verificationStrategy!: string

  @Column({ type: 'text', nullable: false, default: '' })
  outcome!: string

  @Column({ type: 'text', nullable: false, default: '' })
  pitfalls!: string

  @Column({ type: 'text', nullable: false, default: '[]' })
  tagsJson!: string

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
