import { z } from "zod";

import { CREATE_AUTOMATE_SESSION_MUTATION, GET_AUTOMATE_SESSION_QUERY } from "../graphql";
import { ToolGroupId } from "../tool-permissions";

import { registerToolAction, type ToolContext } from "./register";
import { stringifyResult, toId } from "./shared";

const idSchema = z.preprocess(
    (value) => (typeof value === "number" ? String(value) : value),
    z.string().min(1),
);

type AutomateResponse = {
    automateSession?: {
        settings?: {
            concurrency?: { workers?: number };
            retryOnFailure?: { maximumRetries?: number };
            redirect?: { max?: number };
            payloads?: Array<{ options?: { __typename?: string }; preprocessors?: unknown[] }>;
        };
    } | null;
};

const assessSession = (response: { data?: AutomateResponse }) => {
    const session = response.data?.automateSession;
    if (session === undefined || session === null)
        return { admitted: false, reasons: ["not-found"] };
    const settings = session.settings;
    const reasons: string[] = [];
    if ((settings?.concurrency?.workers ?? 0) !== 1) reasons.push("workers-must-equal-one");
    if ((settings?.retryOnFailure?.maximumRetries ?? 0) !== 0)
        reasons.push("retries-must-equal-zero");
    if ((settings?.redirect?.max ?? 0) !== 0) reasons.push("redirects-must-equal-zero");
    for (const payload of settings?.payloads ?? []) {
        if (payload.options?.__typename === "AutomateHostedFilePayload") {
            reasons.push("hosted-file-cardinality-is-not-provable");
        }
        if ((payload.preprocessors?.length ?? 0) > 0) {
            reasons.push("payload-preprocessors-require-materialization");
        }
    }
    reasons.push("per-request-materialization-and-last-point-egress-hook-unavailable");
    return { admitted: false, reasons: [...new Set(reasons)] };
};

export const registerAutomateTools = ({ server, sdk, store, permissions }: ToolContext) => {
    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.automate.get",
        group: ToolGroupId.AutomateSafe,
        toolName: "get_automate_session",
        description: "Get an Automate session and its execution settings by ID.",
        inputSchema: z.object({ id: idSchema }).strict(),
        defaultMode: "auto",
        handler: async (params) => {
            const input = z.object({ id: idSchema }).strict().parse(params);
            const response = await sdk.graphql.execute(GET_AUTOMATE_SESSION_QUERY, input);
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.automate.create",
        group: ToolGroupId.AutomateUnsafe,
        toolName: "create_automate_session",
        description:
            "Create an Automate session from a saved request for operator configuration. This tool does not start traffic.",
        inputSchema: z.object({ request_id: idSchema }).strict(),
        defaultMode: "confirm",
        readOnly: false,
        handler: async (params) => {
            const { request_id } = z.object({ request_id: idSchema }).strict().parse(params);
            const pair = await sdk.requests.get(toId(request_id));
            if (pair?.request === undefined) throw new Error(`Request not found: ${request_id}`);
            const response = await sdk.graphql.execute(CREATE_AUTOMATE_SESSION_MUTATION, {
                input: { requestSource: { id: request_id } },
            });
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.automate.assess",
        group: ToolGroupId.AutomateSafe,
        toolName: "assess_automate_session",
        description:
            "Assess whether an Automate session can be admitted for autonomous execution. Start remains unavailable until every generated request can be materialized and checked immediately before egress.",
        inputSchema: z.object({ id: idSchema }).strict(),
        defaultMode: "auto",
        handler: async (params) => {
            const input = z.object({ id: idSchema }).strict().parse(params);
            const response = await sdk.graphql.execute<AutomateResponse>(
                GET_AUTOMATE_SESSION_QUERY,
                input,
            );
            return {
                content: [
                    {
                        type: "text",
                        text: stringifyResult({
                            id: input.id,
                            assessment: assessSession(response),
                        }),
                    },
                ],
            };
        },
    });
};
