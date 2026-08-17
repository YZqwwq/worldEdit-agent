import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity('world_document_commit')
@Index(['worldId', 'createdAt'])
@Index(['changeSetId', 'worldId'], { unique: true })
@Index(['worldId', 'sequence'], { unique: true })
export class WorldDocumentCommitRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  worldId!: string

  @Column({ type: 'integer', nullable: false })
  sequence!: number

  @Column({ type: 'text', nullable: true })
  parentCommitId!: string | null

  @Column({ type: 'text', nullable: false })
  changeSetId!: string

  @Column({ type: 'text', nullable: false })
  rootTreeHash!: string

  @Column({ type: 'text', nullable: false })
  origin!: 'agent' | 'human' | 'system'

  @Column({ type: 'text', nullable: false, default: '' })
  summary!: string

  @CreateDateColumn()
  createdAt!: Date
}
