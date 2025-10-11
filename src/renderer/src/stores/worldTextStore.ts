import { defineStore } from 'pinia'
import { ref } from 'vue'
import { worldContentTextService } from '../services/serviceImpl/worldContentText'

interface WorldTextData {
  text?: {
    description?: string
    background?: string
    rules?: string
    notes?: string
  }
  createdAt: Date
  updatedAt: Date
}

export const useWorldTextStore = defineStore('worldText', () => {
  const currentWorldText = ref<WorldTextData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * 根据 worldId 获取 WorldContent 的 text 内容
   * 如果不存在则创建一个新的 WorldContent 记录
   */
  const getWorldText = async (worldId: string): Promise<WorldTextData | null> => {
    try {
      loading.value = true
      error.value = null

      // 通过服务层获取WorldContent文本内容
      const worldContentText = await worldContentTextService.getWorldContentText(worldId)

      if (worldContentText) {
        const textData: WorldTextData = {
          text: worldContentText.text || {
            description: '',
            background: '',
            rules: '',
            notes: ''
          },
          createdAt: new Date(worldContentText.createdAt || Date.now()),
          updatedAt: new Date(worldContentText.updatedAt || Date.now())
        }
        
        currentWorldText.value = textData
        return textData
      }
      
      return null
    } catch (err) {
      console.error('Failed to get world text:', err)
      error.value = err instanceof Error ? err.message : '获取世界文本内容失败'
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 保存世界文本内容
   */
  const saveWorldText = async (worldId: string, textData: WorldTextData['text']): Promise<boolean> => {
    try {
      loading.value = true
      error.value = null

      // 通过服务层保存WorldContent文本内容
      await worldContentTextService.saveWorldContentText(worldId, textData || {})
      
      // 更新本地状态
      if (currentWorldText.value) {
        currentWorldText.value.text = textData
        currentWorldText.value.updatedAt = new Date()
      }
      
      return true
    } catch (err) {
      console.error('Failed to save world text:', err)
      error.value = err instanceof Error ? err.message : '保存世界文本内容失败'
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * 清空当前状态
   */
  const clearCurrentWorldText = () => {
    currentWorldText.value = null
    error.value = null
  }

  return {
    // 状态
    currentWorldText,
    loading,
    error,
    
    // 方法
    getWorldText,
    saveWorldText,
    clearCurrentWorldText
  }
})