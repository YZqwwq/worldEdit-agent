import type { InteractionObservationSnapshot } from '@share/cache/AItype/states/interactionObservation'

export const getObservationText = (observation: InteractionObservationSnapshot): string =>
  String(
    observation.payload.text ??
      observation.payload.message ??
      observation.payload.summary ??
      observation.summary ??
      ''
  ).trim()
