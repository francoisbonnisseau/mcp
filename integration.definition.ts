import { IntegrationDefinition, z } from '@botpress/sdk';
import { states } from './definitions/states'

const INTEGRATION_NAME = "mcp";

// Define the schema for a single server configuration entry
const serverConfigSchema = z.object({
  internalName: z.string()
    .min(1, "Internal Name cannot be empty.")
    .describe("A unique name you assign to this server connection (e.g., 'myGithub', 'workFiles'). Used to target actions."),
  smitheryQualifiedName: z.string()
    .min(1, "Smithery Qualified Name cannot be empty.")
    .describe("The qualified name of the Smithery MCP server (e.g., @smithery-ai/github)"),
  smitheryServerConfigJson: z.string()
    .min(2, "Must be a valid JSON object string, e.g., {} or {\"API_KEY\":\"...\"}")
    .describe("Server-specific configuration as a JSON string (e.g., {\"githubPersonalAccessToken\":\"ghp_...\"}). Must match the server's schema."),
}).describe("Configuration for a single Smithery MCP Server connection.");

export default new IntegrationDefinition({
  name: INTEGRATION_NAME,
  version: '0.3.0', // Version incremented

  // Updated Configuration schema for MULTIPLE Smithery servers
  configuration: {
    schema: z.object({
      //smitheryApiKey: z.string().min(1, "Smithery API Key cannot be empty.").describe("Your API key obtained from smithery.ai."),
      servers: z.array(serverConfigSchema)
        .min(1, "At least one MCP server configuration is required.")
        .describe("Configure one or more connections to Smithery-hosted MCP servers.")
    })
  },

  // Events remain the same (consider refining types if needed)
  events: {},

  // Actions: ADD internalName to input schema for ALL actions
  actions: {
    listResources: {
      input: { schema: z.object({
          internalName: z.string().describe("The internal name of the configured server to use.")
      }) },
      output: { schema: z.object({ resources: z.array(z.any()).optional() }) }
    },
    readResource: {
      input: { schema: z.object({
          internalName: z.string().describe("The internal name of the configured server to use."),
          uri: z.string().describe("The URI of the resource to read.")
      }) },
      output: { schema: z.object({ resource: z.any().optional() }) }
    },
    listTools: {
      input: { schema: z.object({
          internalName: z.string().describe("The internal name of the configured server to use.")
      }) },
      output: {
        schema: z.object({
          tools: z.array(z.object({
            name: z.string(),
            description: z.string().optional(),
            schema: z.record(z.any()).optional() // Matching event schema
          })).optional()
        })
      }
    },
    executeTool: {
      input: {
        schema: z.object({
          internalName: z.string().describe("The internal name of the configured server to use."),
          name: z.string().describe("The name of the tool to execute."),
          parameters: z.string().optional().describe("Parameters for the tool, if required.")
        })
      },
      output: { schema: z.object({ result: z.any().optional() }) }
    },
    listPrompts: {
      input: { schema: z.object({
          internalName: z.string().describe("The internal name of the configured server to use.")
      }) },
      output: { schema: z.object({ prompts: z.array(z.any()).optional() }) }
    },
    getPrompt: {
      input: { schema: z.object({
          internalName: z.string().describe("The internal name of the configured server to use."),
          name: z.string().describe("The name of the prompt to get.")
      }) },
      output: { schema: z.object({ prompt: z.any().optional() }) }
    }
  },

  icon: 'icon.svg',
  channels: {},
  states,
  user: { tags: {} }
});