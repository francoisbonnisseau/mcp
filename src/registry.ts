import axios from 'axios';
import { SingleServerSmitheryConfig } from './types';

/**
 * Client for interacting with the Smithery Registry API
 */
export class SmitheryRegistryClient {
  private readonly baseUrl = 'https://registry.smithery.ai';
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * List available MCP servers
   * @param query Search query parameters
   * @returns List of servers matching the query
   */
  async listServers({
    query = '',
    page = 1,
    pageSize = 10
  }: {
    query?: string;
    page?: number;
    pageSize?: number;
  } = {}) {
    try {
      const response = await axios.get(`${this.baseUrl}/servers`, {
        params: { q: query, page, pageSize },
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to list servers: ${error.message}`);
    }
  }

  /**
   * Get detailed information about a specific server
   * @param qualifiedName The qualified name of the server (e.g., @smithery-ai/server-sequential-thinking)
   * @returns Detailed server information including connection details
   */
  async getServer(qualifiedName: string) {
    try {
      // Format qualifiedName properly if needed
      if (qualifiedName.includes('/') && !qualifiedName.startsWith('@')) {
        const [owner, ...repoParts] = qualifiedName.split('/');
        qualifiedName = `@${owner}/${repoParts.join('/')}`;
      }

      const response = await axios.get(`${this.baseUrl}/servers/${qualifiedName}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error: any) {
      throw new Error(`Failed to get server info for ${qualifiedName}: ${error.message}`);
    }
  }

  /**
   * Find a server configuration by searching the registry
   * @param config Partial server configuration with search parameters
   * @returns Complete server configuration with connection details
   */
  async findServerConfiguration(config: SingleServerSmitheryConfig): Promise<{
    qualifiedName: string;
    displayName: string;
    deploymentUrl: string;
    connections: Array<{
      type: string;
      url?: string;
      configSchema: any;
    }>;
  }> {
    try {
      return await this.getServer(config.qualifiedName);
    } catch (error: any) {
      // If direct lookup fails, try searching
      const searchQuery = config.qualifiedName.includes('/')
        ? `owner:${config.qualifiedName.split('/')[0].replace('@', '')} repo:${config.qualifiedName.split('/')[1]} is:deployed`
        : config.qualifiedName;
      
      const searchResults = await this.listServers({ query: searchQuery });
      
      if (searchResults.servers && searchResults.servers.length > 0) {
        // Find the best match
        const server = searchResults.servers[0];
        return await this.getServer(server.qualifiedName);
      }
      
      throw new Error(`Could not find server matching ${config.qualifiedName}`);
    }
  }
}
