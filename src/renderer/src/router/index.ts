import { createRouter, createWebHashHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/WorldEditHomeView.vue')
  },
  {
    path: '/world/:worldId',
    name: 'WorldEditor',
    component: () => import('../views/WorldEditorView.vue')
  },
  {
    path: '/world/:worldId/entity/:entityId',
    name: 'WorldEntityEditor',
    component: () => import('../views/CharacterWorkspaceView.vue')
  },
  {
    path: '/world/:worldId/entity/:entityId/profile',
    name: 'CharacterProfileEditor',
    component: () => import('../views/CharacterProfileEditorView.vue')
  },
  {
    path: '/world/:worldId/entity/:entityId/portrait',
    name: 'CharacterPortraitEditor',
    component: () => import('../views/CharacterPortraitEditorView.vue')
  },
  {
    path: '/world/:worldId/entity/:entityId/narrative',
    name: 'CharacterNarrativeEditor',
    component: () => import('../views/CharacterNarrativeEditorView.vue')
  },
  {
    path: '/chat',
    name: 'AIChat',
    component: () => import('../views/AIChatView.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
