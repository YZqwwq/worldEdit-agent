export type 情绪标签 =
  | '平淡'
  | '轻愉悦'
  | '高兴'
  | '轻兴奋'
  | '兴奋'
  | '惊讶'
  | '轻度伤感'
  | '悲伤'
  | '受挫'
  | '愤怒'
  | '焦虑'
  | '紧张'

export interface 情绪向量 {
  愉悦度: number
  激活度: number
  紧张度: number
  受挫度: number
  亲近度: number
  专注度: number
}

export interface 情绪参数偏移 {
  自主性: number
  详略度: number
  探索性: number
  正式度: number
}

export interface 情绪表达调制 {
  关系靠近度: number
  表达温度: number
  收束度: number
  想象开放度: number
  澄清需求: number
}

export interface 情绪来源 {
  用户情绪?: string
  对话模式?: string
  交互状态?: string
  信号: string[]
}

export interface MoodAssessment {
  生成时间: string
  主情绪: 情绪标签
  副情绪?: 情绪标签
  情绪向量: 情绪向量
  强度: number
  置信度: number
  行为叙事: string
  参数偏移: 情绪参数偏移
  表达调制: 情绪表达调制
  来源: 情绪来源
}
