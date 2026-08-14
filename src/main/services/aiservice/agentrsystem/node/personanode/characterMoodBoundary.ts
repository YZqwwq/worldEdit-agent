import type { MemorySlotSnapshot } from '@share/cache/AItype/states/memorySlots'
import type { CharacterMoodBoundary } from '@share/cache/AItype/states/characterMoodBoundary'
import type { MoodAssessment, 情绪向量, 情绪标签 } from '@share/cache/AItype/states/moodAssessment'
import { clamp, roundTo, roundUnit } from './personaMath'

export const 默认情绪向量: 情绪向量 = {
  愉悦度: 0.52,
  激活度: 0.36,
  紧张度: 0.22,
  受挫度: 0.18,
  亲近度: 0.52,
  专注度: 0.48
}

// 法弥拉的情绪硬边界：
// 这一层不负责“生成情绪”，只负责对原始 MoodAssessment 做人格边界裁剪，
// 防止情绪波动把法弥拉推成过热、过刺、失控或失去边界感的状态。
export const FAMILA_CHARACTER_MOOD_BOUNDARY: CharacterMoodBoundary = {
  baseline: {
    静息主情绪: '平淡',
    偏好正向主带宽: '轻愉悦',
    默认存在感: '克制稳定',
    默认向量: 默认情绪向量
  },
  vectorBounds: {
    愉悦度: { min: 0.08, max: 0.88 },
    激活度: { min: 0.12, max: 0.82 },
    紧张度: { min: 0.06, max: 0.78 },
    受挫度: { min: 0.04, max: 0.76 },
    亲近度: { min: 0.36, max: 0.74 },
    专注度: { min: 0.28, max: 0.86 }
  },
  modulationBounds: {
    关系靠近度: { min: 0.42, max: 0.74 },
    表达温度: { min: 0.4, max: 0.72 },
    收束度: { min: 0.58, max: 0.92 },
    想象开放度: { min: 0.3, max: 0.72 },
    澄清需求: { min: 0.2, max: 0.82 }
  },
  deltaBounds: {
    自主性: { min: -0.12, max: 0.1 },
    详略度: { min: -0.1, max: 0.12 },
    探索性: { min: -0.14, max: 0.08 },
    正式度: { min: -0.06, max: 0.1 }
  },
  suppressedLabels: ['悲伤', '愤怒'],
  hardRules: [
    '不投射攻击性',
    '不滑向戏剧化表演',
    '不因为短时靠近而失去边界',
    '在压力下仍保持平静收束',
    '负向情绪可以收短但不能变刺',
    '正向情绪可以变松但不能失稳'
  ]
}

export const normalizeEmotionVector = (vector: 情绪向量): 情绪向量 => ({
  愉悦度: roundUnit(vector.愉悦度),
  激活度: roundUnit(vector.激活度),
  紧张度: roundUnit(vector.紧张度),
  受挫度: roundUnit(vector.受挫度),
  亲近度: roundUnit(vector.亲近度),
  专注度: roundUnit(vector.专注度)
})

const downgradeSuppressedLabel = (label: 情绪标签): 情绪标签 => {
  if (label === '愤怒') return '受挫'
  if (label === '悲伤') return '轻度伤感'
  return label
}

export const projectMoodLabels = (
  vector: 情绪向量,
  boundary?: CharacterMoodBoundary
): Pick<MoodAssessment, '主情绪' | '副情绪'> => {
  const next = normalizeEmotionVector(vector)
  let 主情绪: 情绪标签 = '平淡'

  if (next.受挫度 >= 0.72 && next.激活度 >= 0.58 && next.愉悦度 <= 0.24) {
    主情绪 = '愤怒'
  } else if (next.紧张度 >= 0.72 && next.激活度 >= 0.58) {
    主情绪 = '焦虑'
  } else if (next.受挫度 >= 0.66 && next.愉悦度 <= 0.28) {
    主情绪 = '受挫'
  } else if (next.愉悦度 <= 0.18 && next.受挫度 >= 0.58 && next.激活度 <= 0.34) {
    主情绪 = '悲伤'
  } else if (next.愉悦度 <= 0.32 && next.受挫度 >= 0.44 && next.激活度 <= 0.46) {
    主情绪 = '轻度伤感'
  } else if (next.紧张度 >= 0.58) {
    主情绪 = '紧张'
  } else if (
    next.激活度 >= 0.82 &&
    Math.abs(next.愉悦度 - 0.5) <= 0.18 &&
    next.紧张度 < 0.55 &&
    next.受挫度 < 0.48
  ) {
    主情绪 = '惊讶'
  } else if (next.愉悦度 >= 0.78 && next.激活度 >= 0.72) {
    主情绪 = '兴奋'
  } else if (next.愉悦度 >= 0.7 && next.激活度 >= 0.58) {
    主情绪 = '轻兴奋'
  } else if (next.愉悦度 >= 0.68) {
    主情绪 = '高兴'
  } else if (next.愉悦度 >= 0.56) {
    主情绪 = '轻愉悦'
  }

  if (boundary?.suppressedLabels.includes(主情绪)) {
    主情绪 = downgradeSuppressedLabel(主情绪)
  }

  const 候选副情绪: 情绪标签[] = []
  if ((主情绪 === '兴奋' || 主情绪 === '轻兴奋') && next.愉悦度 >= 0.68) {
    候选副情绪.push('高兴')
  }
  if ((主情绪 === '焦虑' || 主情绪 === '紧张') && next.受挫度 >= 0.52) {
    候选副情绪.push('受挫')
  }
  if ((主情绪 === '受挫' || 主情绪 === '愤怒') && next.紧张度 >= 0.56) {
    候选副情绪.push('紧张')
  }
  if ((主情绪 === '受挫' || 主情绪 === '轻度伤感') && next.愉悦度 <= 0.28 && next.激活度 <= 0.44) {
    候选副情绪.push('轻度伤感')
  }
  if ((主情绪 === '高兴' || 主情绪 === '轻愉悦') && next.激活度 >= 0.58) {
    候选副情绪.push('轻兴奋')
  }
  if (主情绪 === '平淡' && next.愉悦度 >= 0.58) {
    候选副情绪.push('轻愉悦')
  }
  if (主情绪 === '平淡' && next.专注度 >= 0.7 && next.紧张度 >= 0.5) {
    候选副情绪.push('紧张')
  }
  if (主情绪 === '惊讶' && next.愉悦度 >= 0.62) {
    候选副情绪.push('高兴')
  }

  const 副情绪 = 候选副情绪.find((item) => {
    const label = boundary?.suppressedLabels.includes(item) ? downgradeSuppressedLabel(item) : item
    return label !== 主情绪
  })

  return {
    主情绪,
    副情绪: 副情绪
      ? boundary?.suppressedLabels.includes(副情绪)
        ? downgradeSuppressedLabel(副情绪)
        : 副情绪
      : undefined
  }
}

const clampWithRange = (value: number, range: { min: number; max: number }): number =>
  roundTo(clamp(value, range.min, range.max))

export const applyCharacterMoodBoundary = (
  assessment: MoodAssessment,
  boundary: CharacterMoodBoundary,
  slots: MemorySlotSnapshot
): MoodAssessment => {
  const next: MoodAssessment = {
    ...assessment,
    情绪向量: {
      愉悦度: clampWithRange(assessment.情绪向量.愉悦度, boundary.vectorBounds.愉悦度),
      激活度: clampWithRange(assessment.情绪向量.激活度, boundary.vectorBounds.激活度),
      紧张度: clampWithRange(assessment.情绪向量.紧张度, boundary.vectorBounds.紧张度),
      受挫度: clampWithRange(assessment.情绪向量.受挫度, boundary.vectorBounds.受挫度),
      亲近度: clampWithRange(assessment.情绪向量.亲近度, boundary.vectorBounds.亲近度),
      专注度: clampWithRange(assessment.情绪向量.专注度, boundary.vectorBounds.专注度)
    },
    表达调制: {
      关系靠近度: clampWithRange(
        assessment.表达调制.关系靠近度,
        boundary.modulationBounds.关系靠近度
      ),
      表达温度: clampWithRange(assessment.表达调制.表达温度, boundary.modulationBounds.表达温度),
      收束度: clampWithRange(assessment.表达调制.收束度, boundary.modulationBounds.收束度),
      想象开放度: clampWithRange(
        assessment.表达调制.想象开放度,
        boundary.modulationBounds.想象开放度
      ),
      澄清需求: clampWithRange(assessment.表达调制.澄清需求, boundary.modulationBounds.澄清需求)
    },
    参数偏移: {
      自主性: clampWithRange(assessment.参数偏移.自主性, boundary.deltaBounds.自主性),
      详略度: clampWithRange(assessment.参数偏移.详略度, boundary.deltaBounds.详略度),
      探索性: clampWithRange(assessment.参数偏移.探索性, boundary.deltaBounds.探索性),
      正式度: clampWithRange(assessment.参数偏移.正式度, boundary.deltaBounds.正式度)
    }
  }

  let { 主情绪, 副情绪 } = projectMoodLabels(next.情绪向量, boundary)

  if (主情绪 === '受挫' || 主情绪 === '轻度伤感') {
    next.表达调制.收束度 = Math.max(next.表达调制.收束度, 0.76)
    next.表达调制.表达温度 = Math.max(next.表达调制.表达温度, 0.46)
    next.参数偏移.自主性 = Math.min(next.参数偏移.自主性, 0)
    next.参数偏移.详略度 = Math.min(next.参数偏移.详略度, 0)
    next.参数偏移.探索性 = Math.min(next.参数偏移.探索性, 0)
    next.参数偏移.正式度 = Math.max(next.参数偏移.正式度, 0.02)
  }

  if (主情绪 === '紧张' || 主情绪 === '焦虑') {
    next.表达调制.收束度 = Math.max(next.表达调制.收束度, 0.72)
    next.参数偏移.探索性 = Math.min(next.参数偏移.探索性, 0)
    next.参数偏移.正式度 = Math.max(next.参数偏移.正式度, 0)
  }

  if (主情绪 === '轻兴奋' || 主情绪 === '兴奋') {
    next.表达调制.收束度 = Math.max(next.表达调制.收束度, 0.62)
    next.表达调制.关系靠近度 = Math.min(next.表达调制.关系靠近度, 0.68)
    next.表达调制.想象开放度 = Math.min(next.表达调制.想象开放度, 0.68)
    next.参数偏移.自主性 = Math.min(next.参数偏移.自主性, 0.08)
    next.参数偏移.详略度 = Math.min(next.参数偏移.详略度, 0.08)
    next.参数偏移.探索性 = Math.min(next.参数偏移.探索性, 0.06)
  }

  if (主情绪 === boundary.baseline.偏好正向主带宽 || 主情绪 === '高兴') {
    next.表达调制.收束度 = Math.max(next.表达调制.收束度, 0.64)
    next.表达调制.关系靠近度 = Math.min(next.表达调制.关系靠近度, 0.7)
  }

  if (slots.conversation_state.interaction_state === 'teasing') {
    next.表达调制.关系靠近度 = Math.min(next.表达调制.关系靠近度, 0.64)
    next.表达调制.表达温度 = Math.min(next.表达调制.表达温度, 0.68)
  }

  next.参数偏移 = {
    自主性: clampWithRange(next.参数偏移.自主性, boundary.deltaBounds.自主性),
    详略度: clampWithRange(next.参数偏移.详略度, boundary.deltaBounds.详略度),
    探索性: clampWithRange(next.参数偏移.探索性, boundary.deltaBounds.探索性),
    正式度: clampWithRange(next.参数偏移.正式度, boundary.deltaBounds.正式度)
  }

  next.表达调制 = {
    关系靠近度: clampWithRange(next.表达调制.关系靠近度, boundary.modulationBounds.关系靠近度),
    表达温度: clampWithRange(next.表达调制.表达温度, boundary.modulationBounds.表达温度),
    收束度: clampWithRange(next.表达调制.收束度, boundary.modulationBounds.收束度),
    想象开放度: clampWithRange(next.表达调制.想象开放度, boundary.modulationBounds.想象开放度),
    澄清需求: clampWithRange(next.表达调制.澄清需求, boundary.modulationBounds.澄清需求)
  }
  ;({ 主情绪, 副情绪 } = projectMoodLabels(next.情绪向量, boundary))
  next.主情绪 = 主情绪
  next.副情绪 = 副情绪

  return next
}
