import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { World } from '../../../shared/entities'
import { typeormDatabaseService as databaseService } from '../services/serviceImpl/world'
import { simpleValidator } from '../schemas/simple-validator'

// 世界观数据管理store
export const useWorldStore = defineStore('world', () => {
  // 状态
  const searchQuery = ref('')
  const worlds = ref<World[]>([])

  // 计算属性
  const filteredWorlds = computed(() => {
    if (!searchQuery.value) return worlds.value
    return worlds.value.filter(world => 
      world.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      (world.description?.toLowerCase().includes(searchQuery.value.toLowerCase()) ?? false) ||
      (world.tags?.some(tag => tag.toLowerCase().includes(searchQuery.value.toLowerCase())) ?? false)
    )
  })
  // 动作

  const setSearchQuery = (query: string) => {
    searchQuery.value = query
  }

  const addWorld = (world: World) => {
    worlds.value.push(world)
  }

  const updateWorld = (worldId: string, updates: Partial<World>) => {
    const index = worlds.value.findIndex(w => w.id === worldId)
    if (index !== -1) {
      worlds.value[index] = { ...worlds.value[index], ...updates }
    }
  }

  const removeWorld = (worldId: string) => {
    worlds.value = worlds.value.filter(w => w.id !== worldId)
  }

  const loadWorlds = async () => {
    try {
      // 通过IPC调用主进程SQLite服务加载数据
      const worldList = await databaseService.getWorldList()
      worlds.value = worldList
    } catch (err) {
      console.error('Failed to load worlds:', err)
      throw new Error('加载世界观列表失败')
    }
  }

  const createWorld = async (worldData: Omit<World, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      // 数据验证
      const normalizedData = simpleValidator.normalizeWorldData({
        ...worldData,
        id: 'temp',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastModified: new Date(),
        version: '1.0.0'
      })
      
      const validation = simpleValidator.validateWorldData(normalizedData)
      if (!validation.valid) {
        throw new Error(`数据验证失败: ${validation.errors?.join(', ')}`)
      }
      
      // 通过IPC调用主进程SQLite服务创建世界观
      const newWorld = await databaseService.createWorld(worldData)
      
      // 更新本地状态
      addWorld(newWorld)
      
      return newWorld
    } catch (error) {
      console.error('Failed to create world:', error)
      throw error
    }
  }



  const deleteWorld = async (worldId: string) => {
    try {
      // 通过IPC从主进程SQLite服务删除世界观
      await databaseService.deleteWorld(worldId)
      
      // 更新本地状态
      removeWorld(worldId)
    } catch (error) {
      console.error('Failed to delete world:', error)
      throw error
    }
  }

  // 初始化
  const initialize = async () => {
    await loadWorlds()
  }

  return {
    // 状态
    searchQuery,
    worlds,
    
    // 计算属性
    filteredWorlds,
    
    // 动作
    setSearchQuery,
    addWorld,
    updateWorld,
    removeWorld,
    loadWorlds,
    createWorld,
    deleteWorld,
    initialize
  }
})