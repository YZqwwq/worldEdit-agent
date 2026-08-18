import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity('world_document_branch')
@Index(['worldId', 'name'], { unique: true })
@Index(['worldId', 'active'])
export class WorldDocumentBranchRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  worldId!: string

  @Column({ type: 'text', nullable: false })
  name!: string

  @Column({ type: 'text', nullable: true })
  headCommitId!: string | null

  @Column({ type: 'boolean', nullable: false, default: false })
  active!: boolean

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
