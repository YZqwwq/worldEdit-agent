import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm'

@Entity('world_document_tree_object')
export class WorldDocumentTreeObjectRecord {
  @PrimaryColumn({ type: 'text' })
  hash!: string

  @Column({ type: 'text', nullable: false })
  entriesJson!: string

  @CreateDateColumn()
  createdAt!: Date
}
