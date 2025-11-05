import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

class AIService {
  private chat: ChatOpenAI

  constructor() {
    // 在此处硬编码您的API参数
    this.chat = new ChatOpenAI({
      modelName: 'gemini-2.5-pro',
      temperature: 0.9,
      configuration: {
        apiKey: 'sk-tNyCJbWcFMiYPg8_HZg2aJjGn9owN4zzQ10jgPgaOV2l-6ZYFCLsvyuCFTI', // 请替换为您的 API Key
        baseURL: 'https://api.nekro.ai' // 请替换为您的 API 地址
      }
    })
  }

  async sendMessage(message: string): Promise<string> {
    try {
      const messages = [
        new SystemMessage('You are a helpful assistant.'),
        new HumanMessage(message)
      ]
      const response = await this.chat.invoke(messages)
      
      if (typeof response.content === 'string') {
        return response.content
      }
      
      // 如果返回的 content 不是简单字符串，则进行转换
      return JSON.stringify(response.content)
    } catch (error) {
      console.error('Error sending message to AI:', error)
      return '抱歉，AI服务出现了一点问题。'
    }
  }
}

export const aiService = new AIService()