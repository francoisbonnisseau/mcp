import * as bp from '.botpress'
import sdk from '@botpress/sdk';
import { z } from 'zod';
import { createTransport } from "@smithery/sdk/transport.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"

export default new bp.Integration({
    register: async (args:any) => {
        args.logger.forBot().info("Registering Smithery. API key: " + args.ctx.configuration.smitheryApiKey);
        const smitheryApiKey = args.ctx.configuration?.smitheryApiKey;
        if (!smitheryApiKey) {
            throw new sdk.RuntimeError("Smithery API Key is required for integration.");
        }
        const servers = args.ctx.configuration?.servers || [];
        args.logger.forBot().info("Smithery servers: " + JSON.stringify(servers));
        if (servers.length === 0) {
            throw new sdk.RuntimeError("At least one MCP server configuration is required.");
        }
        const serverConfigs = servers.map((server: any) => {
            const internalName = server.internalName ;
            const qualifiedName = server.smitheryQualifiedName ;
            const serverConfigJson = server.smitheryServerConfigJson || "{}";
            if (!internalName || !qualifiedName) {
                throw new sdk.RuntimeError("Both internalName and qualifiedName are required for each server configuration.");
            }
            return { internalName, qualifiedName, serverConfigJson };
        }
        );
        args.logger.forBot().info("Server configurations: " + JSON.stringify(serverConfigs));
        // Initialize the context for transports
        const transports = {};
        
        // Initialize the transport for each server configuration
        for (const server of serverConfigs) {
            args.logger.forBot().info("Creating transport for server: " + server.internalName);
            args.logger.forBot().info("Server config: " + JSON.stringify(server.serverConfigJson));
            const url = "https://server.smithery.ai/" + server.qualifiedName;
            args.logger.forBot().info("Server URL: " + url);
            const transport = createTransport(url,
                server.serverConfigJson, 
                smitheryApiKey);
            const client = new Client({
                name: `${server.internalName}-client`,
                version: "1.0.0"
            });
            await client.connect(transport);
        }
    
        // Initialize the MCP clients for each server configuration
        // const clients: Record<string, any> = {};
        // for (const server of serverConfigs) {
        //     const transport = transports[server.internalName];
        //     const client = new Client({
        //         name: `${server.internalName}-client`,
        //         version: "1.0.0"
        //     });
        //     await client.connect(transport);
        //     // Store the client in the context for later use
        //     clients[server.internalName] = client;
        // }
    },
    unregister: async () => {},
    actions: {
        listResources: async (args:any) => {
            const { internalName } = args.input;
            
            // Get the existing client or reconnect if needed
            const mcpClient = args.context.clients[internalName];
            
            try {
            const resourcesResult = await mcpClient.listResources();
            return { resources: resourcesResult?.resources ?? [] };
            } catch (error: any) {
                args.logger.forBot().error(`Action listResources failed for ${internalName}: ${error.message}`);
                throw new sdk.RuntimeError(`Failed to list resources from ${internalName}: ${error.message}`);
            }
        },
    
        readResource: async (args:any) => {
            const { internalName, uri } = args.input;
            
            // Get the existing client or reconnect if needed
            const mcpClient = args.context.clients[internalName];
            
            try {
                const resourceResult = await mcpClient.readResource(uri);
                return { resource: resourceResult };
            } catch (error: any) {
                args.logger.forBot().error(`Action readResource failed for ${internalName} (URI: ${uri}): ${error.message}`);
                throw new sdk.RuntimeError(`Failed to read resource ${uri} from ${internalName}: ${error.message}`);
            }
        },
    
        listTools: async (args:any) => {
            const { internalName } = args.input;
            
            // Get the existing client or reconnect if needed
            const mcpClient = args.context.clients[internalName];
            
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
                args.logger.forBot().error(`Action listTools failed for ${internalName}: ${error.message}`);
                throw new sdk.RuntimeError(`Failed to list tools from ${internalName}: ${error.message}`);
            }
        },
    
        executeTool: async (args:any) => {
            const { internalName, name: toolName, parameters } = args.input;
            
            // Get the existing client or reconnect if needed
            const mcpClient = args.context.clients[internalName];
            
            try {
            const result = await mcpClient.executeTool(toolName, parameters ?? {});
            return { result };
            } catch (error: any) {
                args.logger.forBot().error(`Action executeTool failed for ${internalName} (Tool: ${toolName}): ${error.message}`);
                throw new sdk.RuntimeError(`Failed to execute tool "${toolName}" on ${internalName}: ${error.message}`);
            }
        },
    
        listPrompts: async (args:any) => {
            const { internalName } = args.input;
            
            // Get the existing client or reconnect if needed
            const mcpClient = args.context.clients[internalName];
            
            try {
                const promptsResult = await mcpClient.listPrompts();
                return { prompts: promptsResult?.prompts ?? [] };
            } catch (error: any) {
                args.logger.forBot().error(`Action listPrompts failed for ${internalName}: ${error.message}`);
                throw new sdk.RuntimeError(`Failed to list prompts from ${internalName}: ${error.message}`);
            }
        },
    
        getPrompt: async (args:any) => {
            const { internalName, name: promptName } = args.input;
            
            // Get the existing client or reconnect if needed
            const mcpClient = args.context.clients[internalName];
            
            try {
                const promptResult = await mcpClient.getPrompt(promptName);
                return { prompt: promptResult };
            } catch (error: any) {
                args.logger.forBot().error(`Action getPrompt failed for ${internalName} (Prompt: ${promptName}): ${error.message}`);
                throw new sdk.RuntimeError(`Failed to get prompt "${promptName}" from ${internalName}: ${error.message}`);
            }
        }   
    },
    channels: {},
    events: async () => {}
})