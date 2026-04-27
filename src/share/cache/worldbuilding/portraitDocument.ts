export const PORTRAIT_DOCUMENT_FORMAT = 'wa-portrait' as const
export const PORTRAIT_DOCUMENT_VERSION = 1 as const
export const PORTRAIT_DOCUMENT_FILE_EXTENSION = 'fmlrp' as const

export type PortraitDocumentFormat = typeof PORTRAIT_DOCUMENT_FORMAT
export type PortraitDocumentVersion = typeof PORTRAIT_DOCUMENT_VERSION
export type PortraitDocumentMode = 'portrait' | 'landscape'
export type PortraitDocumentLayerKind = 'background' | 'character'
export type PortraitDocumentAssetId =
  | 'portrait_background'
  | 'portrait_character'
  | 'landscape_background'
  | 'landscape_character'
export type PortraitDocumentBoxStyle = 'none' | 'frosted' | 'fill'
export type PortraitDocumentTextAlign = 'left' | 'center' | 'right'
export type PortraitDocumentFontStyle = 'normal' | 'italic'
export type PortraitDocumentFontWeight = '400' | '500' | '600' | '700'

export interface PortraitDocumentLayerState {
  assetId: PortraitDocumentAssetId | null
  x: number
  y: number
  scale: number
  width?: number
  height?: number
  resourceUrl?: string
}

export interface PortraitDocumentTextBlock {
  id: string
  fieldKey: string
  rect: {
    x: number
    y: number
    w: number
    h: number
  }
  fontFamily: string
  fontWeight: PortraitDocumentFontWeight
  fontStyle: PortraitDocumentFontStyle
  textAlign: PortraitDocumentTextAlign
  textColor: string
  boxStyle: PortraitDocumentBoxStyle
}

export interface PortraitDocumentImageAsset {
  assetId: PortraitDocumentAssetId
  kind: 'image'
  fileName: string
  mimeType: string
  width?: number
  height?: number
  byteLength: number
  dataBase64: string
  resourceUrl?: string
}

export interface PortraitDocumentCanvasState {
  mode: PortraitDocumentMode
  ratio: '9:16' | '16:9'
  background: PortraitDocumentLayerState
  character: PortraitDocumentLayerState
  textBlocks: PortraitDocumentTextBlock[]
}

export interface PortraitDocument {
  format: PortraitDocumentFormat
  version: PortraitDocumentVersion
  savedAt: string
  entity: {
    worldId?: string
    entityId?: string
    name: string
  }
  activeMode: PortraitDocumentMode
  assets: Partial<Record<PortraitDocumentAssetId, PortraitDocumentImageAsset>>
  canvases: {
    portrait: PortraitDocumentCanvasState
    landscape: PortraitDocumentCanvasState
  }
}
