export interface SingleServerSmitheryConfig {
  connectionType: 'smithery-websocket';
  internalName: string;
  apiKey: string;
  qualifiedName: string;
  serverConfig: Record<string, any>; // Parsed JSON object
}
