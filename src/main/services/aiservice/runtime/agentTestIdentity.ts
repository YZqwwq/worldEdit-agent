import { resolve, dirname } from 'node:path'

export const resolveAgentMessageSource = (
  env: NodeJS.ProcessEnv = process.env
): 'user' | 'tester' => {
  if (env.WORLDEDIT_AGENT_TEST_ACTOR !== 'tester') return 'user'
  const root = env.WORLDEDIT_AGENT_TEST_USER_DATA
  const database = env.WORLDEDIT_AGENT_DATABASE_PATH
  if (
    env.WORLDEDIT_AGENT_ISOLATE_APP_DATA !== '1' ||
    !root ||
    !database ||
    resolve(dirname(database)) !== resolve(root) ||
    (env.WORLDEDIT_AGENT_SOURCE_DATABASE &&
      resolve(database) === resolve(env.WORLDEDIT_AGENT_SOURCE_DATABASE))
  ) {
    throw new Error('Tester identity requires an isolated application database.')
  }
  return 'tester'
}

export const TEST_IDENTITY_PROMPT =
  '当前处于隔离测试环境，本轮对话对象是测试者，不是原用户。测试者的消息不代表原用户的意图、情绪或关系变化。按正常能力理解请求、使用工具并形成表达，不因测试身份声称已经完成未执行的操作。应用数据库操作仅作用于隔离副本；外部网络和外部服务并不因此自动隔离。'
