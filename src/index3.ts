import * as bp from '.botpress'
import { MCPClient } from './client3'; // Assuming client.ts is updated as below
import sdk from '@botpress/sdk';

// Store connected clients globally for reuse
const connectedClients: Map<string, MCPClient> = new Map();

// Interface for the configuration of a single server, used internally
interface SingleServerSmitheryConfig {
  connectionType: 'smithery-websocket';
  internalName: string;
  apiKey: string;
  qualifiedName: string;
  serverConfig: Record<string, any>; // Parsed JSON object
}

// Helper to find and parse a specific server's config from the context
function getAndParseServerConfig(
  internalName: string,
  ctx: sdk.IntegrationContext,
  logger: any
): SingleServerSmitheryConfig {
  logger.forBot().debug(`Looking for server config with internalName: ${internalName}`);
  const serverConfigs = ctx.configuration.servers; // Array from definition

  if (!Array.isArray(serverConfigs)) {
    logger.forBot().error("Integration configuration 'servers' is not an array or is missing.");
    throw new sdk.RuntimeError("Invalid integration configuration: 'servers' array is missing.");
  }

  const config = serverConfigs.find(s => s.internalName === internalName);

  if (!config) {
    logger.forBot().error(`No MCP server configuration found for internalName: ${internalName}`);
    throw new sdk.RuntimeError(`No MCP server configuration found for internalName: ${internalName}`);
  }

  // Validate required fields from the found config
  if (!config.smitheryApiKey || !config.smitheryQualifiedName || !config.smitheryServerConfigJson) {
     logger.forBot().error(`Incomplete configuration for internalName ${internalName}. Missing API key, qualified name, or config JSON.`);
     throw new sdk.RuntimeError(`Incomplete configuration for server "${internalName}". Ensure API Key, Qualified Name, and Server Config JSON are set.`);
  }

  let parsedServerConfig: Record<string, any>;
  try {
    parsedServerConfig = JSON.parse(config.smitheryServerConfigJson);
    if (typeof parsedServerConfig !== 'object' || parsedServerConfig === null) {
      throw new Error('Parsed configuration is not an object.');
    }
    logger.forBot().debug(`Successfully parsed serverConfig JSON for ${internalName}.`);
  } catch (error: any) {
    logger.forBot().error(`Failed to parse "smitheryServerConfigJson" for ${internalName}: ${error.message}. Raw: ${config.smitheryServerConfigJson}`);
    throw new sdk.RuntimeError(`Failed to parse Server Config JSON for "${internalName}": ${error.message}. Ensure it's valid JSON.`);
  }

  return {
    connectionType: 'smithery-websocket', // Type assertion
    internalName: config.internalName,
    apiKey: config.smitheryApiKey,
    qualifiedName: config.smitheryQualifiedName,
    serverConfig: parsedServerConfig,
  };
}

export default new bp.Integration({
  register: async ({ ctx, logger }) => {
    logger.forBot().info('Registering MCP integration for Smithery...');
    const serverConfigs = ctx.configuration.servers ?? []; // Default to empty array

    if (serverConfigs.length === 0) {
      logger.forBot().warn("No Smithery MCP servers configured.");
      // Don't throw an error, allow registration with no servers configured
      return;
    }

    logger.forBot().info(`Found ${serverConfigs.length} server configuration(s) to validate and connect.`);

    // Connect to each configured server and store the connection
    for (const config of serverConfigs) {
      const internalName = config.internalName ?? 'Unnamed Server'; // Use a fallback name for logging
      logger.forBot().debug(`Setting up connection for server: ${internalName}`);

      try {
        // Use the helper function to parse and validate this specific config entry
        const parsedConfig = getAndParseServerConfig(config.internalName, ctx, logger);
        
        // Create and connect client
        logger.forBot().debug(`Creating persistent client for ${internalName}...`);
        const mcpClient = new MCPClient(parsedConfig, logger);
        
        logger.forBot().debug(`Connecting to ${internalName}...`);
        await mcpClient.connect();
        
        // Store connected client
        connectedClients.set(internalName, mcpClient);
        logger.forBot().info(`Successfully connected to ${internalName} (${parsedConfig.qualifiedName}).`);
        
      } catch (error: any) {
        logger.forBot().error(`Failed to setup connection for server "${internalName}": ${error.message}`);
        throw new sdk.RuntimeError(`Failed to setup connection for server "${internalName}": ${error.message}`);
      }
    }
    
    logger.forBot().info(`All ${connectedClients.size} Smithery MCP servers connected successfully.`);
  },

  unregister: async ({ logger }) => {
    logger.forBot().info(`Unregistering MCP integration (Smithery) - disconnecting ${connectedClients.size} servers.`);
    
    // Disconnect all clients
    const disconnectionPromises = Array.from(connectedClients.entries()).map(async ([internalName, client]) => {
      try {
        logger.forBot().debug(`Disconnecting client for ${internalName}...`);
        await client.disconnect();
        logger.forBot().debug(`Successfully disconnected client for ${internalName}.`);
      } catch (error: any) {
        logger.forBot().warn(`Error disconnecting client for ${internalName}: ${error.message}`);
        // Continue with other disconnections even if one fails
      }
    });
    
    await Promise.all(disconnectionPromises);
    connectedClients.clear();
    logger.forBot().info('All MCP connections closed.');
  },

  handler: async () => {
    // No webhook handling needed
  },

  actions: {
    // --- Action Implementations ---
    // All actions now use the stored connections instead of creating new ones

    listResources: async ({ ctx, input, logger }) => {
      const { internalName } = input;
      
      // Get the existing client or reconnect if needed
      const mcpClient = await getOrReconnectClient(internalName, ctx, logger);
      
      try {
        const resourcesResult = await mcpClient.listResources();
        return { resources: resourcesResult?.resources ?? [] };
      } catch (error: any) {
         logger.forBot().error(`Action listResources failed for ${internalName}: ${error.message}`);
         throw new sdk.RuntimeError(`Failed to list resources from ${internalName}: ${error.message}`);
      }
    },

    readResource: async ({ ctx, input, logger }) => {
       const { internalName, uri } = input;
       
       // Get the existing client or reconnect if needed
       const mcpClient = await getOrReconnectClient(internalName, ctx, logger);
       
       try {
         const resourceResult = await mcpClient.readResource(uri);
         return { resource: resourceResult };
       } catch (error: any) {
          logger.forBot().error(`Action readResource failed for ${internalName} (URI: ${uri}): ${error.message}`);
          throw new sdk.RuntimeError(`Failed to read resource ${uri} from ${internalName}: ${error.message}`);
       }
    },

    listTools: async ({ ctx, input, logger }) => {
      const { internalName } = input;
      
      // Get the existing client or reconnect if needed
      const mcpClient = await getOrReconnectClient(internalName, ctx, logger);
      
      try {
        const rawToolsResult = await mcpClient.listTools();
        const rawTools = rawToolsResult?.tools ?? [];
        return {
          tools: rawTools.map((tool: any) => ({
            name: tool.name ?? 'Unnamed Tool',
            description: tool.description || `Execute the ${tool.name ?? '?'} tool`,
            schema: tool.inputSchema ?? undefined
          }))
        };
      } catch (error: any) {
          logger.forBot().error(`Action listTools failed for ${internalName}: ${error.message}`);
          throw new sdk.RuntimeError(`Failed to list tools from ${internalName}: ${error.message}`);
      }
    },

    executeTool: async ({ ctx, input, logger }) => {
      const { internalName, name: toolName, parameters } = input;
      
      // Get the existing client or reconnect if needed
      const mcpClient = await getOrReconnectClient(internalName, ctx, logger);
      
      try {
        const result = await mcpClient.executeTool(toolName, parameters ?? {});
        return { result };
      } catch (error: any) {
          logger.forBot().error(`Action executeTool failed for ${internalName} (Tool: ${toolName}): ${error.message}`);
          throw new sdk.RuntimeError(`Failed to execute tool "${toolName}" on ${internalName}: ${error.message}`);
      }
    },

    listPrompts: async ({ ctx, input, logger }) => {
       const { internalName } = input;
       
       // Get the existing client or reconnect if needed
       const mcpClient = await getOrReconnectClient(internalName, ctx, logger);
       
       try {
         const promptsResult = await mcpClient.listPrompts();
         return { prompts: promptsResult?.prompts ?? [] };
       } catch (error: any) {
          logger.forBot().error(`Action listPrompts failed for ${internalName}: ${error.message}`);
          throw new sdk.RuntimeError(`Failed to list prompts from ${internalName}: ${error.message}`);
       }
    },

    getPrompt: async ({ ctx, input, logger }) => {
       const { internalName, name: promptName } = input;
       
       // Get the existing client or reconnect if needed
       const mcpClient = await getOrReconnectClient(internalName, ctx, logger);
       
       try {
         const promptResult = await mcpClient.getPrompt(promptName);
         return { prompt: promptResult };
       } catch (error: any) {
           logger.forBot().error(`Action getPrompt failed for ${internalName} (Prompt: ${promptName}): ${error.message}`);
           throw new sdk.RuntimeError(`Failed to get prompt "${promptName}" from ${internalName}: ${error.message}`);
       }
    }
  },

  // No channels needed
  channels: {}
});

// Helper function to get an existing client or reconnect if needed
async function getOrReconnectClient(internalName: string, ctx: sdk.IntegrationContext, logger: any): Promise<MCPClient> {
  let mcpClient = connectedClients.get(internalName);
  
  if (!mcpClient) {
    logger.forBot().warn(`Client for ${internalName} not found or disconnected. Reconnecting...`);
    const parsedConfig = getAndParseServerConfig(internalName, ctx, logger);
    mcpClient = new MCPClient(parsedConfig, logger);
    await mcpClient.connect();
    connectedClients.set(internalName, mcpClient);
    logger.forBot().info(`Reconnected to ${internalName} successfully.`);
  }
  
  // Check if client is still connected, reconnect if needed
  try {
    // Optionally add a lightweight ping/isConnected method to MCPClient
    // if (!(await mcpClient.isConnected())) {
    //   throw new Error('Connection lost');
    // }
  } catch (error) {
    logger.forBot().warn(`Connection to ${internalName} appears to be stale. Reconnecting...`);
    const parsedConfig = getAndParseServerConfig(internalName, ctx, logger);
    
    try {
      await mcpClient.disconnect();
    } catch (disconnectError) {
      logger.forBot().debug(`Error while disconnecting stale connection: ${disconnectError.message}`);
    }
    
    mcpClient = new MCPClient(parsedConfig, logger);
    await mcpClient.connect();
    connectedClients.set(internalName, mcpClient);
    logger.forBot().info(`Reconnected to ${internalName} successfully.`);
  }
  
  return mcpClient;
}