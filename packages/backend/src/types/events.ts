import type { DefineEvents } from "caido:plugin";
import type { McpSettings, ToolPermissions } from "shared";

export type BackendEvents = DefineEvents<{
    "agent-safe-caido-mcp:tool-action-confirmation-requested": (
        action: string,
        details: string,
        id: number,
    ) => void;
    "agent-safe-caido-mcp:mcp-server-settings-changed": (settings: McpSettings) => void;
    "agent-safe-caido-mcp:tool-group-permission-modes-changed": (
        permissions: ToolPermissions,
    ) => void;
}>;
