import type {
  WorldEntityComponentPayload,
  WorldEntityDetailPayload
} from '@share/cache/worldbuilding/worldbuilding'
import type { WorldRichTextAppearance } from '../editor/model/editorAppearance'

export type PortraitTransform = {
  offsetX: number
  offsetY: number
  scale: number
}

export type CharacterProfileData = {
  title?: string
  summary?: string
  description?: string
  descriptionFormat?: 'markdown' | 'html'
  portraitResourceUrl?: string
  portraitDocumentResourceUrl?: string
  portraitDocumentResourceUrls?: Partial<Record<'portrait' | 'landscape', string>>
  portraitStudiosByMode?: Partial<Record<'portrait' | 'landscape', Record<string, unknown>>>
  portraitActiveMode?: 'portrait' | 'landscape'
  portraitTransform?: Partial<PortraitTransform>
  layoutVariant?: 'v1' | 'v2' | 'v3'
  editorAppearance?: Partial<WorldRichTextAppearance>
  personalityTraits?: string[]
  abilities?: string[]
  tags?: string[]
}

export type CharacterDemographicData = {
  age?: number | null
  ageLabel?: string
  heightLabel?: string
  gender?: string
  raceEntityId?: string
  factionEntityId?: string
  nationEntityId?: string
  birthplaceEntityId?: string
}

export const DEFAULT_PORTRAIT_TRANSFORM: PortraitTransform = {
  offsetX: 0,
  offsetY: 0,
  scale: 1
}

export const CHARACTER_LAYOUT_VARIANTS = [
  { value: 'v1' as const, label: '版式一' },
  { value: 'v2' as const, label: '版式二' },
  { value: 'v3' as const, label: '版式三' }
]

export const getCharacterComponentByType = <TData extends Record<string, unknown>>(
  detail: WorldEntityDetailPayload | null,
  componentType: string
): WorldEntityComponentPayload<TData> | null => {
  if (!detail) return null
  return (
    detail.components.find((component) => component.componentType === componentType) as
      | WorldEntityComponentPayload<TData>
      | undefined
  ) ?? null
}

export const isCharacterEntityDetail = (
  detail: WorldEntityDetailPayload | null
): boolean => detail?.entity.type === 'character'
