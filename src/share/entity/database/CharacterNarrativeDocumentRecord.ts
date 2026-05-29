import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm'
import type { CharacterNarrativeContentFormat } from '@share/cache/worldbuilding/characterNarrativeDocument'

@Entity('character_narrative_document_record')
@Index(['characterEntityId', 'parentDocumentId', 'sortKey'])
@Index(['characterEntityId', 'updatedAt'])
export class CharacterNarrativeDocumentRecord {
  @PrimaryColumn({ type: 'text' })
  id!: string

  @Column({ type: 'text', nullable: false })
  characterEntityId!: string

  @Column({ type: 'text', nullable: true })
  parentDocumentId!: string | null

  @Column({ type: 'text', nullable: false, default: '新建文件' })
  title!: string

  @Column({ type: 'text', nullable: false, default: '' })
  contentHtml!: string

  @Column({ type: 'text', nullable: false, default: 'html' })
  contentFormat!: CharacterNarrativeContentFormat

  @Column({ type: 'text', nullable: false, default: '' })
  sortKey!: string

  @Column({ type: 'integer', nullable: false, default: 1 })
  schemaVersion!: number

  @CreateDateColumn()
  createdAt!: Date

  @UpdateDateColumn()
  updatedAt!: Date
}
