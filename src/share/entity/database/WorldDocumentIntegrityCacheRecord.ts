import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm'

@Entity('world_document_integrity_cache')
export class WorldDocumentIntegrityCacheRecord {
  @PrimaryColumn({ type: 'text' })
  worldId!: string

  @Column({ type: 'integer', nullable: false, default: 0 })
  generation!: number

  @Column({ type: 'integer', nullable: false, default: -1 })
  verifiedGeneration!: number

  @Column({ type: 'text', nullable: true })
  reportJson!: string | null

  @Column({ type: 'datetime', nullable: true })
  verifiedAt!: Date | null

  @UpdateDateColumn()
  updatedAt!: Date
}
