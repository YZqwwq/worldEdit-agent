import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity('world_document_checkpoint')
@Index(['worldId', 'name'], { unique: true })
@Index(['worldId', 'updatedAt'])
export class WorldDocumentCheckpointRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  worldId!: string

  @Column({ type: 'text', nullable: false })
  commitId!: string

  @Column({ type: 'text', nullable: false })
  name!: string

  @Column({ type: 'text', nullable: false, default: '' })
  note!: string

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
