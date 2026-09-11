import { z } from 'zod'

export const agentScenarioSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    purpose: z.string().min(1),
    actor: z.enum(['user', 'tester']),
    environment: z
      .object({
        database: z.enum(['snapshot', 'empty']),
        state: z.enum(['inherit', 'fresh']),
        fixture: z
          .string()
          .regex(/^[a-z0-9/-]+\.json$/)
          .optional()
      })
      .strict(),
    turns: z
      .array(
        z
          .object({
            text: z.string().min(1),
            workspaceContext: z
              .object({
                pageKind: z.enum(['home', 'world', 'entity', 'document', 'chat', 'other']),
                routeName: z.string(),
                world: z.object({ id: z.string(), name: z.string().optional() }).optional(),
                entity: z
                  .object({
                    id: z.string(),
                    type: z.literal('character'),
                    name: z.string().optional()
                  })
                  .optional(),
                document: z.object({ id: z.string(), title: z.string().optional() }).optional()
              })
              .strict()
              .optional(),
            expect: z
              .object({
                successfulTools: z.array(z.string()).default([]),
                thoughtAfterTool: z.boolean().default(false),
                responseIncludes: z.array(z.string()).default([]),
                responseEquals: z.string().optional(),
                thoughtIncludes: z.array(z.string()).optional(),
                impressionUnchanged: z.boolean().optional(),
                toolArguments: z
                  .array(
                    z.object({ name: z.string(), args: z.record(z.string(), z.unknown()) }).strict()
                  )
                  .optional()
              })
              .strict()
              .default({ successfulTools: [], thoughtAfterTool: false, responseIncludes: [] })
          })
          .strict()
      )
      .min(1)
  })
  .strict()
  .refine(
    (value) => value.turns.every((turn) => !turn.expect.impressionUnchanged || Boolean(turn.workspaceContext?.entity)),
    { message: 'impressionUnchanged requires a character workspace entity on each checked turn.' }
  )
  .refine((value) => !value.environment.fixture || value.environment.database === 'empty', {
    message: 'Fixtures require an empty database.'
  })
  .refine(
    (value) =>
      value.turns.every(
        (turn) => !turn.expect.thoughtAfterTool || turn.expect.successfulTools.length > 0
      ),
    {
      message: 'thoughtAfterTool requires at least one expected successful tool.'
    }
  )
  .refine(
    (value) => value.environment.database !== 'empty' || value.environment.state === 'fresh',
    {
      message: 'An empty database requires fresh state.'
    }
  )

export type AgentScenario = z.infer<typeof agentScenarioSchema>
