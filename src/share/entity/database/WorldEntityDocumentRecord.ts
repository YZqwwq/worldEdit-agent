import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm'
import type {
  WorldEntityDocumentContentFormat,
  WorldEntityDocumentOwnerKind
} from '@share/cache/worldbuilding/worldEntityDocument'

@Entity('world_entity_document_record')
@Index(['ownerKind', 'worldId', 'ownerEntityId', 'parentDocumentId', 'sortKey'])
@Index(['ownerKind', 'worldId', 'ownerEntityId', 'updatedAt'])
export class WorldEntityDocumentRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false, default: 'entity' })
  ownerKind!: WorldEntityDocumentOwnerKind

  @Column({ type: 'text', nullable: false })
  worldId!: string

  @Column({ type: 'text', nullable: true })
  ownerEntityId!: string | null

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
