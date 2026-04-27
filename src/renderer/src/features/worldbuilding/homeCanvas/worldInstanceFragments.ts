export type WorldInstanceFragmentPiece = Readonly<{
  x: number
  y: number
  w: number
  h: number
  dx: number
  dy: number
}>

//离散态
export const CENTER_WORLD_FRAGMENT_PIECES: readonly WorldInstanceFragmentPiece[] = [
  // 上1：左上横向主块，离散时轻微向左上漂移。
  { x: 0, y: 0, w: 0.5, h: 0.22, dx: -26, dy: 12 },

  // 上2：顶部中块，负责补齐上沿中段。
  { x: 0.5, y: 0, w: 0.27, h: 0.22, dx: 10, dy: -50 },

  // 右1：右上竖向长块，离散时形成右侧高块。
  { x: 0.77, y: 0, w: 0.23, h: 0.62, dx: -20, dy: -90 },

  // 中1：左中短横块，贴近上1形成局部堆叠。
  { x: 0, y: 0.22, w: 0.32, h: 0.18, dx: -50, dy: -5 },

  // 中2：中心主块，是中部视觉重心。
  { x: 0.32, y: 0.22, w: 0.32, h: 0.4, dx: -1, dy: 7 },

  // 中3：右中小块，用来打破规则网格感。
  { x: 0.64, y: 0.22, w: 0.13, h: 0.12, dx: 80, dy: 6 },

  // 中4：右中竖块，和中3上下衔接。
  { x: 0.64, y: 0.34, w: 0.13, h: 0.28, dx: 17, dy: 12 },

  // 下1：左下竖向长块，离散时承担左下重量。
  { x: 0, y: 0.4, w: 0.32, h: 0.6, dx: 75, dy: 80 },

  // 下2：底部中块，向下轻移，保留中心收束感。
  { x: 0.32, y: 0.62, w: 0.38, h: 0.38, dx: -90, dy: -35 },

  // 下3：右下块，和右1形成右侧纵向呼应。
  { x: 0.7, y: 0.62, w: 0.3, h: 0.38, dx: -10, dy: -10 }
]

// 左实例：最终仍能拼回完整矩形，离散态使用不等宽切片避免九宫格感。
export const LEFT_WORLD_FRAGMENT_PIECES: readonly WorldInstanceFragmentPiece[] = [
  // 顶部左侧横块，略宽，离散时压向左上。
  { x: 0, y: 0, w: 0.46, h: 0.26, dx: -20, dy: 20 },

  // 顶部中块，和左侧横块错开高度感。
  { x: 0.46, y: 0, w: 0.22, h: 0.26, dx: -2, dy: -40 },

  // 右侧上竖块，形成侧边高块。
  { x: 0.68, y: 0, w: 0.32, h: 0.44, dx: -10, dy: -10 },

  // 左中短横块，和顶部左块局部堆叠。
  { x: 0, y: 0.26, w: 0.34, h: 0.22, dx: -60, dy: 2 },

  // 中心主块，运动最小，保留聚合重心。
  { x: 0.34, y: 0.26, w: 0.34, h: 0.38, dx: 1, dy: 6 },

  // 右中小块，用来打断规则列线。
  { x: 0.68, y: 0.44, w: 0.12, h: 0.2, dx: 17, dy: -34 },

  // 右下竖块，承接右侧重量。
  { x: 0.8, y: 0.44, w: 0.2, h: 0.56, dx: -50, dy: 70 },

  // 左下竖块，形成另一侧的下坠感。
  { x: 0, y: 0.48, w: 0.34, h: 0.52, dx: 20, dy: 10 },

  // 底部横块，略长，离散时向下收。
  { x: 0.34, y: 0.64, w: 0.46, h: 0.36, dx: 60, dy: -24 }
]

// 右实例：独立于左实例，便于后续分别调节左右两侧的离散方向与重心。
export const RIGHT_WORLD_FRAGMENT_PIECES: readonly WorldInstanceFragmentPiece[] = [
  // 顶部左侧竖块，给右侧实例更强的上方支点。
  { x: 0, y: 0, w: 0.28, h: 0.46, dx: 60, dy: -70 },

  // 顶部中横块，和左竖块形成局部叠合。
  { x: 0.28, y: 0, w: 0.42, h: 0.24, dx: -70, dy: 35 },

  // 右上短块，避免右上角太规整。
  { x: 0.7, y: 0, w: 0.3, h: 0.24, dx: -20, dy: -12 },

  // 左中小块，打断左侧直线。
  { x: 0, y: 0.46, w: 0.16, h: 0.2, dx: -50, dy: -14 },

  // 中心主块，运动最小，作为聚合锚点。
  { x: 0.16, y: 0.24, w: 0.38, h: 0.42, dx: 30, dy: -17 },

  // 右中横块，离散时向右轻推，并补齐中右侧覆盖。
  { x: 0.54, y: 0.24, w: 0.46, h: 0.42, dx: 68, dy: 2 },

  // 右下竖块，形成右侧下坠感。
  { x: 0.76, y: 0.48, w: 0.24, h: 0.52, dx: -21, dy: 23 },

  // 左下块，和左上竖块形成上下呼应。
  { x: 0, y: 0.66, w: 0.38, h: 0.34, dx: 20, dy: -10 },

  // 底部中横块，补齐下沿并轻微内收。
  { x: 0.38, y: 0.66, w: 0.38, h: 0.34, dx: -20, dy: 55 }
]

export const getWorldFragmentPieces = (index: number): readonly WorldInstanceFragmentPiece[] =>
  index === 1
    ? CENTER_WORLD_FRAGMENT_PIECES
    : index === 0
      ? LEFT_WORLD_FRAGMENT_PIECES
      : RIGHT_WORLD_FRAGMENT_PIECES
