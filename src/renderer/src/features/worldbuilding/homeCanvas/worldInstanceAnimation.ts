import { clamp } from './drawingPrimitives'

// 世界入口 hover 进入动画时序，单位：毫秒。
export const WORLD_INSTANCE_ENTER_ANIMATION_MS = {
  fragmentGather: 1000, // 离散矩形聚合
  fragmentShadowFade: 400, // 聚合后碎片阴影消失
  cornerCut: 600, // 完整矩形收为 6 边形
  brighten: 300, // 6 边形提高明度与不透明度
  dotFade: 400, // 点阵淡入
  lineFade: 400, // 平面线条淡入
  textFade: 400, // 世界属性文字淡入
  enterFade: 400 // “进入”入口淡入
} as const

export const WORLD_INSTANCE_ENTER_TOTAL_MS =
  WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentGather +
  WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentShadowFade +
  WORLD_INSTANCE_ENTER_ANIMATION_MS.cornerCut +
  WORLD_INSTANCE_ENTER_ANIMATION_MS.brighten +
  WORLD_INSTANCE_ENTER_ANIMATION_MS.dotFade +
  WORLD_INSTANCE_ENTER_ANIMATION_MS.lineFade +
  WORLD_INSTANCE_ENTER_ANIMATION_MS.textFade +
  WORLD_INSTANCE_ENTER_ANIMATION_MS.enterFade

// 世界入口 hover 退出动画时序，单位：毫秒。
// 6 边形内部内容统一淡出；外部形体阶段保留独立参数，便于单独调节。
export const WORLD_INSTANCE_EXIT_ANIMATION_MS = {
  contentFade: 300, // 明度、点阵、线条、文字、“进入”统一淡出
  cornerCut: 300, // 6 边形还原为完整矩形
  fragmentShadowFade: 120, // 碎片阴影恢复
  fragmentGather: 1000 // 完整矩形重新离散
} as const

export const WORLD_INSTANCE_EXIT_TOTAL_MS =
  WORLD_INSTANCE_EXIT_ANIMATION_MS.contentFade +
  WORLD_INSTANCE_EXIT_ANIMATION_MS.cornerCut +
  WORLD_INSTANCE_EXIT_ANIMATION_MS.fragmentShadowFade +
  WORLD_INSTANCE_EXIT_ANIMATION_MS.fragmentGather

const enterTimeline = {
  fragmentGather: { start: 0, duration: WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentGather },
  fragmentShadowFade: {
    start: WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentGather,
    duration: WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentShadowFade
  },
  cornerCut: {
    start:
      WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentGather +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentShadowFade,
    duration: WORLD_INSTANCE_ENTER_ANIMATION_MS.cornerCut
  },
  brighten: {
    start:
      WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentGather +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentShadowFade +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.cornerCut,
    duration: WORLD_INSTANCE_ENTER_ANIMATION_MS.brighten
  },
  dotFade: {
    start:
      WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentGather +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentShadowFade +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.cornerCut +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.brighten,
    duration: WORLD_INSTANCE_ENTER_ANIMATION_MS.dotFade
  },
  lineFade: {
    start:
      WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentGather +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentShadowFade +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.cornerCut +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.brighten +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.dotFade,
    duration: WORLD_INSTANCE_ENTER_ANIMATION_MS.lineFade
  },
  textFade: {
    start:
      WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentGather +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentShadowFade +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.cornerCut +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.brighten +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.dotFade +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.lineFade,
    duration: WORLD_INSTANCE_ENTER_ANIMATION_MS.textFade
  },
  enterFade: {
    start:
      WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentGather +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentShadowFade +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.cornerCut +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.brighten +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.dotFade +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.lineFade +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.textFade,
    duration: WORLD_INSTANCE_ENTER_ANIMATION_MS.enterFade
  },
  shadowFade: {
    start:
      WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentGather +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.fragmentShadowFade +
      WORLD_INSTANCE_ENTER_ANIMATION_MS.cornerCut +
      Math.round(WORLD_INSTANCE_ENTER_ANIMATION_MS.brighten * 0.1),
    duration: Math.round(WORLD_INSTANCE_ENTER_ANIMATION_MS.brighten * 0.8)
  }
} as const

export type WorldInstanceEnterStage = keyof typeof enterTimeline

const exitTimeline = {
  contentFade: { start: 0, duration: WORLD_INSTANCE_EXIT_ANIMATION_MS.contentFade },
  cornerCut: {
    start: WORLD_INSTANCE_EXIT_ANIMATION_MS.contentFade,
    duration: WORLD_INSTANCE_EXIT_ANIMATION_MS.cornerCut
  },
  fragmentShadowFade: {
    start: WORLD_INSTANCE_EXIT_ANIMATION_MS.contentFade + WORLD_INSTANCE_EXIT_ANIMATION_MS.cornerCut,
    duration: WORLD_INSTANCE_EXIT_ANIMATION_MS.fragmentShadowFade
  },
  fragmentGather: {
    start:
      WORLD_INSTANCE_EXIT_ANIMATION_MS.contentFade +
      WORLD_INSTANCE_EXIT_ANIMATION_MS.cornerCut +
      WORLD_INSTANCE_EXIT_ANIMATION_MS.fragmentShadowFade,
    duration: WORLD_INSTANCE_EXIT_ANIMATION_MS.fragmentGather
  }
} as const

export type WorldInstanceExitStage = keyof typeof exitTimeline

export const getWorldInstanceEnterStageProgress = (
  progress: number,
  stage: WorldInstanceEnterStage
): number => {
  const elapsed = progress * WORLD_INSTANCE_ENTER_TOTAL_MS
  const { start, duration } = enterTimeline[stage]
  return clamp((elapsed - start) / duration, 0, 1)
}

export const hasWorldInstanceEnterStageStarted = (
  progress: number,
  stage: WorldInstanceEnterStage
): boolean => {
  const elapsed = progress * WORLD_INSTANCE_ENTER_TOTAL_MS
  return elapsed >= enterTimeline[stage].start
}

export const getWorldInstanceExitStageProgress = (
  progress: number,
  stage: WorldInstanceExitStage
): number => {
  const elapsed = (1 - progress) * WORLD_INSTANCE_EXIT_TOTAL_MS
  const { start, duration } = exitTimeline[stage]
  return clamp((elapsed - start) / duration, 0, 1)
}
