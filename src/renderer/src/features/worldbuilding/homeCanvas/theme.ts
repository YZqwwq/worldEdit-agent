import type { HomeCanvasPalette, HomeCanvasTheme } from './types'

export const HOME_CANVAS_THEMES: Record<HomeCanvasTheme, HomeCanvasPalette> = {
  light: {
    base: '#f7f7f5',
    vignette: 'rgba(210, 214, 217, 0.42)',
    mist: 'rgba(255, 255, 255, 0.72)',
    ink: '#111318',
    muted: '#7c828a',
    hairline: 'rgba(15, 18, 22, 0.08)',
    line: 'rgba(24, 27, 32, 0.18)',
    panel: 'rgba(216, 216, 214, 0.64)',
    panelHover: 'rgba(235, 235, 232, 0.94)',
    panelShadow: 'rgba(20, 24, 28, 0.12)',
    fragmentRgba: 'rgba(205, 205, 202, 0.58)',
    dot: 'rgba(18, 20, 24, 0.46)',
    accent: '#111318',
    danger: '#a6362e'
  },
  dark: {
    base: '#101112',
    vignette: 'rgba(0, 0, 0, 0.48)',
    mist: 'rgba(255, 255, 255, 0.035)',
    ink: '#eef0f2',
    muted: '#9da3aa',
    hairline: 'rgba(255, 255, 255, 0.08)',
    line: 'rgba(255, 255, 255, 0.18)',
    panel: 'rgba(52, 54, 56, 0.66)',
    panelHover: 'rgba(74, 76, 78, 0.92)',
    panelShadow: 'rgba(0, 0, 0, 0.38)',
    fragmentRgba: 'rgba(62, 64, 66, 0.68)',
    dot: 'rgba(238, 240, 242, 0.48)',
    accent: '#f2f2f0',
    danger: '#ff7b70'
  }
}
