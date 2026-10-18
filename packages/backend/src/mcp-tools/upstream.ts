import { z } from "zod";

import {
    CREATE_UPSTREAM_HTTP_MUTATION,
    CREATE_UPSTREAM_SOCKS_MUTATION,
    DELETE_UPSTREAM_HTTP_MUTATION,
    DELETE_UPSTREAM_SOCKS_MUTATION,
    LIST_UPSTREAM_PROXIES_QUERY,
    TOGGLE_UPSTREAM_HTTP_MUTATION,
    TOGGLE_UPSTREAM_SOCKS_MUTATION,
    UPDATE_UPSTREAM_HTTP_MUTATION,
    UPDATE_UPSTREAM_SOCKS_MUTATION,
} from "../graphql";
import { ToolGroupId } from "../tool-permissions";

import { registerToolAction, type ToolContext } from "./register";
import { stringifyResult } from "./shared";

const idSchema = z.preprocess(
    (value) => (typeof value === "number" ? String(value) : value),
    z.string().min(1),
);
const connectionSchema = z
    .object({
        host: z.string().min(1),
        port: z.number().int().min(1).max(65535),
        isTLS: z.boolean().default(false),
        SNI: z.string().min(1).optional(),
    })
    .strict();
const authSchema = z
    .object({ basic: z.object({ username: z.string(), password: z.string() }).strict() })
    .strict()
    .optional();
const baseProxySchema = z
    .object({
        allowlist: z.array(z.string()).default([]),
        denylist: z.array(z.string()).default([]),
        enabled: z.boolean().default(false),
        connection: connectionSchema,
        auth: authSchema,
    })
    .strict();
const socksProxySchema = baseProxySchema.extend({ includeDns: z.boolean().default(false) });

export const registerUpstreamTools = ({ server, sdk, store, permissions }: ToolContext) => {
    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.upstream.list",
        group: ToolGroupId.UpstreamSafe,
        toolName: "list_upstream_proxies",
        description: "List HTTP and SOCKS upstream proxies without returning stored passwords.",
        inputSchema: z.object({}).strict(),
        defaultMode: "auto",
        handler: async () => {
            const response = await sdk.graphql.execute(LIST_UPSTREAM_PROXIES_QUERY);
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });

    const registerCreate = (kind: "http" | "socks") => {
        const schema = kind === "http" ? baseProxySchema : socksProxySchema;
        registerToolAction(server, sdk, store, permissions, {
            action: `sdk.upstream.create.${kind}`,
            group: ToolGroupId.UpstreamUnsafe,
            toolName: `create_upstream_${kind}_proxy`,
            description: `Create a disabled-by-default ${kind.toUpperCase()} upstream proxy configuration. Enabling it affects subsequent traffic.`,
            inputSchema: schema,
            defaultMode: "confirm",
            readOnly: false,
            handler: async (params) => {
                const input = schema.parse(params);
                const response = await sdk.graphql.execute(
                    kind === "http"
                        ? CREATE_UPSTREAM_HTTP_MUTATION
                        : CREATE_UPSTREAM_SOCKS_MUTATION,
                    { input },
                );
                return { content: [{ type: "text", text: stringifyResult(response) }] };
            },
        });
    };
    registerCreate("http");
    registerCreate("socks");

    const registerUpdate = (kind: "http" | "socks") => {
        const proxySchema = kind === "http" ? baseProxySchema : socksProxySchema;
        const schema = z.object({ id: idSchema, input: proxySchema }).strict();
        registerToolAction(server, sdk, store, permissions, {
            action: `sdk.upstream.update.${kind}`,
            group: ToolGroupId.UpstreamUnsafe,
            toolName: `update_upstream_${kind}_proxy`,
            description: `Replace a ${kind.toUpperCase()} upstream proxy configuration.`,
            inputSchema: schema,
            defaultMode: "confirm",
            readOnly: false,
            handler: async (params) => {
                const input = schema.parse(params);
                const response = await sdk.graphql.execute(
                    kind === "http"
                        ? UPDATE_UPSTREAM_HTTP_MUTATION
                        : UPDATE_UPSTREAM_SOCKS_MUTATION,
                    input,
                );
                return { content: [{ type: "text", text: stringifyResult(response) }] };
            },
        });
    };
    registerUpdate("http");
    registerUpdate("socks");

    const registerToggle = (kind: "http" | "socks") => {
        const schema = z.object({ id: idSchema, enabled: z.boolean() }).strict();
        registerToolAction(server, sdk, store, permissions, {
            action: `sdk.upstream.toggle.${kind}`,
            group: ToolGroupId.UpstreamUnsafe,
            toolName: `toggle_upstream_${kind}_proxy`,
            description: `Enable or disable a ${kind.toUpperCase()} upstream proxy.`,
            inputSchema: schema,
            defaultMode: "confirm",
            readOnly: false,
            handler: async (params) => {
                const input = schema.parse(params);
                const response = await sdk.graphql.execute(
                    kind === "http"
                        ? TOGGLE_UPSTREAM_HTTP_MUTATION
                        : TOGGLE_UPSTREAM_SOCKS_MUTATION,
                    input,
                );
                return { content: [{ type: "text", text: stringifyResult(response) }] };
            },
        });
    };
    registerToggle("http");
    registerToggle("socks");

    const registerDelete = (kind: "http" | "socks") => {
        const schema = z.object({ id: idSchema }).strict();
        registerToolAction(server, sdk, store, permissions, {
            action: `sdk.upstream.delete.${kind}`,
            group: ToolGroupId.UpstreamUnsafe,
            toolName: `delete_upstream_${kind}_proxy`,
            description: `Delete a ${kind.toUpperCase()} upstream proxy configuration.`,
            inputSchema: schema,
            defaultMode: "disabled",
            readOnly: false,
            annotations: { destructiveHint: true, idempotentHint: false },
            handler: async (params) => {
                const input = schema.parse(params);
                const response = await sdk.graphql.execute(
                    kind === "http"
                        ? DELETE_UPSTREAM_HTTP_MUTATION
                        : DELETE_UPSTREAM_SOCKS_MUTATION,
                    input,
                );
                return { content: [{ type: "text", text: stringifyResult(response) }] };
            },
        });
    };
    registerDelete("http");
    registerDelete("socks");
};
