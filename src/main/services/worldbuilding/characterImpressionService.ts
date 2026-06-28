import { AppDataSource } from '../../database'
import { CharacterImpressionRecord } from '../../../share/entity/database/CharacterImpressionRecord'
import { WorldEntityRecord } from '../../../share/entity/database/WorldEntityRecord'
import type {
  CharacterImpressionPayload,
  UpsertCharacterImpressionInput
} from '@share/cache/worldbuilding/characterImpression'

const MAX_IMPRESSION_TEXT_LENGTH = 120000
const MAX_UPDATE_MARKER_LENGTH = 20000

const normalizeLongText = (value: unknown, maxLength: number): string =>
  String(value ?? '').trim().slice(0, maxLength)

const toPayload = (record: CharacterImpressionRecord): CharacterImpressionPayload => ({
  characterEntityId: record.characterEntityId,
  structuredText: record.structuredText || '',
  updateMarker: record.updateMarker || '',
  createdAt: record.createdAt?.toISOString(),
  updatedAt: record.updatedAt?.toISOString()
})

class CharacterImpressionService {
  private get entityRepo() {
    return AppDataSource.getRepository(WorldEntityRecord)
  }

  private get impressionRepo() {
    return AppDataSource.getRepository(CharacterImpressionRecord)
  }

  private async assertCharacterEntity(characterEntityId: string): Promise<WorldEntityRecord> {
    const normalizedId = String(characterEntityId || '').trim()
    if (!normalizedId) throw new Error('characterEntityId is required')

    const entity = await this.entityRepo.findOneBy({ id: normalizedId })
    if (!entity) throw new Error(`Character entity not found: ${normalizedId}`)
    if (entity.type !== 'character') {
      throw new Error(`Character impression requires a character entity, received "${entity.type}"`)
    }

    return entity
  }

  async getImpression(characterEntityId: string): Promise<CharacterImpressionPayload | null> {
    const character = await this.assertCharacterEntity(characterEntityId)
    const record = await this.impressionRepo.findOneBy({ characterEntityId: character.id })
    return record ? toPayload(record) : null
  }

  async upsertImpression(
    input: UpsertCharacterImpressionInput
  ): Promise<CharacterImpressionPayload> {
    const character = await this.assertCharacterEntity(input.characterEntityId)
    const structuredText = normalizeLongText(input.structuredText, MAX_IMPRESSION_TEXT_LENGTH)
    if (!structuredText) throw new Error('structuredText is required')

    const updateMarker = normalizeLongText(input.updateMarker, MAX_UPDATE_MARKER_LENGTH)
    const current = await this.impressionRepo.findOneBy({ characterEntityId: character.id })
    const record =
      current ??
      this.impressionRepo.create({
        characterEntityId: character.id
      })

    record.structuredText = structuredText
    record.updateMarker = updateMarker

    const saved = await this.impressionRepo.save(record)
    return toPayload(saved)
  }
}

export const characterImpressionService = new CharacterImpressionService()
