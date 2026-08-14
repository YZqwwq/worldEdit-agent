import type {
  MoodAssessment,
  情绪参数偏移,
  情绪向量,
  情绪表达调制
} from '@share/cache/AItype/states/moodAssessment'
import { clamp, roundSigned, roundUnit } from './personaMath'
import { 默认情绪向量, normalizeEmotionVector, projectMoodLabels } from './characterMoodBoundary'

export interface MoodInferenceState {
  情绪向量: 情绪向量
  置信度: number
  行为叙事: string
}

interface CompileMoodAssessmentInput {
  inferred: MoodInferenceState
  previousMood?: MoodAssessment | null | undefined
  nowIso: string
  source: MoodAssessment['来源']
}

const PREVIOUS_MOOD_RETENTION = 0.72

const mix = (from: number, to: number, ratio: number): number =>
  roundUnit(from + (to - from) * clamp(ratio, 0, 1))

const decayPreviousMood = (previous: 情绪向量 | null | undefined): 情绪向量 => {
  if (!previous) return { ...默认情绪向量 }

  return {
    愉悦度: mix(默认情绪向量.愉悦度, previous.愉悦度, PREVIOUS_MOOD_RETENTION),
    激活度: mix(默认情绪向量.激活度, previous.激活度, PREVIOUS_MOOD_RETENTION),
    紧张度: mix(默认情绪向量.紧张度, previous.紧张度, PREVIOUS_MOOD_RETENTION),
    受挫度: mix(默认情绪向量.受挫度, previous.受挫度, PREVIOUS_MOOD_RETENTION),
    亲近度: mix(默认情绪向量.亲近度, previous.亲近度, PREVIOUS_MOOD_RETENTION),
    专注度: mix(默认情绪向量.专注度, previous.专注度, PREVIOUS_MOOD_RETENTION)
  }
}

const blendInferredMood = (
  continuityBase: 情绪向量,
  inferred: 情绪向量,
  confidence: number
): 情绪向量 => ({
  愉悦度: mix(continuityBase.愉悦度, inferred.愉悦度, confidence),
  激活度: mix(continuityBase.激活度, inferred.激活度, confidence),
  紧张度: mix(continuityBase.紧张度, inferred.紧张度, confidence),
  受挫度: mix(continuityBase.受挫度, inferred.受挫度, confidence),
  亲近度: mix(continuityBase.亲近度, inferred.亲近度, confidence),
  专注度: mix(continuityBase.专注度, inferred.专注度, confidence)
})

const deriveMoodIntensity = (vector: 情绪向量): number => {
  const deltas = (Object.keys(默认情绪向量) as Array<keyof 情绪向量>).map(
    (key) => vector[key] - 默认情绪向量[key]
  )
  const rootMeanSquare = Math.sqrt(
    deltas.reduce((total, delta) => total + delta * delta, 0) / deltas.length
  )
  return roundUnit(rootMeanSquare * 1.8)
}

const deriveParameterDelta = (vector: 情绪向量): 情绪参数偏移 => {
  const pleasure = vector.愉悦度 - 默认情绪向量.愉悦度
  const activation = vector.激活度 - 默认情绪向量.激活度
  const tension = Math.max(0, vector.紧张度 - 默认情绪向量.紧张度)
  const frustration = Math.max(0, vector.受挫度 - 默认情绪向量.受挫度)
  const focus = vector.专注度 - 默认情绪向量.专注度

  return {
    自主性: roundSigned(
      clamp(focus * 0.14 + activation * 0.08 - tension * 0.1 - frustration * 0.12, -0.18, 0.18)
    ),
    详略度: roundSigned(
      clamp(activation * 0.14 + pleasure * 0.12 - frustration * 0.16, -0.18, 0.18)
    ),
    探索性: roundSigned(
      clamp(pleasure * 0.18 + activation * 0.14 - tension * 0.2 - frustration * 0.16, -0.18, 0.18)
    ),
    正式度: roundSigned(clamp(tension * 0.12 + frustration * 0.08 - pleasure * 0.06, -0.18, 0.18))
  }
}

const deriveExpressionModulation = (vector: 情绪向量): 情绪表达调制 => {
  const pleasure = vector.愉悦度 - 默认情绪向量.愉悦度
  const activation = vector.激活度 - 默认情绪向量.激活度
  const tension = Math.max(0, vector.紧张度 - 默认情绪向量.紧张度)
  const frustration = Math.max(0, vector.受挫度 - 默认情绪向量.受挫度)
  const closeness = vector.亲近度 - 默认情绪向量.亲近度
  const focus = vector.专注度 - 默认情绪向量.专注度

  return {
    关系靠近度: roundUnit(0.56 + closeness * 0.6 - tension * 0.08 - frustration * 0.1),
    表达温度: roundUnit(0.52 + pleasure * 0.4 + closeness * 0.25 - frustration * 0.2),
    收束度: roundUnit(
      0.72 + tension * 0.3 + frustration * 0.22 - pleasure * 0.12 - activation * 0.08
    ),
    想象开放度: roundUnit(
      0.42 + pleasure * 0.25 + activation * 0.2 - tension * 0.2 - frustration * 0.18
    ),
    澄清需求: roundUnit(0.34 + tension * 0.35 + frustration * 0.15 - focus * 0.12)
  }
}

const resolveNarrative = (narrative: string, confidence: number): string => {
  if (confidence < 0.35) {
    return '当前情绪变化信号较弱，延续既有状态并保持稳定、克制的在场方式。'
  }
  return narrative.trim()
}

// 将模型识别出的情绪目标编译为连续、可信且可受人格边界约束的阶段状态。
// 模型负责理解情境；代码负责连续性、置信度和派生参数，避免重复生成同一信息。
export const compileMoodAssessment = (input: CompileMoodAssessmentInput): MoodAssessment => {
  const confidence = roundUnit(input.inferred.置信度)
  const inferredVector = normalizeEmotionVector(input.inferred.情绪向量)
  const continuityBase = decayPreviousMood(input.previousMood?.情绪向量)
  const 情绪向量 = blendInferredMood(continuityBase, inferredVector, confidence)
  const { 主情绪, 副情绪 } = projectMoodLabels(情绪向量)

  return {
    生成时间: input.nowIso,
    主情绪,
    副情绪,
    情绪向量,
    强度: deriveMoodIntensity(情绪向量),
    置信度: confidence,
    行为叙事: resolveNarrative(input.inferred.行为叙事, confidence),
    参数偏移: deriveParameterDelta(情绪向量),
    表达调制: deriveExpressionModulation(情绪向量),
    来源: input.source
  }
}
