import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm'

@Entity('message')
export class Message {
  // 主键，自增
  @PrimaryGeneratedColumn()
  id!: number

  // 角色：用户或 AI
  @Column({
    type: 'text', // SQLite 中 text 类型兼容性最好
    nullable: false
  })
  role!: 'user' | 'ai'

  // 消息内容
  @Column({
    type: 'text',
    nullable: false
  })
  content!: string

  // 消息类型：text 或 structured
  @Column({
    type: 'text',
    default: 'text'
  })
  type!: string

  // 会话 ID，用于关联消息（某次任务或对话）
  @Column({
    type: 'text',
    default: 'default'
  })
  sessionId!: string

  // 创建时间
  @CreateDateColumn()
  createdAt!: Date
}
