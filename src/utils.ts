import { SingleServerSmitheryConfig } from './types';

/**
 * Validates a Smithery server configuration
 * @param config The server configuration to validate
 * @returns An object containing validation result and any error messages
 */
export function validateSmitheryConfig(config: SingleServerSmitheryConfig): { 
  valid: boolean; 
  errors: string[];
} {
  const errors: string[] = [];
  
  // Check required fields
  if (!config.qualifiedName) {
    errors.push('Missing qualifiedName');
  }
  
  if (!config.apiKey) {
    errors.push('Missing API key');
  }
  
  // No longer require serverConfig to be non-empty since some servers use empty configs
  
  // Check qualifiedName format (should be owner/repo or @owner/repo)
  if (config.qualifiedName && !config.qualifiedName.includes('/')) {
    errors.push('qualifiedName should be in format "owner/repo" or "@owner/repo"');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Formats a Smithery server URL correctly
 * @param qualifiedName The qualified name of the server
 * @returns Properly formatted server URL
 */
export function formatSmitheryUrl(qualifiedName: string): string {
  // Ensure the owner part has @ prefix if needed
  if (qualifiedName.includes('/') && !qualifiedName.startsWith('@')) {
    const [owner, ...repoParts] = qualifiedName.split('/');
    qualifiedName = `@${owner}/${repoParts.join('/')}`;
  }
  
  return `https://server.smithery.ai/${qualifiedName}`;
}

/**
 * Create a minimal test script for direct connection testing
 * @param config Server configuration
 * @returns A string containing a test script
 */
export function generateTestScript(config: SingleServerSmitheryConfig): string {
  const formattedUrl = formatSmitheryUrl(config.qualifiedName);
  
  return `
// Test script for ${config.internalName}
import { createTransport } from "@smithery/sdk/transport.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

async function test() {
  try {
    console.log("Creating transport...");
    const transport = createTransport(
      "${formattedUrl}",
      {}, // Empty config
      "${config.apiKey}"
    );
    
    console.log("Creating client...");
    const client = new Client({
      name: "Test-Client",
      version: "1.0.0"
    });
    
    console.log("Connecting client...");
    await client.connect(transport);
    console.log("Connected successfully!");
    
    console.log("Listing tools...");
    const tools = await client.listTools();
    console.log("Available tools:", tools.map(t => t.name).join(", "));
    
    await client.disconnect();
    console.log("Test completed successfully.");
  } catch (error) {
    console.error("Test failed:", error);
  }
}

test();
  `.trim();
}
