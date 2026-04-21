import type { 情绪参数偏移, 情绪向量, 情绪标签, 情绪表达调制 } from './moodAssessment'

export interface 情绪范围 {
  min: number
  max: number
}

export interface 人格情绪基线 {
  静息主情绪: '平淡'
  偏好正向主带宽: '轻愉悦'
  默认存在感: '克制稳定'
  默认向量: 情绪向量
}

export interface CharacterMoodBoundary {
  baseline: 人格情绪基线
  vectorBounds: {
    [K in keyof 情绪向量]: 情绪范围
  }
  modulationBounds: {
    [K in keyof 情绪表达调制]: 情绪范围
  }
  deltaBounds: {
    [K in keyof 情绪参数偏移]: 情绪范围
  }
  suppressedLabels: 情绪标签[]
  hardRules: string[]
}
