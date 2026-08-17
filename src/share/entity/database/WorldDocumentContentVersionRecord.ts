import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm'

@Entity('world_document_content_version')
@Index(['documentId', 'createdAt'])
@Index(['worldId', 'contentHash'])
export class WorldDocumentContentVersionRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  worldId!: string

  @Column({ type: 'text', nullable: false })
  documentId!: string

  @Column({ type: 'integer', nullable: false })
  sourceRevision!: number

  @Column({ type: 'text', nullable: false })
  sourceFormat!: 'markdown' | 'html_editor'

  @Column({ type: 'text', nullable: false, default: '' })
  contentSource!: string

  @Column({ type: 'text', nullable: false })
  contentHash!: string

  @CreateDateColumn()
  createdAt!: Date
}
