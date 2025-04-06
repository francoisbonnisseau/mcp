import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { createTransport } from "@smithery/sdk/transport.js";
import { WebSocketClientTransport } from "@modelcontextprotocol/sdk/client/websocket.js";
import { createSmitheryUrl } from "@smithery/sdk/config.js";
import { SingleServerSmitheryConfig } from './types';
import WebSocket from 'ws'; // Import WebSocket implementation for Node.js
import { SmitheryRegistryClient } from './registry';

// Add WebSocket to global scope if it's not defined
if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WebSocket;
}

export class MCPClient {
  private client: Client;
  private transport: any;
  private connected: boolean = false;
  private config: SingleServerSmitheryConfig;
  private logger: any;
  private registryClient: SmitheryRegistryClient;

  constructor(config: SingleServerSmitheryConfig, logger: any) {
    this.config = config;
    this.logger = logger;
    
    this.client = new Client({
      name: `Botpress-MCP-${config.internalName}`,
      version: "1.0.0"
    });
    
    // Create registry client with the API key
    this.registryClient = new SmitheryRegistryClient(this.config.apiKey);
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      this.logger.forBot().debug(`Creating transport for ${this.config.internalName}...`);
      
      // First, get the server details from the registry
      this.logger.forBot().debug(`Fetching server details from registry for ${this.config.qualifiedName}...`);
      const serverInfo = await this.registryClient.findServerConfiguration(this.config);
      
      this.logger.forBot().debug(`Found server: ${serverInfo.displayName}`);
      
      // Get the connection details - typically we want the WebSocket connection
      const wsConnection = serverInfo.connections.find(conn => conn.type === 'ws');
      
      if (!wsConnection) {
        throw new Error(`No WebSocket connection available for ${this.config.qualifiedName}`);
      }
      
      this.logger.forBot().debug(`Using connection URL: ${wsConnection.url || serverInfo.deploymentUrl}`);
      
      // Using the proper WebSocket URL format with the right API key
      const url = createSmitheryUrl(
        wsConnection.url || `${serverInfo.deploymentUrl}/ws`,
        {}, // Empty config as per server schema
      );
      
      this.logger.forBot().debug(`Created Smithery URL`);
      
      // Create the transport using the WebSocketClientTransport
      this.transport = new WebSocketClientTransport(url, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`
        }
      });
      
      this.logger.forBot().debug(`Connecting client to ${this.config.qualifiedName}...`);
      
      // Connect with timeout
      const connectionPromise = this.client.connect(this.transport);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 30000);
      });
      
      await Promise.race([connectionPromise, timeoutPromise]);
      this.connected = true;
      this.logger.forBot().debug(`Connected successfully to ${this.config.qualifiedName}`);
    } catch (error: any) {
      this.connected = false;
      
      // Enhanced error logging
      this.logger.forBot().error(`Connection failed to ${this.config.qualifiedName}: ${error.message}`);
      
      // Special debugging for this server
      if (error.message.includes('Connection closed')) {
        this.logger.forBot().error('This may be due to invalid API key or server configuration.');
        this.logger.forBot().debug(`API key present: ${Boolean(this.config.apiKey)}`);
      }
      
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.client.disconnect();
      this.connected = false;
      this.logger.forBot().debug(`Disconnected from ${this.config.qualifiedName}`);
    } catch (error: any) {
      this.logger.forBot().warn(`Error during disconnect: ${error.message}`);
      this.connected = false; // Consider it disconnected anyway
      throw error;
    }
  }

  getClientInfo() {
    return {
      name: this.config.internalName,
      qualifiedName: this.config.qualifiedName
    };
  }

  // MCP API method implementations
  async listResources() {
    return await this.client.listResources();
  }

  async readResource(uri: string) {
    return await this.client.readResource(uri);
  }

  async listTools() {
    return await this.client.listTools();
  }

  async executeTool(name: string, parameters: any) {
    return await this.client.callTool(name, parameters);
  }

  async listPrompts() {
    return await this.client.listPrompts();
  }

  async getPrompt(name: string) {
    return await this.client.getPrompt(name);
  }

  // Optional method to check if the connection is still alive
  async isConnected(): Promise<boolean> {
    try {
      // Light API call to check connection, like listing tools
      await this.client.listTools();
      return true;
    } catch (error) {
      return false;
    }
  }
}
