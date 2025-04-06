import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import sdk from '@botpress/sdk';
import path from 'path';
import { existsSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class MCPClient {
  private client: Client;
  private transport: Transport;
  private logger: any; // Should ideally be typed with Botpress Logger type if available

  constructor(config: {
    connectionType: string,
    mcpName: string,
    command?: string,
    args?: any, // string or string[]
    environments?: any, // string (JSON) or object
    sseUrl?: string,
    messagesPostEndpoint?: string,
    headers?: string // newline-separated string
  }, logger?: any) {
    this.logger = logger;

    if (this.logger) this.logger.forBot().debug(`Creating MCP client with config: ${JSON.stringify(config)}`);

    // Create the appropriate transport based on the connection type
    if (config.connectionType === 'sse') {
      if (!config.sseUrl) {
        throw new Error('SSE URL is required for SSE connection type');
      }

      // Parse headers
      const headers: Record<string, string> = {};
      if (config.headers) {
        const headerLines = config.headers.split('\n');
        for (const line of headerLines) {
          const [name, value] = line.split(':', 2);
          if (name && value) {
            headers[name.trim()] = value.trim();
          }
        }
      }

      // Create SSE transport
      this.transport = new SSEClientTransport(
        new URL(config.sseUrl),
        {
          eventSourceInit: { headers },
          requestInit: {
            headers,
            ...(config.messagesPostEndpoint
              ? { endpoint: new URL(config.messagesPostEndpoint) }
              : {}),
          },
        },
      );
      if (this.logger) this.logger.forBot().debug('SSE transport created successfully');

    } else { // Assuming 'stdio' or default
      if (!config.command) {
        throw new sdk.RuntimeError('Command is required for STDIO connection type');
      }

      // --- Environment Parsing ---
      const env: Record<string, string> = {};
      if (config.environments) {
        let parsedEnv: any = null;
        if (typeof config.environments === 'object' && config.environments !== null) {
          parsedEnv = config.environments;
        } else if (typeof config.environments === 'string') {
          try {
            parsedEnv = JSON.parse(config.environments);
          } catch (e:any) {
            if (this.logger) this.logger.forBot().warn(`Could not parse environments JSON string: ${e.message}. Treating as non-JSON object.`);
            // Attempt to handle as object even if not JSON (though less likely)
             if (typeof config.environments === 'object' && config.environments !== null) {
               parsedEnv = config.environments;
             }
          }
        }

        if (typeof parsedEnv === 'object' && parsedEnv !== null) {
          Object.keys(parsedEnv).forEach(key => {
            env[key] = String(parsedEnv[key]); // Ensure values are strings
          });
        } else if (parsedEnv !== null) {
           if (this.logger) this.logger.forBot().warn(`Parsed environments resulted in unexpected type: ${typeof parsedEnv}`);
        }
      }

      // Add MCP_ prefixed environment variables from process.env
      for (const key in process.env) {
        if (key.startsWith('MCP_') && process.env[key]) {
          const envName = key.substring(4); // Remove 'MCP_'
          if (!env[envName]) { // Only add if not already set by config
             env[envName] = process.env[key] as string;
          } else {
             if (this.logger) this.logger.forBot().debug(`Environment variable '${envName}' from config overrides MCP_ prefixed process.env variable.`);
          }
        }
      }
       if (this.logger) this.logger.forBot().debug(`Final environment for process: ${JSON.stringify(env)}`);


      // --- Argument Parsing ---
      let parsedArgs: string[] = [];
      if (Array.isArray(config.args)) {
        parsedArgs = config.args.map(arg => String(arg)); // Ensure all are strings
      } else if (typeof config.args === 'string') {
        // Try parsing as JSON array first
        try {
          const jsonParsed = JSON.parse(config.args);
          if (Array.isArray(jsonParsed)) {
            parsedArgs = jsonParsed.map(arg => String(arg));
          } else {
             // If JSON parsed but not an array, fall back to space splitting
             if (this.logger) this.logger.forBot().debug('Config args is a JSON string but not an array, falling back to space splitting.');
             parsedArgs = config.args.split(' ').filter(Boolean);
          }
        } catch (e) {
          // If not valid JSON, assume space-separated string
          if (this.logger) this.logger.forBot().debug('Config args is not a valid JSON string, splitting by spaces.');
          parsedArgs = config.args.split(' ').filter(Boolean); // filter(Boolean) removes empty strings
        }
      }
      if (this.logger) this.logger.forBot().debug(`Parsed arguments: ${JSON.stringify(parsedArgs)}`);


      // --- Command Transformation (npx -> npm exec) ---
      let executionCommand = config.command as string;
      let executionArgs = parsedArgs; // Use the already parsed 'parsedArgs' array

      if (this.logger) {
          this.logger.forBot().debug(`Original command from config: ${executionCommand}`);
          this.logger.forBot().debug(`Original args from config: ${JSON.stringify(executionArgs)}`);
          this.logger.forBot().debug(`Using MCP name: ${config.mcpName}`);
      }

      // ** THE CORE CHANGE IS HERE **
      // if (executionCommand === 'npx') {
      //     this.logger?.forBot().info("Command is 'npx', transforming to use 'npm exec'.");
      //     executionCommand = 'npm'; // Use 'npm' as the command

      //     // Prepend 'exec', '-y', and '--' to the original arguments
      //     // The '--' tells npm exec that subsequent arguments are for the command being executed
      //     executionArgs = ['exec', '-y', '--', ...executionArgs];

      //     this.logger?.forBot().debug(`Transformed command to: ${executionCommand}`);
      //     this.logger?.forBot().debug(`Transformed args to: ${JSON.stringify(executionArgs)}`);
      // } else {
      //     // For commands other than npx, we'll use them directly.
      //     // The system's PATH resolution will handle finding them.
      //     // We are *not* calling resolveCommand here anymore for simplicity in the cloud env.
      //     this.logger?.forBot().debug(`Command is not 'npx', using as is: ${executionCommand}`);
      // }
      // ** END OF CORE CHANGE **


      // --- Create STDIO Transport ---
      try {
        if (this.logger) this.logger.forBot().debug(`Attempting to create StdioClientTransport with command: "${executionCommand}" and args: ${JSON.stringify(executionArgs)}`);

        this.transport = new StdioClientTransport({
          command: executionCommand, // Use the (potentially transformed) command
          args: executionArgs,       // Use the (potentially transformed) arguments
          env: env,                  // Pass the processed environment variables
        });

        if (this.logger) this.logger.forBot().debug('STDIO transport created successfully');

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (this.logger) this.logger.forBot().error(`Failed to create STDIO transport: ${errorMessage}`);

        // Check if the error is ENOENT *after* potential transformation
        if (errorMessage.includes('ENOENT')) {
           throw new Error(`Failed to create STDIO transport: Command "${executionCommand}" not found. Ensure it's available in the execution environment's PATH.`);
        }
        // Re-throw original or generic error
        throw new Error(`Failed to create STDIO transport: ${errorMessage}`);
      }
    }

    // Initialize the MCP client
    this.client = new Client(
      {
        // Using mcpName ensures uniqueness if multiple MCP sources are configured
        name: `${config.mcpName || 'default'}-mcp-client`,
        version: '1.0.0', // Consider making this dynamic or configurable if needed
      },
      {
        // Define capabilities - adjust if your client/server supports different things
        capabilities: {
          prompts: {},
          resources: {},
          tools: {},
        },
      }
    );
     if (this.logger) this.logger.forBot().debug(`MCP Client initialized.`);
  }

  // Helper method to check if a command exists and resolve its full path
  // Note: This is less reliable in restricted environments like Botpress Cloud.
  // It's kept for potential local debugging or use with known absolute paths.
  private resolveCommand(command: string): string {
    if (this.logger) this.logger.forBot().debug(`Attempting to resolve command: ${command}`);

    // If it's an absolute path or seems like a relative path, check existence directly
    if (path.isAbsolute(command) || command.includes(path.sep)) {
      if (existsSync(command)) {
         if (this.logger) this.logger.forBot().debug(`Command found at specified path: ${command}`);
        return command;
      }
      if (this.logger) this.logger.forBot().warn(`Command specified with path not found: ${command}`);
      // Don't throw here, let spawn handle the final error if needed
    }

    // Log PATH for debugging if resolution might be needed
    if (this.logger) {
        this.logger.forBot().debug(`Current PATH: ${process.env.PATH}`);
        this.logger.forBot().debug(`Current working directory: ${process.cwd()}`);
    }

    // If not a path, return the original command and rely on the system PATH.
    // The transformation logic above handles 'npx' specifically.
    if (this.logger) this.logger.forBot().debug(`Returning original command '${command}' for system PATH resolution.`);
    return command;
  }

  async connect() {
    // Add error handling to transport *before* connecting
    this.transport.onerror = (error) => {
      // This might catch errors *after* connection is established
      if (this.logger) this.logger.forBot().error(`Transport error occurred: ${error}`);
      // Decide if this should throw or just log depending on severity/recoverability
      // For now, just logging as connection might already be failing.
    };

    if (this.logger) this.logger.forBot().debug(`Connecting client via ${this.transport.constructor.name}...`);

    try {
      await this.client.connect(this.transport);
      if (this.logger) this.logger.forBot().info(`Successfully connected client to MCP server.`);
      return this; // Allow chaining
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (this.logger) this.logger.forBot().error(`Connection failed for client : ${errorMessage}`);

      // Provide more specific feedback based on common errors
      if (errorMessage.includes('ENOENT')) {
        const commandAttempted = this.transport instanceof StdioClientTransport
            ? (this.transport as any).options?.command // Access potentially private option
            : 'N/A (not STDIO)';
        const commandInfo = await this.getCommandInfo(); // Check what IS available
        throw new sdk.RuntimeError(
            `Connection failed: Command '${commandAttempted}' not found. ` +
            `Make sure the command exists and is accessible within the integration environment's PATH. ${commandInfo}`
        );
      } else if (errorMessage.includes('closed') || errorMessage.includes('exit code')) {
         throw new sdk.RuntimeError(
             `MCP server connection failed or closed unexpectedly. This might be due to: `+
             `1. Incorrect configuration (e.g., invalid token in ENV). `+
             `2. The server package crashing on startup. `+
             `3. Compatibility issues between the client and server package versions. `+
             `Original error: ${errorMessage}`
         );
      } else {
        // Generic fallback
        throw new sdk.RuntimeError(`Failed to connect to MCP server: ${errorMessage}`);
      }
    }
  }

  // Helper method to get information about common Node-related commands
  private async getCommandInfo(): Promise<string> {
     if (process.platform === 'win32') return ''; // 'where' might not be reliable or useful here.
     try {
       // Check for common commands on Unix-like systems
       const commandsToCheck = ['node', 'npm', 'npx'];
       const results = await Promise.allSettled(
         commandsToCheck.map(cmd => execAsync(`which ${cmd}`))
       );

       let availableInfo = "Available commands found: ";
       let found = false;
       results.forEach((result, index) => {
         if (result.status === 'fulfilled' && result.value.stdout) {
           availableInfo += `${commandsToCheck[index]} (${result.value.stdout.trim()}) `;
           found = true;
         }
       });

       return found ? availableInfo.trim() : 'Could not determine availability of node/npm/npx via `which`.';
     } catch (error) {
       if (this.logger) this.logger.forBot().warn(`Failed to get command info via 'which': ${error}`);
       return 'Could not determine available commands.';
     }
   }


  // --- MCP Standard Methods ---

  async listResources() {
    if (this.logger) this.logger.forBot().debug('Listing resources...');
    const result = await this.client.listResources();
    if (this.logger) this.logger.forBot().debug(`Received ${result?.resources?.length ?? 0} resources.`);
    return result;
  }

  async readResource(uri: string) {
    if (this.logger) this.logger.forBot().debug(`Reading resource: ${uri}...`);
    const result = await this.client.readResource({ uri });
    if (this.logger) this.logger.forBot().debug(`Received resource data for: ${uri}`);
    return result;
  }

  async listTools() {
    if (this.logger) this.logger.forBot().debug('Listing tools...');
    const result = await this.client.listTools();
     if (this.logger) this.logger.forBot().debug(`Received ${result?.tools?.length ?? 0} tools.`);
    return result;
  }

  async executeTool(name: string, parameters: Record<string, any>) {
    if (this.logger) this.logger.forBot().debug(`Executing tool: ${name} with params: ${JSON.stringify(parameters)}...`);
    const toolResult = await this.client.callTool({
      name,
      arguments: parameters, // MCP uses 'arguments' field
    });
    if (this.logger) this.logger.forBot().debug(`Received result for tool ${name}: ${JSON.stringify(toolResult)}`);
    return toolResult; // The result structure might vary based on the tool
  }

  async listPrompts() {
    if (this.logger) this.logger.forBot().debug('Listing prompts...');
    const result = await this.client.listPrompts();
     if (this.logger) this.logger.forBot().debug(`Received ${result?.prompts?.length ?? 0} prompts.`);
    return result;
  }

  async getPrompt(name: string) {
    if (this.logger) this.logger.forBot().debug(`Getting prompt: ${name}...`);
    const result = await this.client.getPrompt({ name });
    if (this.logger) this.logger.forBot().debug(`Received prompt data for: ${name}`);
    return result;
  }

  async disconnect() {
    if (this.logger) this.logger.forBot().debug(`Disconnecting client '${this.client.info.name}'...`);
    try {
        // The MCP SDK client doesn't have an explicit public disconnect method
        // that signals the server or closes the transport.
        // The transport might close itself if the underlying process ends or stream closes.
        // We can try closing the transport if it has a close method (StdioClientTransport does).
        if (typeof (this.transport as any).close === 'function') {
             (this.transport as any).close();
             if (this.logger) this.logger.forBot().debug(`Transport closed for client '${this.client.info.name}'.`);
        } else {
             if (this.logger) this.logger.forBot().debug(`Transport type ${this.transport.constructor.name} does not have an explicit close method.`);
        }
    } catch (error) {
         if (this.logger) this.logger.forBot().warn(`Error during explicit transport close: ${error}`);
    }
    // No explicit client disconnect needed. Garbage collection handles the client object.
  }
}

// Note: The processMcpConfig function seems redundant here as the constructor handles config.
// It's removed unless it serves a purpose outside the MCPClient class itself.