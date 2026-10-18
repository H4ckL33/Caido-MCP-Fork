import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ConfirmActionStore } from "../confirm-actions";
import type { OperationPolicyStore } from "../operation-policy";
import type { ToolPermissionsStore } from "../tool-permissions";
import type { MCPSDK } from "../types/sdk";

import { registerAutomateTools } from "./automate";
import { registerConsoleTools } from "./console";
import { registerEnvTools } from "./env";
import { registerFilterTools } from "./filters";
import { registerFindingsTools } from "./findings";
import { registerHostedFileTools } from "./hosted-file";
import { registerInterceptTools } from "./intercept";
import { registerPassthroughTools } from "./passthrough";
import { registerPolicyTools } from "./policy";
import { registerProjectTools } from "./projects";
import { attachToolActionRegistry, type ToolContext } from "./register";
import { registerReplayTools } from "./replay";
import { registerRequestTools } from "./requests";
import { registerRuntimeTools } from "./runtime";
import { registerScopeTools } from "./scope";
import { registerSitemapTools } from "./sitemap";
import { registerTamperTools } from "./tamper";
import { registerUpstreamTools } from "./upstream";
import { registerWebsocketTools } from "./websocket";
import { registerWorkflowTools } from "./workflows";

export function registerMcpTools(
    server: McpServer,
    sdk: MCPSDK,
    store: ConfirmActionStore,
    permissions: ToolPermissionsStore,
    policy: OperationPolicyStore,
) {
    const toolsByAction = new Map<string, RegisteredTool>();
    attachToolActionRegistry(server, toolsByAction);
    const ctx: ToolContext = { server, sdk, store, permissions, policy };

    registerAutomateTools(ctx);
    registerEnvTools(ctx);
    registerProjectTools(ctx);
    registerPolicyTools(ctx);
    registerScopeTools(ctx);
    registerHostedFileTools(ctx);
    registerInterceptTools(ctx);
    registerPassthroughTools(ctx);
    registerFindingsTools(ctx);
    registerRequestTools(ctx);
    registerSitemapTools(ctx);
    registerConsoleTools(ctx);
    registerRuntimeTools(ctx);
    registerReplayTools(ctx);
    registerFilterTools(ctx);
    registerTamperTools(ctx);
    registerUpstreamTools(ctx);
    registerWebsocketTools(ctx);
    registerWorkflowTools(ctx);

    return { toolsByAction };
}
