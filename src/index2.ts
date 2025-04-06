import * as bp from '.botpress'
import { MCPClient } from './client2';
import sdk from '@botpress/sdk';
import path from 'path';

// Function to process the MCP configuration
async function processMcpConfig(config: any) {
  if (!config) {
    console.warn("MCP configuration is missing.");
    return;
  }

  // Assuming config is a JSON array of command configurations
  if (Array.isArray(config)) {
    for (const item of config) {
      if (typeof item === 'object' && item !== null && 'command' in item && 'args' in item && 'env' in item) {
        const { command, args, env } = item;

        console.log(`Executing command: ${command} with args: ${JSON.stringify(args)} and env: ${JSON.stringify(env)}`);

        // Here you would implement the logic to execute the command
        // using the provided arguments and environment variables.
        // Example:
        // const result = await executeCommand(command, args, env);
        // console.log("Command result:", result);
      } else {
        console.warn("Invalid MCP configuration item:", item);
      }
    }
  } else {
    console.warn("MCP configuration is not an array.");
  }
}

export default new bp.Integration({
  actions: {
    listResources: async(args:any) => {
      const mcpClient = new MCPClient(parseConfiguration(args.ctx.configuration), args.logger);
      
      try {
        await mcpClient.connect();
        const resources = await mcpClient.listResources();
        return { resources };
      } finally {
        await mcpClient.disconnect();
      }
    },
    
    readResource: async(args:any) => {
      const mcpClient = new MCPClient(parseConfiguration(args.ctx.configuration), args.logger);
      
      try {
        await mcpClient.connect();
        const resource = await mcpClient.readResource(args.input.uri);
        return { resource };
      } finally {
        await mcpClient.disconnect();
      }
    },
    
    listTools: async(args:any) => {
      const mcpClient = new MCPClient(parseConfiguration(args.ctx.configuration), args.logger);
      
      try {
        await mcpClient.connect();
        const rawTools = await mcpClient.listTools();
        
        // Process the tools to match our schema
        const tools = Array.isArray(rawTools)
          ? rawTools
          : Array.isArray(rawTools?.tools)
          ? rawTools.tools
          : Object.values(rawTools?.tools || {});
        
        return {
          tools: tools.map((tool: any) => ({
            name: tool.name,
            description: tool.description || `Execute the ${tool.name} tool`,
            schema: tool.inputSchema?.properties 
              ? Object.keys(tool.inputSchema.properties) 
              : []
          }))
        };
      } finally {
        await mcpClient.disconnect();
      }
    },
    
    executeTool: async(args:any) => {
      const mcpClient = new MCPClient(parseConfiguration(args.ctx.configuration), args.logger);
      
      try {
        await mcpClient.connect();
        const result = await mcpClient.executeTool(args.input.name, args.input.parameters);
        return { result };
      } finally {
        await mcpClient.disconnect();
      }
    },
    
    listPrompts: async(args:any) => {
      const mcpClient = new MCPClient(parseConfiguration(args.ctx.configuration), args.logger);
      
      try {
        await mcpClient.connect();
        const prompts = await mcpClient.listPrompts();
        return { prompts };
      } finally {
        await mcpClient.disconnect();
      }
    },
    
    getPrompt: async(args:any) => {
      const mcpClient = new MCPClient(parseConfiguration(args.ctx.configuration), args.logger);
      
      try {
        await mcpClient.connect();
        const prompt = await mcpClient.getPrompt(args.input.name);
        return { prompt };
      } finally {
        await mcpClient.disconnect();
      }
    }
  },
    
  register: async (args: any) => {
    args.logger.forBot().info('MCP integration enabled');
    
    try {
      const mcpConfiguration = parseConfiguration(args.ctx.configuration);
      
      args.logger.forBot().debug(`Parsed MCP configuration: ${JSON.stringify(mcpConfiguration)}`);
      
      // Check if we have a valid command
      if (!mcpConfiguration.command) {
        throw new sdk.RuntimeError('Missing command in configuration');
      }
      
      // Log working directory and environment for debugging
      args.logger.forBot().debug(`Current working directory: ${process.cwd()}`);
      args.logger.forBot().debug(`PATH environment variable: ${process.env.PATH}`);
      
      try {
        args.logger.forBot().debug('Creating MCP client...');
        const mcpClient = new MCPClient(mcpConfiguration, args.logger);
        
        args.logger.forBot().debug('Attempting to connect to MCP server...');
        await mcpClient.connect();
        
        args.logger.forBot().debug('Successfully connected to MCP server, testing basic operation...');
        
        // Test basic operation by listing tools
        try {
          const tools = await mcpClient.listTools();
          args.logger.forBot().debug(`MCP server responded with tools: ${JSON.stringify(tools)}`);
        } catch (toolError:any) {
          args.logger.forBot().warn(`Could not list tools, but connection is established: ${toolError.message}`);
        }
        
        args.logger.forBot().info('Successfully connected to MCP server');
        
        // Disconnect after test
        await mcpClient.disconnect();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        args.logger.forBot().error(`Failed to connect to MCP server: ${errorMessage}`);
        
        // Return a more user-friendly error
        throw new sdk.RuntimeError(
          `Failed to connect to MCP server: ${errorMessage}. ` + 
          `Please check that the command specified in your configuration exists and is properly installed.`
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      args.logger.forBot().error(`Configuration error: ${errorMessage}`);
      
      if (error instanceof sdk.RuntimeError) {
        throw error; // Re-throw RuntimeErrors as they already have user-friendly messages
      } else {
        throw new sdk.RuntimeError(`Configuration error: ${errorMessage}`);
      }
    }
  },
    
  unregister: async ({ logger }) => {
    logger.forBot().info('MCP integration disabled');
  },
  
  handler: async () => {
    // No webhook handling required for MCP integration
  },
  
  channels: {
    // No channels for this integration
  }
});

// Helper function to parse the configuration
function parseConfiguration(config: any): any {
  try {
    // Parse the configuration string
    const configObj = JSON.parse(config.configuration);
    
    // Extract the connection type (first key in the object)
    const mcpType = Object.keys(configObj)[0];
    const connectionConfig = configObj[mcpType];
    
    if (!connectionConfig) {
      throw new sdk.RuntimeError(`Invalid MCP configuration: missing connection config for type ${mcpType}`);
    }
    
    if (!connectionConfig.command) {
      throw new sdk.RuntimeError(`Invalid MCP configuration: missing command for type ${mcpType}`);
    }
    
    return {
      connectionType: 'stdio',
      mcpName: mcpType,
      command: connectionConfig.command,
      args: connectionConfig.args,
      environments: connectionConfig.env
    };
  } catch (error: any) {
    if (error instanceof sdk.RuntimeError) {
      throw error;
    } else {
      throw new sdk.RuntimeError(`Failed to parse MCP configuration: ${error.message}`);
    }
  }
}