import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm'

@Entity('memory_entry')
export class MemoryEntry {
  // 自增主键
  @PrimaryGeneratedColumn()
  id!: number

  // 消息角色（user/ai）
  @Column({ type: 'text', nullable: false })
  role!: string

  // 消息正文
  @Column({ type: 'text', nullable: false })
  content!: string

  // 发生时间（ISO 字符串）
  @Column({ type: 'text', nullable: false })
  timestamp!: string

  // 是否已经被压缩进长期摘要
  @Column({ type: 'boolean', default: false })
  compressed!: boolean

  // 压缩时间（ISO 字符串，未压缩时为空）
  @Column({ type: 'text', default: '' })
  compressedAt!: string
}
