import { clamp, easeOutCubic } from './drawingPrimitives'
import type { HomeCanvasPalette, HomeCanvasTheme } from './types'

// 世界入口聚合后的“第二层”参数：只管六边形内部的装饰和文字位置。
// 所有坐标都是相对当前六边形矩形的比例，方便按屏幕尺寸自适应。
export const WORLD_INSTANCE_SECOND_LAYER = {
  content: {
    // 世界名称和摘要所在的右侧内容区。调 x 可以整体左右移动文字组。
    x: 0.52,
    width: 0.38,
    // 调 titleY / summaryY 可以上下移动世界名称和摘要。
    titleY: 0.18,
    summaryY: 0.28
  },
  enter: {
    // Enter 入口的基准 y。下划线和箭头都围绕这个值定位。
    y: 0.78,
    underlineYOffset: 14,
    underlineWidth: 0.81,
    clipWidth: 0.86,
    arrowYOffset: -5,
    arrowLength: 0.1
  },

  dotGroups: [
    {
      name: '右上点阵',
      // x / y 控制点阵起点。
      // gapRatio / sizeRatio 按六边形短边比例计算，避免固定 px 在不同设备上失衡。
      areaWidth: 0.42,
      x: 0.7,
      y: 0.05,
      rows: 7,
      cols: 5,
      gapRatio: 0.035,
      sizeRatio: 0.002,
      alpha: 0.8,
      // 扩散参数：值越小，中心到外围出现得越快；softness 越大，边缘越柔。
      spreadDistance: 0.82,
      spreadSoftness: 0.18
    },
    {
      name: '左下点阵',
      // x / y 控制点阵起点。
      // gapRatio / sizeRatio 按六边形短边比例计算，避免固定 px 在不同设备上失衡。
      areaWidth: 0.42,
      x: 0.17,
      y: 0.76,
      rows: 5,
      cols: 5,
      gapRatio: 0.035,
      sizeRatio: 0.002,
      alpha: 0.8,
      // 扩散参数：值越小，中心到外围出现得越快；softness 越大，边缘越柔。
      spreadDistance: 0.82,
      spreadSoftness: 0.18
    },

  ],

  line: {
    // 左侧平面线条区域宽度。所有线条和圆弧都在这个区域里按比例绘制。
    areaWidth: 0.42,
    alpha: 0.42,
    dividerAlpha: 0.78,
    orbAlpha: 0.18,
    blockAlpha: 0.5,
    orb: { x: 0.75, y: 0.40, radius: 0.11 },
    // 圆弧按顺时针绘制：start / sweep 都是 Math.PI 的倍数。
    arcs: [
      { cx: 0.9, cy: 0.55, radius: 0.9, start: -1, sweep: 0.5 },
      { cx: -0.1, cy: 0.9, radius: 0.85, start: -0.415, sweep: 0.4 }
    ],
    // 直线从 start 画到 end。可追加多条线，每条线可独立控制线宽和 alpha。
    diagonals: [
      { startX: 0.15, startY: 0.8, endX: 0.7, endY: 0.5, lineWidth: 1, alpha: 1 },
      { startX: 0.12, startY: 0.26, endX: 0.12, endY: 0.5, lineWidth: 0.5, alpha: 1 },
    ],
    blocks: [
      { x: 0.12, y: 0.26, size: 0.012, alpha: 1 }, // 左上
      { x: 0.12, y: 0.5, size: 0.006, alpha: 0.4 }, //左下
      { x: 0.55, y: 0.2, size: 0.008, alpha: 0.4 }, //右上
      { x: 0.78, y: 0.72, size: 0.008, alpha: 0.8 }
    ]
  },
  sideDots: {
    // 右侧竖向点列。
    xFromRight: 0.06,
    y: 0.46,
    gap: 9,
    count: 4,
    alpha: 0.62
  }
} as const

export const getWorldInstanceSecondLayerContent = (
  x: number,
  y: number,
  w: number,
  h: number
): { contentX: number; contentW: number; titleY: number; summaryY: number; enterY: number } => ({
  contentX: x + w * WORLD_INSTANCE_SECOND_LAYER.content.x,
  contentW: w * WORLD_INSTANCE_SECOND_LAYER.content.width,
  titleY: y + h * WORLD_INSTANCE_SECOND_LAYER.content.titleY,
  summaryY: y + h * WORLD_INSTANCE_SECOND_LAYER.content.summaryY,
  enterY: y + h * WORLD_INSTANCE_SECOND_LAYER.enter.y
})

export const drawWorldInstanceLineDecor = (
  ctx: CanvasRenderingContext2D,
  palette: HomeCanvasPalette,
  theme: HomeCanvasTheme,
  x: number,
  y: number,
  w: number,
  h: number,
  opacity: number,
  drawProgress: number
): void => {
  const config = WORLD_INSTANCE_SECOND_LAYER.line
  const decorW = w * config.areaWidth
  const lineProgress = easeOutCubic(drawProgress)
  const drawSegment = (x1: number, y1: number, x2: number, y2: number, progress: number): void => {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x1 + (x2 - x1) * progress, y1 + (y2 - y1) * progress)
    ctx.stroke()
  }

  ctx.save()
  ctx.strokeStyle = palette.line
  ctx.lineWidth = 1
  ctx.globalAlpha = config.alpha * opacity

  for (const arc of config.arcs) {
    ctx.beginPath()
    ctx.arc(
      x + decorW * arc.cx,
      y + h * arc.cy,
      decorW * arc.radius,
      Math.PI * arc.start,
      Math.PI * (arc.start + arc.sweep * lineProgress)
    )
    ctx.stroke()
  }

  for (const diagonal of config.diagonals) {
    ctx.lineWidth = diagonal.lineWidth
    ctx.globalAlpha = config.alpha * opacity * diagonal.alpha
    drawSegment(
      x + decorW * diagonal.startX,
      y + h * diagonal.startY,
      x + decorW * diagonal.endX,
      y + h * diagonal.endY,
      lineProgress
    )
  }

  ctx.globalAlpha = config.orbAlpha * opacity
  ctx.fillStyle = theme === 'dark' ? 'rgba(255,255,255,0.22)' : 'rgba(40,44,48,0.18)'
  ctx.beginPath()
  ctx.arc(
    x + decorW * config.orb.x,
    y + h * config.orb.y,
    clamp(Math.min(w, h) * config.orb.radius, 18, 44),
    0,
    Math.PI * 2
  )
  ctx.fill()

  ctx.fillStyle = '#000000'
  for (const block of config.blocks) {
    const size = clamp(w * block.size, 1.5, 4)
    ctx.globalAlpha = (block.alpha ?? config.blockAlpha) * opacity
    ctx.fillRect(x + decorW * block.x, y + h * block.y, size, size)
  }

  ctx.strokeStyle = palette.hairline
  ctx.globalAlpha = config.dividerAlpha * opacity
  ctx.beginPath()
  ctx.moveTo(x + decorW, y)
  ctx.lineTo(x + decorW, y + h)
  ctx.stroke()
  ctx.restore()
}

export const drawWorldInstanceDotDecor = (
  ctx: CanvasRenderingContext2D,
  palette: HomeCanvasPalette,
  x: number,
  y: number,
  w: number,
  h: number,
  opacity: number,
  spreadProgress: number
): void => {
  const dotScale = Math.min(w, h)
  const spread = easeOutCubic(spreadProgress)

  ctx.save()
  ctx.fillStyle = palette.dot
  for (const config of WORLD_INSTANCE_SECOND_LAYER.dotGroups) {
    const decorW = w * config.areaWidth
    const dotGap = dotScale * config.gapRatio
    const dotSize = dotScale * config.sizeRatio
    const gridX = x + decorW * config.x
    const gridY = y + h * config.y
    const centerRow = (config.rows - 1) / 2
    const centerCol = (config.cols - 1) / 2
    const maxDistance = Math.hypot(centerCol, centerRow)

    for (let row = 0; row < config.rows; row += 1) {
      for (let col = 0; col < config.cols; col += 1) {
        const distance = Math.hypot(col - centerCol, row - centerRow) / maxDistance
        const dotReveal = clamp(
          (spread - distance * config.spreadDistance) / config.spreadSoftness,
          0,
          1
        )
        if (dotReveal <= 0) continue
        ctx.globalAlpha = config.alpha * opacity * dotReveal
        ctx.beginPath()
        ctx.arc(gridX + col * dotGap, gridY + row * dotGap, dotSize, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  ctx.restore()
}
