import { z } from "zod";

import {
    GET_INTERCEPT_STATUS_QUERY,
    PAUSE_INTERCEPT_MUTATION,
    RESUME_INTERCEPT_MUTATION,
} from "../graphql";
import { ToolGroupId } from "../tool-permissions";

import { registerToolAction, type ToolContext } from "./register";
import { stringifyResult } from "./shared";

export const registerInterceptTools = ({ server, sdk, store, permissions }: ToolContext) => {
    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.intercept.status",
        group: ToolGroupId.InterceptSafe,
        toolName: "get_intercept_status",
        description: "Get Caido Intercept status.",
        inputSchema: z.object({}).strict(),
        defaultMode: "auto",
        handler: async () => {
            const response = await sdk.graphql.execute(GET_INTERCEPT_STATUS_QUERY);
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.intercept.pause",
        group: ToolGroupId.InterceptUnsafe,
        toolName: "pause_intercept",
        description: "Pause Caido Intercept. This changes global operator traffic handling.",
        inputSchema: z.object({}).strict(),
        defaultMode: "confirm",
        readOnly: false,
        handler: async () => {
            const response = await sdk.graphql.execute(PAUSE_INTERCEPT_MUTATION);
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.intercept.resume",
        group: ToolGroupId.InterceptUnsafe,
        toolName: "resume_intercept",
        description: "Resume Caido Intercept. This changes global operator traffic handling.",
        inputSchema: z.object({}).strict(),
        defaultMode: "confirm",
        readOnly: false,
        handler: async () => {
            const response = await sdk.graphql.execute(RESUME_INTERCEPT_MUTATION);
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });
};
