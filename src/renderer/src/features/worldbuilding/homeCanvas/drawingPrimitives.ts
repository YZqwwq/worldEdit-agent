export const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export const easeOutCubic = (value: number): number => 1 - Math.pow(1 - value, 3)

export const setCanvasFont = (
  ctx: CanvasRenderingContext2D,
  size: number,
  weight: number | string = 500,
  family = '"Microsoft YaHei", "Noto Sans SC", sans-serif'
): void => {
  ctx.font = `${weight} ${size}px ${family}`
}

export const drawRoundRectPath = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
): void => {
  const r = Math.min(radius, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export const drawClampedTextLine = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number
): void => {
  ctx.fillText(getClampedTextLine(ctx, text, maxWidth), x, y)
}

export const getClampedTextLine = (
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string => {
  const source = String(text ?? '')
  if (!source || maxWidth <= 0) return ''
  if (ctx.measureText(source).width <= maxWidth) return source

  const ellipsis = '...'
  const ellipsisWidth = ctx.measureText(ellipsis).width
  if (ellipsisWidth >= maxWidth) return ellipsis

  let low = 0
  let high = source.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const candidate = `${source.slice(0, mid)}${ellipsis}`
    if (ctx.measureText(candidate).width <= maxWidth) {
      low = mid
    } else {
      high = mid - 1
    }
  }

  return `${source.slice(0, low)}${ellipsis}`
}
