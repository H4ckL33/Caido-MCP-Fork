import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { ZodType } from "zod";

import type { ConfirmActionStore } from "../confirm-actions";
import { ToolGroupId, type ToolPermissionsStore } from "../tool-permissions";
import type { MCPSDK } from "../types/sdk";

import type { ActionPayload, ToolResult } from "./shared";
import { formatDetails, isToolResult } from "./shared";

export type ToolContext = {
    server: McpServer;
    sdk: MCPSDK;
    store: ConfirmActionStore;
    permissions: ToolPermissionsStore;
};

const toolActionRegistries = new WeakMap<McpServer, Map<string, RegisteredTool>>();

const READ_ONLY_GROUPS = new Set<ToolGroupId>([
    ToolGroupId.ProjectSafe,
    ToolGroupId.ProxyPassthroughSafe,
    ToolGroupId.RequestSafe,
    ToolGroupId.RuntimeSafe,
    ToolGroupId.SitemapSafe,
    ToolGroupId.WsSafe,
]);

const OPEN_WORLD_ACTIONS = new Set([
    "sdk.requests.send",
    "sdk.requests.sendRaw",
    "sdk.replay.startTask",
]);

export const attachToolActionRegistry = (
    server: McpServer,
    toolsByAction: Map<string, RegisteredTool>,
) => {
    toolActionRegistries.set(server, toolsByAction);
};

const executeAction = async (
    sdk: MCPSDK,
    store: ConfirmActionStore,
    permissions: ToolPermissionsStore,
    payload: ActionPayload,
): Promise<ToolResult> => {
    const mode = permissions.getModeForAction(payload.action);
    if (mode === "disabled") {
        throw new Error("Tool disabled");
    }
    const needsConfirm = mode === "confirm";
    if (needsConfirm) {
        const { id, promise } = store.createPendingAction(
            payload.action,
            payload.params,
            async () => {
                const result = await store.runAction(payload.action, payload.params);
                if (isToolResult(result)) return result;
                return { content: [{ type: "text", text: "ok" }] };
            },
        );
        sdk.api.send(
            "agent-safe-caido-mcp:tool-action-confirmation-requested",
            payload.action,
            formatDetails(payload),
            id,
        );
        const result = await promise;
        if (!result.confirmed) {
            const disposition = result.reason ?? "rejected";
            return {
                content: [
                    {
                        type: "text",
                        text: `Action ${payload.action} was not executed (${disposition})`,
                    },
                ],
            };
        }
        if (result.error !== undefined) {
            sdk.console.error(`MCP action failed: ${result.action} id=${id} error=${result.error}`);
            return {
                content: [{ type: "text", text: `error: ${result.error}` }],
            };
        }
        return (
            (result.result as ToolResult) ?? {
                content: [{ type: "text", text: "ok" }],
            }
        );
    }
    const result = await store.runAction(payload.action, payload.params);
    if (isToolResult(result)) return result;
    return { content: [{ type: "text", text: "ok" }] };
};

export const registerToolAction = (
    server: McpServer,
    sdk: MCPSDK,
    store: ConfirmActionStore,
    permissions: ToolPermissionsStore,
    config: {
        action: string;
        group: ToolGroupId;
        toolName: string;
        description: string;
        inputSchema: ZodType;
        handler: (params: Record<string, unknown>) => unknown;
        annotations?: Partial<ToolAnnotations>;
        confirm?: never;
    },
): RegisteredTool => {
    const readOnly = READ_ONLY_GROUPS.has(config.group);
    const annotations: ToolAnnotations = {
        readOnlyHint: readOnly,
        destructiveHint: !readOnly,
        idempotentHint: readOnly,
        openWorldHint: OPEN_WORLD_ACTIONS.has(config.action),
        ...config.annotations,
    };
    store.registerAction(config.action, config.handler);
    permissions.registerTool(config.action, config.group, config.toolName);
    const tool = server.registerTool(
        config.toolName,
        {
            description: config.description,
            inputSchema: config.inputSchema,
            annotations,
        },
        async (input: unknown) => {
            const payload: ActionPayload = {
                action: config.action,
                params: input as Record<string, unknown>,
            };
            return await executeAction(sdk, store, permissions, payload);
        },
    );
    toolActionRegistries.get(server)?.set(config.action, tool);
    return tool;
};
