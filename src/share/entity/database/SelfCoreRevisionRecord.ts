import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity('self_core_revision')
@Index('IDX_self_core_revision_core_revision', ['coreId', 'revision'], { unique: true })
export class SelfCoreRevisionRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  coreId!: string

  @Column({ type: 'integer', nullable: false, default: 1 })
  schemaVersion!: number

  @Column({ type: 'integer', nullable: false })
  revision!: number

  @Column({ type: 'text', nullable: false })
  stateJson!: string

  @Column({ type: 'text', nullable: false })
  changeKind!: string

  @Column({ type: 'text', nullable: false, default: '[]' })
  sourceRefsJson!: string

  @Column({ type: 'integer', nullable: true })
  previousRevision!: number | null

  @CreateDateColumn()
  createdAt!: Date
}

