import type { HomeCanvasPalette, HomeCanvasTarget } from './types'

export const HOME_CREATE_BUTTON = {
  // 4 层同心圆。从内到外配置。radiusRatio 表示当前按钮最大半径的比例。
  rings: [
    {
      radiusRatio: 0.22,
      lineWidth: 0.6,
      alpha: 0.7,
      points: [
        { angle: 0, visible: false, sizeRatio: 0.014, lightness: 24, alpha: 0.32 },
        { angle: 90, visible: false, sizeRatio: 0.014, lightness: 24, alpha: 0.32 },
        { angle: 180, visible: false, sizeRatio: 0.014, lightness: 24, alpha: 0.32 },
        { angle: 270, visible: false, sizeRatio: 0.014, lightness: 24, alpha: 0.32 }
      ]
    },
    {
      radiusRatio: 0.38,
      lineWidth: 0.8,
      alpha: 0.7,
      points: [
        { angle: 0, visible: false, sizeRatio: 0.016, lightness: 24, alpha: 0.36 },
        { angle: 90, visible: false, sizeRatio: 0.016, lightness: 24, alpha: 0.36 },
        { angle: 180, visible: false, sizeRatio: 0.016, lightness: 24, alpha: 0.36 },
        { angle: 270, visible: false, sizeRatio: 0.016, lightness: 24, alpha: 0.36 }
      ]
    },
    {
      radiusRatio: 0.54,
      lineWidth: 1,
      alpha: 1,
      points: [
        { angle: 0, visible: false, sizeRatio: 0.018, lightness: 24, alpha: 0.38 },
        { angle: 90, visible: true, sizeRatio: 0.018, lightness: 24, alpha: 0.38 },
        { angle: 180, visible: false, sizeRatio: 0.018, lightness: 24, alpha: 0.38 },
        { angle: 270, visible: false, sizeRatio: 0.018, lightness: 24, alpha: 0.38 }
      ]
    },
    {
      radiusRatio: 0.86,
      lineWidth: 0.4,
      alpha: 0.7,
      points: [
        { angle: 0, visible: true, sizeRatio: 0.012, lightness: 24, alpha: 0.24 },
        { angle: 90, visible: false, sizeRatio: 0.012, lightness: 24, alpha: 0.24 },
        { angle: 180, visible: true, sizeRatio: 0.012, lightness: 24, alpha: 0.24 },
        { angle: 270, visible: true, sizeRatio: 0.012, lightness: 24, alpha: 0.24 }
      ]
    }
  ],
  // 不同圆环之间的同角度顶点连线。实际点位配置在每个 ring.points 中。
  vertexConnections: {
    enabled: true,
    angles: [0, 90, 180, 270],
    connectAlpha: 0.8,
    connectLineWidth: 1
  },
  cross: {
    sizeRatio: 0.12,
    lineWidth: 1,
    alpha: 1
  },
  hover: {
    centerRadiusRatio: 0.28,
    centerAlphaLight: 0.92,
    centerAlphaDark: 0.1,
    innerRingExpandRatio: 0.035,
    progressSpeed: 5,
    shadowBlur: 30,
    shadowOffsetY: 10
  },
  label: {
    yOffsetRatio: 1.28,
    alpha: 1
  }
} as const

export const drawHomeCreateButton = (
  ctx: CanvasRenderingContext2D,
  palette: HomeCanvasPalette,
  theme: 'light' | 'dark',
  x: number,
  y: number,
  radius: number,
  time: number,
  hoverProgress: number
): HomeCanvasTarget => {
  const target = {
    kind: 'create' as const,
    rect: {
      x: x - radius,
      y: y - radius,
      w: radius * 2,
      h: radius * 2
    }
  }
  const isHover = hoverProgress > 0
  const easedHoverProgress = 1 - Math.pow(1 - hoverProgress, 3)
  const idlePulse = isHover ? 0 : (Math.sin(time * 0.004) + 1) / 2
  const getRingRadiusRatio = (ringIndex: number, radiusRatio: number): number =>
    radiusRatio +
    (ringIndex < 3 ? HOME_CREATE_BUTTON.hover.innerRingExpandRatio * easedHoverProgress : 0)

  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = palette.line
  ctx.fillStyle = palette.ink

  for (const [ringIndex, ring] of HOME_CREATE_BUTTON.rings.entries()) {
    ctx.lineWidth = ring.lineWidth
    ctx.globalAlpha = ring.alpha + 0.1 * easedHoverProgress + idlePulse * 0.08
    ctx.beginPath()
    ctx.arc(0, 0, radius * getRingRadiusRatio(ringIndex, ring.radiusRatio), 0, Math.PI * 2)
    ctx.stroke()
  }

  if (HOME_CREATE_BUTTON.vertexConnections.enabled) {
    const vertexLines = HOME_CREATE_BUTTON.vertexConnections.angles.map((angle) => {
      const radian = (angle * Math.PI) / 180
      return HOME_CREATE_BUTTON.rings
        .map((ring, ringIndex) => ({ ring, ringIndex }))
        .filter(({ ring }) => ring.points.some((point) => point.visible && point.angle === angle))
        .map(({ ring, ringIndex }) => {
          const vertexRadius = radius * getRingRadiusRatio(ringIndex, ring.radiusRatio)
          return {
            x: Math.cos(radian) * vertexRadius,
            y: Math.sin(radian) * vertexRadius
          }
        })
    })

    ctx.strokeStyle = palette.line
    ctx.lineWidth = HOME_CREATE_BUTTON.vertexConnections.connectLineWidth
    ctx.globalAlpha = HOME_CREATE_BUTTON.vertexConnections.connectAlpha
    for (const points of vertexLines) {
      if (points.length < 2) continue
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      for (const point of points.slice(1)) {
        ctx.lineTo(point.x, point.y)
      }
      ctx.stroke()
    }
  }

  for (const [ringIndex, ring] of HOME_CREATE_BUTTON.rings.entries()) {
    const ringRadius = radius * getRingRadiusRatio(ringIndex, ring.radiusRatio)
    for (const point of ring.points) {
      if (!point.visible) continue
      const radian = (point.angle * Math.PI) / 180
      ctx.fillStyle = `rgb(${point.lightness}, ${point.lightness}, ${point.lightness})`
      ctx.globalAlpha = point.alpha
      ctx.beginPath()
      ctx.arc(
        Math.cos(radian) * ringRadius,
        Math.sin(radian) * ringRadius,
        radius * point.sizeRatio,
        0,
        Math.PI * 2
      )
      ctx.fill()
    }
  }

  if (hoverProgress > 0) {
    ctx.shadowColor = palette.panelShadow
    ctx.shadowBlur = HOME_CREATE_BUTTON.hover.shadowBlur * easedHoverProgress
    ctx.shadowOffsetY = HOME_CREATE_BUTTON.hover.shadowOffsetY * easedHoverProgress
    ctx.beginPath()
    ctx.arc(0, 0, radius * HOME_CREATE_BUTTON.hover.centerRadiusRatio, 0, Math.PI * 2)
    ctx.fillStyle =
      theme === 'dark'
        ? `rgba(255,255,255,${HOME_CREATE_BUTTON.hover.centerAlphaDark * easedHoverProgress})`
        : `rgba(255,255,255,${HOME_CREATE_BUTTON.hover.centerAlphaLight * easedHoverProgress})`
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0
  }

  ctx.globalAlpha = HOME_CREATE_BUTTON.cross.alpha
  ctx.strokeStyle = palette.ink
  ctx.lineWidth = HOME_CREATE_BUTTON.cross.lineWidth
  const crossSize = radius * HOME_CREATE_BUTTON.cross.sizeRatio
  ctx.beginPath()
  ctx.moveTo(-crossSize, 0)
  ctx.lineTo(crossSize, 0)
  ctx.moveTo(0, -crossSize)
  ctx.lineTo(0, crossSize)
  ctx.stroke()

  if (hoverProgress > 0) {
    ctx.globalAlpha = HOME_CREATE_BUTTON.label.alpha * easedHoverProgress
    ctx.fillStyle = palette.ink
    ctx.textAlign = 'center'
    ctx.fillText('创建世界观', 0, radius * HOME_CREATE_BUTTON.label.yOffsetRatio)
  }

  ctx.restore()
  ctx.textAlign = 'left'
  return target
}
