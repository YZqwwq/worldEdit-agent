import type { HomeCanvasStageRegion } from './types'

export const HOME_CANVAS_STAGE_LEFT_RATIO = 0.11
export const HOME_CANVAS_STAGE_GUIDE_Y_RATIO = 0.46

export const getHomeCanvasStageRegion = (
  sceneWidth: number,
  sceneHeight: number
): HomeCanvasStageRegion => {
  const left = sceneWidth * HOME_CANVAS_STAGE_LEFT_RATIO
  const width = sceneWidth - left
  return {
    left,
    top: 0,
    width,
    height: sceneHeight,
    centerX: left + width * 0.5,
    centerY: sceneHeight * 0.5,
    guideY: sceneHeight * HOME_CANVAS_STAGE_GUIDE_Y_RATIO
  }
}
