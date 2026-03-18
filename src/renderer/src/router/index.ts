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
    component: () => import('../views/WorldEntityView.vue')
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
