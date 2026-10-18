export type McpSettings = {
    enabled: boolean;
    host: string;
    port: number;
    url: string;
    controlUrl: string;
};

export type McpConfigInput = {
    host: string;
    port: number;
};

export type BackendAPI = {
    initializeMcpServer: () => Promise<void>;
    getMcpServerSettings: () => Promise<McpSettings>;
    setMcpServerEnabled: (enabled: boolean) => Promise<McpSettings>;
    updateMcpServerConfig: (config: McpConfigInput) => Promise<McpSettings>;
    getToolGroupPermissionModes: () => Promise<ToolPermissions>;
    setToolGroupPermissionMode: (groupId: string, mode: ToolGroupMode) => Promise<ToolPermissions>;
    setToolPermissionMode: (action: string, mode: ToolGroupMode) => Promise<ToolPermissions>;
    setAllToolGroupPermissionModes: (mode: ToolGroupMode) => Promise<ToolPermissions>;
    resolveToolActionConfirmation: (id: number, confirmed: boolean) => Promise<boolean>;
};

export type BackendEvents = {
    "agent-safe-caido-mcp:tool-action-confirmation-requested": (
        action: string,
        details: string,
        id: number,
    ) => void;
    "agent-safe-caido-mcp:mcp-server-settings-changed": (settings: McpSettings) => void;
    "agent-safe-caido-mcp:tool-group-permission-modes-changed": (
        permissions: ToolPermissions,
    ) => void;
};

export type ToolGroupMode = "auto" | "guarded-auto" | "confirm" | "disabled";

export type ToolGroupTool = {
    name: string;
    action: string;
    defaultMode: ToolGroupMode;
};

export type ToolGroup = {
    id: string;
    label: string;
    tools: ToolGroupTool[];
};

export type ToolPermissions = {
    groups: ToolGroup[];
    states: Record<string, ToolGroupMode>;
    toolStates: Record<string, ToolGroupMode>;
};

export const MCP_DEFAULT_HOST = "127.0.0.1";
export const MCP_DEFAULT_PORT = 3334;
export const MCP_ENDPOINT_PATH = "/mcp";
export const MCP_CONTROL_ENDPOINT_PATH = "/control";
export const MCP_PLUGIN_VERSION = "4.0.0";
