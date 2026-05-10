import type {
  WorldEntityType,
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

export type CharacterBasicInfoFieldKind = 'entity_name' | 'text' | 'number' | 'option' | 'entity_ref'

export type CharacterBasicInfoFieldValue = string | number | null

export type CharacterBasicInfoField = {
  label: string
  kind: CharacterBasicInfoFieldKind
  value: CharacterBasicInfoFieldValue
  entityType?: WorldEntityType
  custom?: boolean
  locked?: boolean
}

export type CharacterBasicInfoData = {
  order: string[]
  fields: Record<string, CharacterBasicInfoField>
}

export type CharacterDemographicData = {
  basicInfo?: CharacterBasicInfoData
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

export const CHARACTER_BASIC_INFO_DEFAULT_ORDER = [
  'name',
  'gender',
  'age',
  'race',
  'faction',
  'nation',
  'birthplace',
  'height'
] as const

export const CHARACTER_BASIC_INFO_DEFAULT_FIELDS: Record<
  (typeof CHARACTER_BASIC_INFO_DEFAULT_ORDER)[number],
  Omit<CharacterBasicInfoField, 'value'>
> = {
  name: { label: '人物', kind: 'entity_name', locked: true },
  gender: { label: '性别', kind: 'option' },
  age: { label: '年龄', kind: 'text' },
  race: { label: '种族', kind: 'entity_ref', entityType: 'race' },
  faction: { label: '所属势力', kind: 'entity_ref', entityType: 'faction' },
  nation: { label: '所属国家', kind: 'entity_ref', entityType: 'nation' },
  birthplace: { label: '出生地', kind: 'entity_ref', entityType: 'city' },
  height: { label: '身高', kind: 'text' }
}

export const createDefaultCharacterBasicInfo = (): CharacterBasicInfoData => ({
  order: [...CHARACTER_BASIC_INFO_DEFAULT_ORDER],
  fields: Object.fromEntries(
    CHARACTER_BASIC_INFO_DEFAULT_ORDER.map((key) => [
      key,
      {
        ...CHARACTER_BASIC_INFO_DEFAULT_FIELDS[key],
        value: ''
      }
    ])
  ) as Record<string, CharacterBasicInfoField>
})

export const getCharacterBasicInfoField = (
  demographic: CharacterDemographicData | undefined,
  key: string
): CharacterBasicInfoField | null => demographic?.basicInfo?.fields?.[key] ?? null

export const getCharacterBasicInfoValue = (
  demographic: CharacterDemographicData | undefined,
  key: string
): string => {
  const value = getCharacterBasicInfoField(demographic, key)?.value
  return value == null ? '' : String(value)
}

export const updateCharacterBasicInfoValues = (
  current: CharacterBasicInfoData | undefined,
  values: Partial<Record<(typeof CHARACTER_BASIC_INFO_DEFAULT_ORDER)[number], CharacterBasicInfoFieldValue>>
): CharacterBasicInfoData => {
  const base = current ?? createDefaultCharacterBasicInfo()
  const next: CharacterBasicInfoData = {
    order: [...new Set([...CHARACTER_BASIC_INFO_DEFAULT_ORDER, ...(base.order ?? [])])],
    fields: { ...(base.fields ?? {}) }
  }

  for (const key of CHARACTER_BASIC_INFO_DEFAULT_ORDER) {
    const defaultField = CHARACTER_BASIC_INFO_DEFAULT_FIELDS[key]
    next.fields[key] = {
      ...defaultField,
      ...next.fields[key],
      label: next.fields[key]?.label || defaultField.label,
      kind: next.fields[key]?.kind || defaultField.kind,
      value: values[key] ?? next.fields[key]?.value ?? ''
    }
  }

  return next
}

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
