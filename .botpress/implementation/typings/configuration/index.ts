/* eslint-disable */
/* tslint:disable */
// This file is generated. Do not edit it manually.

export type Configuration = {
  /** Configure one or more connections to Smithery-hosted MCP servers. */
  servers: Array<{
    /** A unique name you assign to this server connection (e.g., 'myGithub', 'workFiles'). Used to target actions. */
    internalName: string;
    /** The qualified name of the Smithery MCP server (e.g., @smithery-ai/github) */
    smitheryQualifiedName: string;
    /** Server-specific configuration as a JSON string (e.g., {"githubPersonalAccessToken":"ghp_..."}). Must match the server's schema. */
    smitheryServerConfigJson: string;
  }>;
};
