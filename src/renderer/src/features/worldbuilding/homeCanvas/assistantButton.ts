import type { HomeCanvasPalette, HomeCanvasTarget } from './types'

export const HOME_ASSISTANT_BUTTON = {
  size: 82,
  rings: [
    { radiusRatio: 0.4, hoverRadiusRatio: 0.48, lineWidth: 1, alpha: 0.72 },
    { radiusRatio: 0.24, hoverRadiusRatio: 0.3, lineWidth: 1, alpha: 0.48 }
  ],
  hover: {
    panelRadiusRatio: 0.38,
    panelAlpha: 0.72,
    progressSpeed: 7
  },
  label: {
    fontSize: 13,
    fontWeight: 750
  }
} as const

export const drawHomeAssistantButton = (
  ctx: CanvasRenderingContext2D,
  palette: HomeCanvasPalette,
  x: number,
  y: number,
  _time: number,
  hoverProgress: number
): HomeCanvasTarget => {
  const size = HOME_ASSISTANT_BUTTON.size
  const centerX = x + size / 2
  const centerY = y + size / 2
  const baseRadius = size / 2

  ctx.save()

  if (hoverProgress > 0) {
    ctx.fillStyle = palette.panelHover
    ctx.globalAlpha = HOME_ASSISTANT_BUTTON.hover.panelAlpha * hoverProgress
    ctx.beginPath()
    ctx.arc(
      centerX,
      centerY,
      baseRadius * HOME_ASSISTANT_BUTTON.hover.panelRadiusRatio,
      0,
      Math.PI * 2
    )
    ctx.fill()
  }

  ctx.strokeStyle = palette.line
  for (const ring of HOME_ASSISTANT_BUTTON.rings) {
    const radiusRatio =
      ring.radiusRatio + (ring.hoverRadiusRatio - ring.radiusRatio) * hoverProgress
    ctx.lineWidth = ring.lineWidth
    ctx.globalAlpha = ring.alpha
    ctx.beginPath()
    ctx.arc(centerX, centerY, baseRadius * radiusRatio, 0, Math.PI * 2)
    ctx.stroke()
  }

  ctx.globalAlpha = 1
  ctx.fillStyle = palette.ink
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${HOME_ASSISTANT_BUTTON.label.fontWeight} ${HOME_ASSISTANT_BUTTON.label.fontSize}px sans-serif`
  ctx.fillText('AI', centerX, centerY)

  ctx.restore()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  return {
    kind: 'assistant',
    rect: { x, y, w: size, h: size }
  }
}
