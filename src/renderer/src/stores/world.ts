import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UnifiedWorldData, RecentFile, UIState, WorldData } from '../types/world'
import { databaseService } from '../services/database'
import { simpleValidator } from '../schemas/simple-validator'

// 世界观数据管理store
export const useWorldStore = defineStore('world', () => {
  // 状态
  const currentWorld = ref<UnifiedWorldData | null>(null)
  const recentFiles = ref<RecentFile[]>([])
  const uiState = ref<UIState>({
    activeModule: 'home',
    loading: false
  })
  const searchQuery = ref('')
  const worlds = ref<WorldData[]>([])

  // 计算属性
  const filteredWorlds = computed(() => {
    if (!searchQuery.value) return worlds.value
    return worlds.value.filter(world => 
      world.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      world.description.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      world.tags.some(tag => tag.toLowerCase().includes(searchQuery.value.toLowerCase()))
    )
  })

  const hasCurrentWorld = computed(() => currentWorld.value !== null)

  const recentFilesLimited = computed(() => recentFiles.value.slice(0, 10))

  // 动作
  const setCurrentWorld = (world: UnifiedWorldData | null) => {
    currentWorld.value = world
    if (world) {
      addToRecentFiles({
        id: world.id,
        name: world.name,
        path: '', // 实际路径由主进程管理
        lastOpened: new Date(),
        type: 'world'
      })
    }
  }

  const setActiveModule = (module: UIState['activeModule']) => {
    uiState.value.activeModule = module
  }

  const setLoading = (loading: boolean) => {
    uiState.value.loading = loading
  }

  const setError = (error: string | undefined) => {
    uiState.value.error = error
  }

  const setSearchQuery = (query: string) => {
    searchQuery.value = query
  }

  const addWorld = (world: WorldData) => {
    worlds.value.push(world)
  }

  const updateWorld = (worldId: string, updates: Partial<WorldData>) => {
    const index = worlds.value.findIndex(w => w.id === worldId)
    if (index !== -1) {
      worlds.value[index] = { ...worlds.value[index], ...updates }
    }
  }

  const removeWorld = (worldId: string) => {
    worlds.value = worlds.value.filter(w => w.id !== worldId)
    recentFiles.value = recentFiles.value.filter(f => f.id !== worldId)
    if (currentWorld.value?.id === worldId) {
      currentWorld.value = null
    }
  }

  const addToRecentFiles = (file: RecentFile) => {
    // 移除已存在的相同文件
    recentFiles.value = recentFiles.value.filter(f => f.id !== file.id)
    // 添加到开头
    recentFiles.value.unshift(file)
    // 限制最大数量
    if (recentFiles.value.length > 20) {
      recentFiles.value = recentFiles.value.slice(0, 20)
    }
  }

  const removeFromRecentFiles = (fileId: string) => {
    recentFiles.value = recentFiles.value.filter(f => f.id !== fileId)
  }

  const loadWorlds = async () => {
    try {
      setLoading(true)
      setError(undefined)
      
      // 通过IPC调用主进程SQLite服务加载数据
      const [worldList, recentList] = await Promise.all([
        databaseService.getWorldList(),
        databaseService.getRecentFiles()
      ])
      
      worlds.value = worldList
      recentFiles.value = recentList
    } catch (err) {
      console.error('Failed to load worlds:', err)
      setError('加载世界观列表失败')
    } finally {
      setLoading(false)
    }
  }

  const createWorld = async (worldData: Omit<WorldData, 'id' | 'createdAt' | 'updatedAt' | 'version'>) => {
    try {
      setLoading(true)
      setError(undefined)
      
      // 数据验证
      const normalizedData = simpleValidator.normalizeWorldData({
        ...worldData,
        id: 'temp',
        createdAt: new Date(),
        updatedAt: new Date(),
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
      
      // 添加到最近文件
      await databaseService.addRecentFile({
        id: newWorld.id,
        name: newWorld.name,
        path: '',
        lastOpened: new Date(),
        type: 'world'
      })
      
      return newWorld
    } catch (error) {
      console.error('Failed to create world:', error)
      setError('创建世界观失败')
      throw error
    } finally {
      setLoading(false)
    }
  }

  const openWorld = async (worldId: string) => {
    try {
      setLoading(true)
      setError(undefined)
      
      // 通过IPC从主进程SQLite服务加载完整世界观数据
      let worldData = await databaseService.getWorldContent(worldId)
      
      // 如果没有完整数据，创建基础结构
      if (!worldData) {
        const basicWorld = await databaseService.getWorld(worldId)
        if (!basicWorld) {
          throw new Error('世界观不存在')
        }
        
        // 创建默认的完整世界观结构
        worldData = {
          ...basicWorld,
          geography: [],
          nations: [],
          factions: [],
          powerSystems: [],
          timeline: [],
          characters: [],
          maps: [],
          relationships: {
            textToCharacter: [],
            textToMap: [],
            characterToMap: [],
            crossReferences: []
          }
        }
        
        // 保存默认结构
        await databaseService.saveWorldContent(worldData)
      }
      
      // 数据验证
      const validation = simpleValidator.validateUnifiedWorldData(worldData)
      if (!validation.valid) {
        console.warn('世界观数据验证失败:', validation.errors)
        // 尝试修复数据
        worldData = simpleValidator.normalizeUnifiedWorldData(worldData)
      }
      
      setCurrentWorld(worldData)
      
      // 更新最近文件
      await databaseService.addRecentFile({
        id: worldData.id,
        name: worldData.name,
        path: '',
        lastOpened: new Date(),
        type: 'world'
      })
      
      return worldData
    } catch (error) {
      console.error('Failed to open world:', error)
      setError('打开世界观失败')
      throw error
    } finally {
      setLoading(false)
    }
  }

  const saveWorld = async () => {
    if (!currentWorld.value) return
    
    try {
      setLoading(true)
      setError(undefined)
      
      // 数据验证
      const validation = simpleValidator.validateUnifiedWorldData(currentWorld.value)
      if (!validation.valid) {
        console.warn('保存数据验证失败:', validation.errors)
        // 尝试修复数据
        currentWorld.value = simpleValidator.normalizeUnifiedWorldData(currentWorld.value)
      }
      
      // 通过IPC保存到主进程SQLite服务
      await databaseService.saveWorldContent(currentWorld.value)
      
      // 更新本地状态
      const worldIndex = worlds.value.findIndex(w => w.id === currentWorld.value!.id)
      if (worldIndex !== -1) {
        worlds.value[worldIndex] = {
          ...worlds.value[worldIndex],
          name: currentWorld.value.name,
          lastModified: new Date(),
          updatedAt: new Date()
        }
      }
      
    } catch (error) {
      console.error('Failed to save world:', error)
      setError('保存世界观失败')
      throw error
    } finally {
      setLoading(false)
    }
  }

  const deleteWorld = async (worldId: string) => {
    try {
      setLoading(true)
      setError(undefined)
      
      // 通过IPC从主进程SQLite服务删除世界观
      await databaseService.deleteWorld(worldId)
      
      // 删除相关的最近文件记录
      await databaseService.removeRecentFile(worldId)
      
      // 更新本地状态
      removeWorld(worldId)
      
      // 如果删除的是当前世界观，清空当前状态
      if (currentWorld.value?.id === worldId) {
        currentWorld.value = null
      }
    } catch (error) {
      console.error('Failed to delete world:', error)
      setError('删除世界观失败')
      throw error
    } finally {
      setLoading(false)
    }
  }

  // 初始化
  const initialize = async () => {
    await loadWorlds()
  }

  return {
    // 状态
    currentWorld,
    recentFiles,
    uiState,
    searchQuery,
    worlds,
    
    // 计算属性
    filteredWorlds,
    hasCurrentWorld,
    recentFilesLimited,
    
    // 动作
    setCurrentWorld,
    setActiveModule,
    setLoading,
    setError,
    setSearchQuery,
    addWorld,
    updateWorld,
    removeWorld,
    addToRecentFiles,
    removeFromRecentFiles,
    loadWorlds,
    createWorld,
    openWorld,
    saveWorld,
    deleteWorld,
    initialize
  }
})