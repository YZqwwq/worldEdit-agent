import { net, protocol } from 'electron'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getStaticAvatarDir, getStaticUploadDir } from '../config/pathConfig'

export const APP_RESOURCE_SCHEME = 'app-resource'

type AppResourceBucket = 'avatars' | 'uploads'

const RESOURCE_ROOTS: Record<AppResourceBucket, () => string> = {
  avatars: getStaticAvatarDir,
  uploads: getStaticUploadDir
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_RESOURCE_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true
    }
  }
])

const isBucket = (value: string): value is AppResourceBucket => value === 'avatars' || value === 'uploads'

const isPathInsideRoot = (rootDir: string, targetPath: string): boolean => {
  const normalizedRoot = resolve(rootDir)
  const normalizedTarget = resolve(targetPath)
  const pathRelative = relative(normalizedRoot, normalizedTarget)
  return pathRelative === '' || (!pathRelative.startsWith('..') && !isAbsolute(pathRelative))
}

const toResourceRelativePath = (rootDir: string, filePath: string): string => {
  if (!isPathInsideRoot(rootDir, filePath)) {
    throw new Error('Resource path is outside the managed static directory')
  }

  const normalizedRelative = relative(resolve(rootDir), resolve(filePath)).split(sep).join('/')
  return normalizedRelative
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

const parseResourceUrl = (resourceUrl: string): { bucket: AppResourceBucket; relativePath: string } => {
  const parsed = new URL(resourceUrl)
  if (parsed.protocol !== `${APP_RESOURCE_SCHEME}:`) {
    throw new Error('Invalid resource protocol')
  }

  const bucket = parsed.hostname
  if (!isBucket(bucket)) {
    throw new Error('Unknown resource bucket')
  }

  const relativePath = parsed.pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
    .join(sep)

  if (!relativePath) {
    throw new Error('Missing resource path')
  }

  return { bucket, relativePath }
}

export const buildAppResourceUrl = (bucket: AppResourceBucket, filePath: string): string => {
  const rootDir = RESOURCE_ROOTS[bucket]()
  const relativePath = toResourceRelativePath(rootDir, filePath)
  return `${APP_RESOURCE_SCHEME}://${bucket}/${relativePath}`
}

export const resolveAppResourcePath = (
  resourceUrl: string,
  expectedBucket?: AppResourceBucket
): string => {
  const { bucket, relativePath } = parseResourceUrl(resourceUrl)
  if (expectedBucket && bucket !== expectedBucket) {
    throw new Error('Invalid resource bucket')
  }

  const rootDir = RESOURCE_ROOTS[bucket]()
  const targetPath = resolve(join(rootDir, relativePath))
  if (!isPathInsideRoot(rootDir, targetPath)) {
    throw new Error('Resolved resource path escapes the managed static directory')
  }

  return targetPath
}

export const registerAppResourceProtocol = (): void => {
  protocol.handle(APP_RESOURCE_SCHEME, async (request) => {
    try {
      const filePath = resolveAppResourcePath(request.url)
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Resource not found'
      return new Response(message, { status: 404 })
    }
  })
}
