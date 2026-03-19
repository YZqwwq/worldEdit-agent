export interface WorldRichTextAppearance {
  fontScale: number
  lineHeight: number
  contentWidth: number
  paragraphSpacing: number
  headingScale: number
}

export const DEFAULT_WORLD_RICH_TEXT_APPEARANCE: WorldRichTextAppearance = {
  fontScale: 1,
  lineHeight: 1.75,
  contentWidth: 860,
  paragraphSpacing: 0.75,
  headingScale: 1
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

export const normalizeWorldRichTextAppearance = (
  input?: Partial<WorldRichTextAppearance> | null
): WorldRichTextAppearance => ({
  fontScale: clamp(Number(input?.fontScale || DEFAULT_WORLD_RICH_TEXT_APPEARANCE.fontScale), 0.9, 1.4),
  lineHeight: clamp(Number(input?.lineHeight || DEFAULT_WORLD_RICH_TEXT_APPEARANCE.lineHeight), 1.5, 2.2),
  contentWidth: clamp(
    Number(input?.contentWidth || DEFAULT_WORLD_RICH_TEXT_APPEARANCE.contentWidth),
    640,
    1200
  ),
  paragraphSpacing: clamp(
    Number(input?.paragraphSpacing || DEFAULT_WORLD_RICH_TEXT_APPEARANCE.paragraphSpacing),
    0.5,
    1.4
  ),
  headingScale: clamp(
    Number(input?.headingScale || DEFAULT_WORLD_RICH_TEXT_APPEARANCE.headingScale),
    0.9,
    1.35
  )
})
