import { Annotation, messagesStateReducer } from '@langchain/langgraph'
import { BaseMessage } from '@langchain/core/messages'
import type { PersonaPolicy } from '@share/cache/AItype/states/personaPolicy'
import type { TaskLifecycleState } from '@share/cache/AItype/states/taskLifecycleState'

export const MessagesState = Annotation.Root({
  // 消息状态
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => []
  }),
  llmCalls: Annotation<number | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  personaPolicy: Annotation<PersonaPolicy | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  }),
  taskLifecycle: Annotation<TaskLifecycleState | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined
  })
})
