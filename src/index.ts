import * as bp from '.botpress'
import sdk from '@botpress/sdk';
import { z } from 'zod';
import { createTransport } from "@smithery/sdk/transport.js"
import { createSmitheryUrl } from "@smithery/sdk/config.js"
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import WebSocket from 'ws';
import { ADDRGETNETWORKPARAMS } from 'dns';

// Polyfill WebSocket for Node.js environment if it's not already defined
if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WebSocket as any;
}

const clientCache = new Map<string, Client>();

export default new bp.Integration({
    register: async (args) => {
        // args.logger.forBot().info("Registering Smithery. API key: " + args.ctx.configuration.smitheryApiKey);
        // const smitheryApiKey = args.ctx.configuration?.smitheryApiKey;
        // if (!smitheryApiKey) {
        //     throw new sdk.RuntimeError("Smithery API Key is required for integration.");
        // }
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

        // try {
        //     // const transport = createTransport("https://server.smithery.ai/@smithery-ai/server-sequential-thinking", {}, smitheryApiKey)
        //     const url = createSmitheryUrl(
        //         "wss://server.smithery.ai/@smithery-ai/server-sequential-thinking/ws",
        //         {},
        //     )
        //     const transport = new WebSocketClientTransport(url)
        //     const client = new Client({
        //         name: "Test client",
        //         version: "1.0.0"
        //     })
        //     await client.connect(transport)

        //     // Use the server tools with your LLM application
        //     const tools = await client.listTools()
        //     args.logger.forBot().info(`Available tools: ${tools?.tools?.map((t: any) => t.name).join(", ")}`)
        // } catch (error: any) {
        //     args.logger.forBot().error("Failed during initial client connection test: " + error.message);
        //     // Depending on whether this test connection is critical, you might want to re-throw
        //     throw new sdk.RuntimeError("Failed to connect to test server: " + error.message);
        // }
                
        //Initialize the transport for each server configuration
        for (const server of serverConfigs) {
            try{
                args.logger.forBot().info("Creating transport for server: " + server.internalName);
                args.logger.forBot().info("Server config: " + JSON.stringify(server.serverConfigJson));
                const url = "wss://server.smithery.ai/" + server.qualifiedName + "/ws";
                args.logger.forBot().info("Transport URL: " + url);
                const transportUrl = createSmitheryUrl(
                    url,
                    JSON.parse(server.serverConfigJson),
                )
                const transport = new WebSocketClientTransport(transportUrl)
                const client = new Client({
                    name: `${server.internalName}-client`,
                    version: "1.0.0"
                });
                await client.connect(transport);
                // log the type of the client so i can then store it properly
                // args.logger.forBot().info("Client type: " + typeof client);
                // args.logger.forBot().info("Client: " + JSON.stringify(client));
                // saveClients.push({'name': server.internalName, 'client': client});
                // Store the client 
                clientCache.set(server.internalName, client);
                const tools = await client.listTools()
                args.logger.forBot().info(`Available tools: ${tools?.tools?.map((t: any) => t.name).join(", ")}`)
            }
            catch (error: any) {
                args.logger.forBot().error(`Failed to create transport for server ${server.internalName}: ${error.message}`);
                throw new sdk.RuntimeError(`Failed to create transport for server ${server.internalName}: ${error.message}`);
            }
        }
    },
    unregister: async () => {},
    actions: {
        listResources: async (args:any) => {
            const { internalName } = args.input;
            
            // Get the existing client or reconnect if needed
            const mcpClient = clientCache.get(internalName);
            
            try {
            const resourcesResult = await mcpClient?.listResources();
            return { resources: resourcesResult?.resources ?? [] };
            } catch (error: any) {
                args.logger.forBot().error(`Action listResources failed for ${internalName}: ${error.message}`);
                throw new sdk.RuntimeError(`Failed to list resources from ${internalName}: ${error.message}`);
            }
        },
    
        readResource: async (args:any) => {
            const { internalName, uri } = args.input;
            
            // Get the existing client or reconnect if needed
            const mcpClient = clientCache.get(internalName);
            
            try {
                const resourceResult = await mcpClient?.readResource(uri);
                return { resource: resourceResult };
            } catch (error: any) {
                args.logger.forBot().error(`Action readResource failed for ${internalName} (URI: ${uri}): ${error.message}`);
                throw new sdk.RuntimeError(`Failed to read resource ${uri} from ${internalName}: ${error.message}`);
            }
        },
    
        listTools: async (args:any) => {
            const { internalName } = args.input;
            
            // Get the existing client or reconnect if needed
            const mcpClient = clientCache.get(internalName);
            // args.logger.forBot().info("MCP Client: " + JSON.stringify(mcpClient));
            try {
                const rawToolsResult = await mcpClient?.listTools();
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
            const { internalName, name: toolName, stringParameters } = args.input;
            
            // Get the existing client or reconnect if needed
            const mcpClient = clientCache.get(internalName);
            const parameters = stringParameters ? JSON.parse(stringParameters) : {};
            try {
            const result = await mcpClient?.callTool(toolName, parameters ?? {});
            return { result };
            } catch (error: any) {
                args.logger.forBot().error(`Action executeTool failed for ${internalName} (Tool: ${toolName}): ${error.message}`);
                throw new sdk.RuntimeError(`Failed to execute tool "${toolName}" on ${internalName}: ${error.message}`);
            }
        },
    
        listPrompts: async (args:any) => {
            const { internalName } = args.input;
            
            // Get the existing client or reconnect if needed
            const mcpClient = clientCache.get(internalName);
            
            try {
                const promptsResult = await mcpClient?.listPrompts();
                return { prompts: promptsResult?.prompts ?? [] };
            } catch (error: any) {
                args.logger.forBot().error(`Action listPrompts failed for ${internalName}: ${error.message}`);
                throw new sdk.RuntimeError(`Failed to list prompts from ${internalName}: ${error.message}`);
            }
        },
    
        getPrompt: async (args:any) => {
            const { internalName, name: promptName } = args.input;
            
            // Get the existing client or reconnect if needed
            const mcpClient = clientCache.get(internalName);
            
            try {
                const promptResult = await mcpClient?.getPrompt(promptName);
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