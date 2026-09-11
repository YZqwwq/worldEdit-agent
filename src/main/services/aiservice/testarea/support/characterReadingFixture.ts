import { readFile } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { z } from 'zod'
import { AppDataSource } from '../../../../database'
import { WorldRecord } from '@share/entity/database/WorldRecord'
import { WorldEntityRecord } from '@share/entity/database/WorldEntityRecord'
import { WorldEntityDocumentRecord } from '@share/entity/database/WorldEntityDocumentRecord'
import { characterImpressionService } from '../../../worldbuilding/characterImpressionService'

export const characterFixtureSchema = z
  .object({
    world: z.object({ id: z.string().uuid(), name: z.string() }).strict(),
    character: z.object({ id: z.string().uuid(), name: z.string() }).strict(),
    document: z
      .object({ id: z.string().uuid(), title: z.string(), contentHtml: z.string() })
      .strict(),
    impression: z.string().min(1).nullable()
  })
  .strict()

export const loadCharacterReadingFixture = async (file: string) => {
  const root = resolve('src/main/services/aiservice/testarea/fixtures')
  const path = resolve(root, file)
  const relativePath = relative(root, path)
  if (relativePath.startsWith('..') || isAbsolute(relativePath))
    throw new Error('Fixture must be inside testarea/fixtures')
  const fixture = characterFixtureSchema.parse(JSON.parse(await readFile(path, 'utf8')))
  // Fixtures seed an empty isolated world; collisions are errors, never updates.
  await AppDataSource.transaction(async (manager) => {
    await manager.getRepository(WorldRecord).insert(fixture.world)
    await manager
      .getRepository(WorldEntityRecord)
      .insert({ ...fixture.character, worldId: fixture.world.id, type: 'character' })
    await manager
      .getRepository(WorldEntityDocumentRecord)
      .insert({ ...fixture.document, worldId: fixture.world.id, contentFormat: 'html' })
  })
  if (fixture.impression)
    await characterImpressionService.upsertImpression({
      characterEntityId: fixture.character.id,
      structuredText: fixture.impression
    })
  return fixture
}
