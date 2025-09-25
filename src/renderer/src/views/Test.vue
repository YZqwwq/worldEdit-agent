<template>
  <div class="test-container">
    <div class="test-header">
      <h1>数据库测试页面</h1>
      <p>测试 SQLite + JSON Schema 集成</p>
    </div>

    <div class="test-content">
      <div class="test-section">
        <h2>数据库状态</h2>
        <div class="status-grid">
          <div class="status-item">
            <span class="label">初始化状态:</span>
            <span :class="['status', initStatus.success ? 'success' : 'error']">
              {{ initStatus.success ? '成功' : '失败' }}
            </span>
          </div>
          <div class="status-item" v-if="stats">
            <span class="label">世界观数量:</span>
            <span class="value">{{ stats.worldCount }}</span>
          </div>
          <div class="status-item" v-if="stats">
            <span class="label">角色数量:</span>
            <span class="value">{{ stats.characterCount }}</span>
          </div>
          <div class="status-item" v-if="stats">
            <span class="label">地图数量:</span>
            <span class="value">{{ stats.mapCount }}</span>
          </div>
        </div>
        <div v-if="initStatus.error" class="error-message">
          <strong>错误信息:</strong> {{ initStatus.error }}
        </div>
      </div>

      <div class="test-section">
        <h2>功能测试</h2>
        <div class="test-buttons">
          <button @click="testCreateWorld" :disabled="loading">创建测试世界观</button>
          <button @click="testLoadWorlds" :disabled="loading">加载世界观列表</button>
          <button @click="testValidation" :disabled="loading">测试数据验证</button>
          <button @click="clearDatabase" :disabled="loading" class="danger">清空数据库</button>
        </div>
      </div>

      <div class="test-section" v-if="testResults.length > 0">
        <h2>测试结果</h2>
        <div class="test-results">
          <div 
            v-for="(result, index) in testResults" 
            :key="index" 
            :class="['test-result', result.success ? 'success' : 'error']"
          >
            <div class="result-header">
              <span class="result-title">{{ result.title }}</span>
              <span class="result-time">{{ formatTime(result.timestamp) }}</span>
            </div>
            <div class="result-content">
              {{ result.message }}
            </div>
            <div v-if="result.data" class="result-data">
              <pre>{{ JSON.stringify(result.data, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { typeormDatabaseService as databaseService } from '../services/serviceImpl/world'
import { simpleValidator } from '../schemas/simple-validator'
import { initService } from '../services/init'
import type { UnifiedWorldData, WorldData } from '../../../shared/types/world/world'

interface TestResult {
  title: string
  success: boolean
  message: string
  timestamp: Date
  data?: any
}

const loading = ref(false)
const initStatus = ref({ success: false, error: '' })
const stats = ref<any>(null)
const testResults = ref<TestResult[]>([])

const addTestResult = (result: TestResult) => {
  testResults.value.unshift(result)
  if (testResults.value.length > 10) {
    testResults.value = testResults.value.slice(0, 10)
  }
}

const testCreateWorld = async () => {
  loading.value = true
  try {
    const testWorld: Omit<WorldData, 'id' | 'createdAt' | 'updatedAt'> = {
      name: `测试世界观 ${Date.now()}`,
      description: '这是一个用于测试TypeORM和JSON Schema集成的测试世界观',
      tags: ['测试', 'TypeORM', 'JSON Schema'],
      author: '系统测试',
      lastModified: new Date(),
      version: '1.0.0'
    }

    const created = await databaseService.createWorld(testWorld)
    addTestResult({
      title: '创建世界观测试',
      success: true,
      message: `成功创建世界观: ${created.name}`,
      timestamp: new Date(),
      data: created
    })
    
    await updateStats()
  } catch (error) {
    addTestResult({
      title: '创建世界观测试',
      success: false,
      message: `创建失败: ${error}`,
      timestamp: new Date()
    })
  } finally {
    loading.value = false
  }
}

const testLoadWorlds = async () => {
  loading.value = true
  try {
    const worlds = await databaseService.getWorldList()
    addTestResult({
      title: '加载世界观列表测试',
      success: true,
      message: `成功加载 ${worlds.length} 个世界观`,
      timestamp: new Date(),
      data: worlds
    })
  } catch (error) {
    addTestResult({
      title: '加载世界观列表测试',
      success: false,
      message: `加载失败: ${error}`,
      timestamp: new Date()
    })
  } finally {
    loading.value = false
  }
}

const testValidation = async () => {
  loading.value = true
  try {
    // 测试有效数据
    const validData: UnifiedWorldData = {
      id: 'test-validation',
      name: '验证测试世界观',
      description: '用于测试JSON Schema验证的世界观',
      tags: ['验证', '测试'],
      author: '系统',
      lastModified: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0.0',
      geography: [],
      nations: [],
      factions: [],
      powerSystems: [],
      timeline: [],
      characters: [],
      maps: [],
      relationships: []
    }

    const validation = simpleValidator.validateUnifiedWorldData(validData)
    
    // 测试无效数据
    const invalidData = {
      id: 'invalid-test',
      // 缺少必需字段
    }
    
    const invalidValidation = simpleValidator.validateUnifiedWorldData(invalidData as any)
    
    addTestResult({
      title: 'JSON Schema 验证测试',
      success: validation.valid && !invalidValidation.valid,
      message: `有效数据验证: ${validation.valid ? '通过' : '失败'}, 无效数据验证: ${!invalidValidation.valid ? '正确拒绝' : '错误通过'}`,
      timestamp: new Date(),
      data: {
        validData: validation,
        invalidData: invalidValidation
      }
    })
  } catch (error) {
    addTestResult({
      title: 'JSON Schema 验证测试',
      success: false,
      message: `验证测试失败: ${error}`,
      timestamp: new Date()
    })
  } finally {
    loading.value = false
  }
}

const clearDatabase = async () => {
  if (!confirm('确定要清空所有数据库数据吗？此操作不可恢复！')) {
    return
  }
  
  loading.value = true
  try {
    await databaseService.clear()
    addTestResult({
      title: '清空数据库测试',
      success: true,
      message: '数据库已清空',
      timestamp: new Date()
    })
    
    await updateStats()
  } catch (error) {
    addTestResult({
      title: '清空数据库测试',
      success: false,
      message: `清空失败: ${error}`,
      timestamp: new Date()
    })
  } finally {
    loading.value = false
  }
}

const updateStats = async () => {
  try {
    stats.value = await initService.getStats()
  } catch (error) {
    console.error('获取统计信息失败:', error)
  }
}

const formatTime = (date: Date) => {
  return date.toLocaleTimeString()
}

onMounted(async () => {
  try {
    await initService.initialize()
    initStatus.value.success = true
    await updateStats()
  } catch (error) {
    initStatus.value.success = false
    initStatus.value.error = String(error)
  }
})
</script>

<style scoped>
.test-container {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.test-header {
  text-align: center;
  margin-bottom: 30px;
}

.test-header h1 {
  color: #2c3e50;
  margin-bottom: 10px;
}

.test-header p {
  color: #7f8c8d;
  font-size: 16px;
}

.test-section {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.test-section h2 {
  color: #34495e;
  margin-bottom: 15px;
  border-bottom: 2px solid #ecf0f1;
  padding-bottom: 10px;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-bottom: 15px;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 4px;
}

.label {
  font-weight: 500;
  color: #495057;
}

.status.success {
  color: #27ae60;
  font-weight: bold;
}

.status.error {
  color: #e74c3c;
  font-weight: bold;
}

.value {
  font-weight: bold;
  color: #2980b9;
}

.error-message {
  background: #fee;
  border: 1px solid #fcc;
  border-radius: 4px;
  padding: 10px;
  color: #c33;
}

.test-buttons {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.test-buttons button {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.2s;
}

.test-buttons button:not(.danger) {
  background: #3498db;
  color: white;
}

.test-buttons button:not(.danger):hover {
  background: #2980b9;
}

.test-buttons button.danger {
  background: #e74c3c;
  color: white;
}

.test-buttons button.danger:hover {
  background: #c0392b;
}

.test-buttons button:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}

.test-results {
  max-height: 600px;
  overflow-y: auto;
}

.test-result {
  border-left: 4px solid #bdc3c7;
  background: #f8f9fa;
  padding: 15px;
  margin-bottom: 10px;
  border-radius: 0 4px 4px 0;
}

.test-result.success {
  border-left-color: #27ae60;
  background: #f0fff4;
}

.test-result.error {
  border-left-color: #e74c3c;
  background: #fff5f5;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.result-title {
  font-weight: bold;
  color: #2c3e50;
}

.result-time {
  font-size: 12px;
  color: #7f8c8d;
}

.result-content {
  color: #34495e;
  margin-bottom: 10px;
}

.result-data {
  background: #2c3e50;
  color: #ecf0f1;
  padding: 10px;
  border-radius: 4px;
  font-size: 12px;
  overflow-x: auto;
}

.result-data pre {
  margin: 0;
  white-space: pre-wrap;
}
</style>