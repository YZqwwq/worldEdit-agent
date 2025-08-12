import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

// 路由配置
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue'),
    meta: {
      title: '世界观编辑器 - 主页'
    }
  },
  {
    path: '/editor/:worldId',
    name: 'Editor',
    component: () => import('../views/Editor.vue'),
    props: true,
    meta: {
      title: '世界观编辑器',
      requiresWorld: true
    }
  },
  {
    path: '/text-editor/:worldId',
    name: 'TextEditor',
    component: () => import('../views/TextEditor.vue'),
    props: true,
    meta: {
      title: '文本编辑器',
      requiresWorld: true
    }
  },
  {
    path: '/character-editor/:worldId',
    name: 'CharacterEditor',
    component: () => import('../views/CharacterEditor.vue'),
    props: true,
    meta: {
      title: '角色编辑器',
      requiresWorld: true
    }
  },
  {
    path: '/map-editor/:worldId',
    name: 'MapEditor',
    component: () => import('../views/MapEditor.vue'),
    props: true,
    meta: {
      title: '地图编辑器',
      requiresWorld: true
    }
  },
  {
    path: '/test',
    name: 'Test',
    component: () => import('../views/Test.vue'),
    meta: {
      title: '数据库测试页面'
    }
  },
  {
    path: '/ai-agent',
    name: 'AIAgent',
    component: () => import('../views/AIAgent.vue'),
    meta: {
      title: 'AI 智能助手'
    }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    redirect: '/'
  }
]

// 创建路由实例
const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// 全局前置守卫
router.beforeEach((to, from, next) => {
  // 设置页面标题
  if (to.meta?.title) {
    document.title = to.meta.title as string
  }
  
  // 检查是否需要世界观数据
  if (to.meta?.requiresWorld && !to.params.worldId) {
    next('/')
    return
  }
  
  next()
})

// 全局后置钩子
router.afterEach((to) => {
  // 可以在这里添加页面访问统计等逻辑
  console.log(`Navigated to: ${to.path}`)
})

export default router