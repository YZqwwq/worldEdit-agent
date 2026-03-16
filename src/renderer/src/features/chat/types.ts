export type UploadedChatFile = {
  id: string
  name: string
  path?: string
  sourcePath: string
  size: number
  status: 'pending' | 'uploaded'
}
