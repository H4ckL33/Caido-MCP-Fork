import { z } from "zod";

import { ToolGroupId } from "../tool-permissions";

import { registerToolAction, type ToolContext } from "./register";
import { stringifyResult } from "./shared";

const idSchema = z.string().min(3).max(128);
const projectIdSchema = z.string().min(1).max(128);

const targetSchema = z
    .object({
        host: z.string().min(1),
        include_subdomains: z.boolean().default(false),
        ports: z.array(z.number().int().min(1).max(65535)).min(1).optional(),
        tls: z.boolean().optional(),
        path_prefix: z.string().min(1).optional(),
    })
    .strict();

const installGrantSchema = z
    .object({
        id: idSchema,
        project_id: projectIdSchema,
        authorization_id: z.string().min(1).max(256),
        scope_digest: z.string().min(1).max(256),
        targets: z.array(targetSchema).min(1),
        methods: z.array(z.string().min(1).max(32)).min(1),
        expires_at: z.string().datetime({ offset: true }),
        max_requests: z.number().int().positive(),
    })
    .strict();

export const registerPolicyTools = ({ server, sdk, store, permissions, policy }: ToolContext) => {
    registerToolAction(server, sdk, store, permissions, {
        action: "policy.capabilities.get",
        group: ToolGroupId.PolicySafe,
        toolName: "get_agent_safe_capabilities",
        description:
            "Report the enforcement boundary of this plugin. False capabilities must not be inferred from Caido UI or GraphQL support.",
        inputSchema: z.object({}).strict(),
        defaultMode: "auto",
        handler: () => ({
            content: [
                {
                    type: "text",
                    text: stringifyResult({
                        plugin_policy_version: 1,
                        caido_runtime_version: sdk.runtime.version,
                        guarded_http_send: true,
                        delivery_receipts: true,
                        project_scope_binding: true,
                        proxy_wide_http_guard: false,
                        websocket_active_guard: false,
                        automate_start: false,
                        active_workflow_run: false,
                        note: "Browser/proxy traffic requires the separate canonical egress guard. WebSocket active operations remain disabled without per-frame inspection.",
                    }),
                },
            ],
        }),
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "policy.grants.list",
        group: ToolGroupId.PolicySafe,
        toolName: "list_execution_grants",
        description:
            "List local execution-grant projections. Grants do not create authorization; they bind an already approved authorization and scope to guarded Caido operations.",
        inputSchema: z.object({}).strict(),
        defaultMode: "auto",
        handler: () => ({
            content: [{ type: "text", text: stringifyResult({ grants: policy.listGrants() }) }],
        }),
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "policy.grants.install",
        group: ToolGroupId.PolicyUnsafe,
        toolName: "install_execution_grant",
        description:
            "Install a bounded local projection of an existing authorization. Requires confirmation and binds targets, methods, project, expiry, scope digest, and request budget.",
        inputSchema: installGrantSchema,
        defaultMode: "confirm",
        readOnly: false,
        handler: async (params) => {
            const input = installGrantSchema.parse(params);
            const current = await sdk.projects.getCurrent();
            if (current === undefined) throw new Error("No Caido project is selected");
            if (String(current.getId()) !== input.project_id) {
                throw new Error("Selected Caido project does not match project_id");
            }
            const grant = await policy.installGrant({
                id: input.id,
                projectId: input.project_id,
                authorizationId: input.authorization_id,
                scopeDigest: input.scope_digest,
                targets: input.targets.map((target) => ({
                    host: target.host,
                    includeSubdomains: target.include_subdomains,
                    ports: target.ports,
                    tls: target.tls,
                    pathPrefix: target.path_prefix,
                })),
                methods: input.methods,
                expiresAt: input.expires_at,
                maxRequests: input.max_requests,
            });
            return { content: [{ type: "text", text: stringifyResult({ grant }) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "policy.grants.revoke",
        group: ToolGroupId.PolicyUnsafe,
        toolName: "revoke_execution_grant",
        description: "Revoke an execution grant. Revocation is permanent for that grant ID.",
        inputSchema: z.object({ id: idSchema }).strict(),
        defaultMode: "confirm",
        readOnly: false,
        handler: async (params) => {
            const { id } = z.object({ id: idSchema }).strict().parse(params);
            const grant = await policy.revokeGrant(id);
            return { content: [{ type: "text", text: stringifyResult({ grant }) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "policy.receipts.list",
        group: ToolGroupId.PolicySafe,
        toolName: "list_egress_receipts",
        description:
            "List recent guarded-operation receipts, including terminal and delivery-ambiguous 0..1 outcomes.",
        inputSchema: z.object({ limit: z.number().int().min(1).max(500).default(100) }).strict(),
        defaultMode: "auto",
        handler: (params) => {
            const { limit } = z
                .object({ limit: z.number().int().min(1).max(500).default(100) })
                .strict()
                .parse(params);
            return {
                content: [
                    {
                        type: "text",
                        text: stringifyResult({ receipts: policy.listReceipts(limit) }),
                    },
                ],
            };
        },
    });
};
