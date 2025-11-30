import { ChatAnthropic } from '@langchain/anthropic'
import { ChatOpenAI } from '@langchain/openai'

export type ModelAdaptor = ChatOpenAI | ChatAnthropic
