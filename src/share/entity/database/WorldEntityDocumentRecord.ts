import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type { WorldEntityDocumentContentFormat } from '@share/cache/worldbuilding/worldEntityDocument'

@Entity('world_entity_document_record')
@Index(['ownerEntityId', 'parentDocumentId', 'sortKey'])
@Index(['ownerEntityId', 'updatedAt'])
export class WorldEntityDocumentRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  ownerEntityId!: string

  @Column({ type: 'text', nullable: true })
  parentDocumentId!: string | null

  @Column({ type: 'text', nullable: false, default: '新建文件' })
  title!: string

  @Column({ type: 'text', nullable: false, default: '' })
  contentHtml!: string

  @Column({ type: 'text', nullable: false, default: 'html' })
  contentFormat!: WorldEntityDocumentContentFormat

  @Column({ type: 'text', nullable: false, default: '' })
  sortKey!: string

  @Column({ type: 'integer', nullable: false, default: 1 })
  schemaVersion!: number

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
