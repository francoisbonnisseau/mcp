import * as sdk from '@botpress/sdk'
const { z } = sdk

export const states = {
  configuration: {
    type: 'integration',
    schema: z.object({
        clients: z.array(z.object({}))
    })
  },
} as const satisfies sdk.IntegrationDefinitionProps['states']