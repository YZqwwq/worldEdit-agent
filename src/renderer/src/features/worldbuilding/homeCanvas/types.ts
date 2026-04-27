export type HomeCanvasTheme = 'light' | 'dark'

export type HomeCanvasTargetKind = 'world' | 'create' | 'assistant'

export type HomeCanvasTarget = {
  kind: HomeCanvasTargetKind
  id?: string
  rect: {
    x: number
    y: number
    w: number
    h: number
  }
}

export type HomeCanvasPalette = {
  base: string
  vignette: string
  mist: string
  ink: string
  muted: string
  hairline: string
  line: string
  panel: string
  panelHover: string
  panelShadow: string
  fragment: string
  fragmentHover: string
  dot: string
  accent: string
  danger: string
}

export type HomeCanvasStageRegion = {
  left: number
  top: number
  width: number
  height: number
  centerX: number
  centerY: number
  guideY: number
}
