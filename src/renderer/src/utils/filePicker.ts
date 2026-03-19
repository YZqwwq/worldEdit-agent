export const isFilePickerCancelled = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false
  return error.message.includes('No file selected')
}
