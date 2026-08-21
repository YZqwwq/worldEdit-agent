import { AppDataSource } from '../../database'
import { CharacterNarrativeReadingService } from './characterNarrativeReadingService'

export const characterNarrativeReadingService = new CharacterNarrativeReadingService(AppDataSource)
