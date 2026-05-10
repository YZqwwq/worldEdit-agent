import { clamp, easeOutCubic } from './drawingPrimitives'
import type { HomeCanvasPalette, HomeCanvasTarget } from './types'

export const HOME_TOP_BARS = {
  count: 13,
  xRatio: 0.815,
  y: 45,
  barWidth: 1,
  baseHeight: 9,
  baseGap: 8,
  hoverGap: 12,
  alpha: 0.58,
  waveDuration: 820,
  waveExtraHeight: 20,
  waveJumpOffset: 5,
  waveSpreadDelay: 0.46,
  wavePulseWidth: 0.38,
  hitPaddingX: 18,
  hitPaddingY: 4
} as const

export const drawHomeTopBars = (
  ctx: CanvasRenderingContext2D,
  palette: HomeCanvasPalette,
  sceneWidth: number,
  _time: number,
  hoverProgress: number,
  waveProgress: number
): HomeCanvasTarget => {
  const hoverEase = easeOutCubic(hoverProgress)
  const gap = HOME_TOP_BARS.baseGap + (HOME_TOP_BARS.hoverGap - HOME_TOP_BARS.baseGap) * hoverEase
  const baseHeight = HOME_TOP_BARS.baseHeight
  const totalWidth = (HOME_TOP_BARS.count - 1) * gap + HOME_TOP_BARS.barWidth
  const centerX = sceneWidth * HOME_TOP_BARS.xRatio
  const x = centerX - totalWidth / 2
  const y = HOME_TOP_BARS.y
  const centerIndex = (HOME_TOP_BARS.count - 1) / 2

  ctx.save()
  ctx.fillStyle = palette.ink

  for (let index = 0; index < HOME_TOP_BARS.count; index += 1) {
    const distanceFromCenter = Math.abs(index - centerIndex) / centerIndex
    const waveStart = distanceFromCenter * HOME_TOP_BARS.waveSpreadDelay
    const waveLocal = clamp(
      (waveProgress - waveStart) / HOME_TOP_BARS.wavePulseWidth,
      0,
      1
    )
    const wavePulse = Math.sin(waveLocal * Math.PI)
    const height = baseHeight + HOME_TOP_BARS.waveExtraHeight * wavePulse
    const barX = x + index * gap
    const barY = y - height / 2 - HOME_TOP_BARS.waveJumpOffset * wavePulse

    ctx.globalAlpha = HOME_TOP_BARS.alpha + 0.18 * wavePulse
    ctx.fillRect(barX, barY, HOME_TOP_BARS.barWidth, height)
  }

  ctx.restore()

  return {
    kind: 'topBars',
    rect: {
      x: x - HOME_TOP_BARS.hitPaddingX,
      y: y - HOME_TOP_BARS.baseHeight / 2 - HOME_TOP_BARS.hitPaddingY,
      w: totalWidth + HOME_TOP_BARS.hitPaddingX * 2,
      h: HOME_TOP_BARS.baseHeight + HOME_TOP_BARS.hitPaddingY * 2
    }
  }
}
