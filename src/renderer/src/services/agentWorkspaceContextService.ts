import { readonly, shallowRef } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type {
  AgentWorkspaceContext,
  AgentWorkspacePageKind
} from '@share/cache/AItype/states/agentWorkspaceContext'

const currentContext = shallowRef<AgentWorkspaceContext>({
  pageKind: 'home',
  routeName: 'Home',
  capturedAt: new Date().toISOString()
})

const routePageKinds: Record<string, AgentWorkspacePageKind> = {
  Home: 'home',
  WorldEditor: 'world',
  WorldEntityEditor: 'entity',
  CharacterProfileEditor: 'entity',
  CharacterPortraitEditor: 'entity',
  WorldEntityDocumentEditor: 'document',
  AIChat: 'chat'
}

const routeParam = (route: RouteLocationNormalizedLoaded, key: string): string => {
  const value = route.params[key]
  return Array.isArray(value) ? String(value[0] || '') : String(value || '')
}

const cloneContext = (context: AgentWorkspaceContext): AgentWorkspaceContext =>
  JSON.parse(JSON.stringify(context)) as AgentWorkspaceContext

export const agentWorkspaceContextService = {
  current: readonly(currentContext),

  setFromRoute(route: RouteLocationNormalizedLoaded): void {
    const routeName = String(route.name || 'Unknown')
    const worldId = routeParam(route, 'worldId')
    const entityId = routeParam(route, 'entityId')
    currentContext.value = {
      pageKind: routePageKinds[routeName] || 'other',
      routeName,
      capturedAt: new Date().toISOString(),
      world: worldId ? { id: worldId } : undefined,
      entity: entityId ? { id: entityId } : undefined
    }
  },

  update(patch: Partial<AgentWorkspaceContext>): void {
    currentContext.value = {
      ...currentContext.value,
      ...patch,
      capturedAt: new Date().toISOString()
    }
  },

  snapshot(): AgentWorkspaceContext {
    return cloneContext({
      ...currentContext.value,
      capturedAt: new Date().toISOString()
    })
  }
}
