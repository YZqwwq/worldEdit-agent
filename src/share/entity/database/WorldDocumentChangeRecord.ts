import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'

export type WorldDocumentChangeOperation = 'create' | 'update' | 'move' | 'delete' | 'mixed'

@Entity('world_document_change')
@Index(['changeSetId', 'documentId'], { unique: true })
@Index(['changeSetId', 'status'])
export class WorldDocumentChangeRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  changeSetId!: string

  @Column({ type: 'text', nullable: false })
  worldId!: string

  @Column({ type: 'text', nullable: false })
  documentId!: string

  @Column({ type: 'text', nullable: false })
  operation!: WorldDocumentChangeOperation

  @Column({ type: 'text', nullable: true })
  beforeStateJson!: string | null

  @Column({ type: 'text', nullable: true })
  afterStateJson!: string | null

  @Column({ type: 'text', nullable: true })
  beforeSourceFormat!: 'markdown' | 'html_editor' | null

  @Column({ type: 'text', nullable: true })
  beforeContentSource!: string | null

  @Column({ type: 'text', nullable: true })
  sourceFormat!: 'markdown' | 'html_editor' | null

  @Column({ type: 'text', nullable: true })
  contentSource!: string | null

  @Column({ type: 'text', nullable: false, default: '' })
  summary!: string

  @Column({ type: 'text', nullable: false, default: 'staged' })
  status!: 'staged' | 'committed'

  @Column({ type: 'text', nullable: true })
  commitId!: string | null

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
