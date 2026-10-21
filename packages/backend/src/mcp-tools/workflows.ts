import { z } from "zod";

import {
    CREATE_WORKFLOW_MUTATION,
    DELETE_WORKFLOW_MUTATION,
    GET_WORKFLOW_QUERY,
    LIST_WORKFLOWS_QUERY,
    RUN_CONVERT_WORKFLOW_MUTATION,
    TOGGLE_WORKFLOW_MUTATION,
    UPDATE_WORKFLOW_MUTATION,
} from "../graphql";
import { ToolGroupId } from "../tool-permissions";

import { registerToolAction, type ToolContext } from "./register";
import { stringifyResult } from "./shared";

const idSchema = z.preprocess(
    (value) => (typeof value === "number" ? String(value) : value),
    z.string().min(1),
);
const definitionSchema = z.record(z.string(), z.unknown());

const UNSAFE_WORKFLOW_TERMS = new Set([
    "shell",
    "command",
    "process",
    "spawn",
    "exec",
    "network",
    "request",
    "fetch",
    "socket",
]);

export const findUnsafeWorkflowTerms = (definition: unknown) => {
    const found = new Set<string>();
    const visit = (value: unknown) => {
        if (typeof value === "string") {
            const normalized = value.toLowerCase();
            for (const term of UNSAFE_WORKFLOW_TERMS) {
                if (normalized.includes(term)) found.add(term);
            }
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (value !== null && typeof value === "object") {
            for (const [key, child] of Object.entries(value)) {
                visit(key);
                visit(child);
            }
        }
    };
    visit(definition);
    return [...found].sort();
};

const assertWorkflowDefinitionAdmitted = (definition: unknown) => {
    const unsafe = findUnsafeWorkflowTerms(definition);
    if (unsafe.length > 0) {
        throw new Error(
            `Workflow definition contains non-admitted capabilities: ${unsafe.join(", ")}`,
        );
    }
};

type WorkflowResponse = {
    workflow?: { kind?: string; definition?: unknown } | null;
};

export const registerWorkflowTools = ({ server, sdk, store, permissions }: ToolContext) => {
    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.workflows.list",
        group: ToolGroupId.WorkflowSafe,
        toolName: "list_workflows",
        description: "List Caido workflows, including kind, enabled state, and definition.",
        inputSchema: z.object({}).strict(),
        defaultMode: "auto",
        handler: async () => {
            const response = await sdk.graphql.execute(LIST_WORKFLOWS_QUERY);
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.workflows.get",
        group: ToolGroupId.WorkflowSafe,
        toolName: "get_workflow",
        description: "Get one Caido workflow by ID.",
        inputSchema: z.object({ id: idSchema }).strict(),
        defaultMode: "auto",
        handler: async (params) => {
            const input = z.object({ id: idSchema }).strict().parse(params);
            const response = await sdk.graphql.execute(GET_WORKFLOW_QUERY, input);
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.workflows.create",
        group: ToolGroupId.WorkflowUnsafe,
        toolName: "create_workflow",
        description:
            "Create a reviewed workflow definition. Definitions containing shell, process, network, request, fetch, or socket capabilities are rejected.",
        inputSchema: z
            .object({ definition: definitionSchema, global: z.boolean().default(false) })
            .strict(),
        defaultMode: "auto",
        readOnly: false,
        safetyCheck: (params) => {
            const input = z
                .object({ definition: definitionSchema, global: z.boolean().default(false) })
                .strict()
                .parse(params);
            assertWorkflowDefinitionAdmitted(input.definition);
        },
        handler: async (params) => {
            const input = z
                .object({ definition: definitionSchema, global: z.boolean().default(false) })
                .strict()
                .parse(params);
            const response = await sdk.graphql.execute(CREATE_WORKFLOW_MUTATION, { input });
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.workflows.update",
        group: ToolGroupId.WorkflowUnsafe,
        toolName: "update_workflow",
        description: "Update a workflow with a reviewed, non-networked definition.",
        inputSchema: z.object({ id: idSchema, definition: definitionSchema }).strict(),
        defaultMode: "auto",
        readOnly: false,
        safetyCheck: (params) => {
            const input = z
                .object({ id: idSchema, definition: definitionSchema })
                .strict()
                .parse(params);
            assertWorkflowDefinitionAdmitted(input.definition);
        },
        handler: async (params) => {
            const input = z
                .object({ id: idSchema, definition: definitionSchema })
                .strict()
                .parse(params);
            const response = await sdk.graphql.execute(UPDATE_WORKFLOW_MUTATION, {
                id: input.id,
                input: { definition: input.definition },
            });
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.workflows.toggle",
        group: ToolGroupId.WorkflowUnsafe,
        toolName: "toggle_workflow",
        description:
            "Enable or disable a workflow. Enabling can affect future proxy traffic and always requires confirmation by default.",
        inputSchema: z.object({ id: idSchema, enabled: z.boolean() }).strict(),
        defaultMode: "disabled",
        readOnly: false,
        handler: async (params) => {
            const input = z.object({ id: idSchema, enabled: z.boolean() }).strict().parse(params);
            const response = await sdk.graphql.execute(TOGGLE_WORKFLOW_MUTATION, input);
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.workflows.runConvert",
        group: ToolGroupId.WorkflowUnsafe,
        toolName: "run_convert_workflow",
        description:
            "Run a convert workflow on local base64 input. Only definitions without shell, process, or network capabilities are admitted.",
        inputSchema: z.object({ id: idSchema, input_base64: z.string() }).strict(),
        defaultMode: "auto",
        readOnly: false,
        safetyCheck: async (params) => {
            const { id } = z
                .object({ id: idSchema, input_base64: z.string() })
                .strict()
                .parse(params);
            const response = await sdk.graphql.execute<WorkflowResponse>(GET_WORKFLOW_QUERY, {
                id,
            });
            const workflow = response.data?.workflow;
            if (workflow === undefined || workflow === null) throw new Error("Workflow not found");
            if (workflow.kind !== "CONVERT") throw new Error("Only CONVERT workflows are admitted");
            assertWorkflowDefinitionAdmitted(workflow.definition);
        },
        handler: async (params) => {
            const input = z
                .object({ id: idSchema, input_base64: z.string() })
                .strict()
                .parse(params);
            const response = await sdk.graphql.execute(RUN_CONVERT_WORKFLOW_MUTATION, {
                id: input.id,
                input: input.input_base64,
            });
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.workflows.delete",
        group: ToolGroupId.WorkflowUnsafe,
        toolName: "delete_workflow",
        description: "Delete a workflow permanently.",
        inputSchema: z.object({ id: idSchema }).strict(),
        defaultMode: "disabled",
        readOnly: false,
        annotations: { destructiveHint: true, idempotentHint: false },
        handler: async (params) => {
            const input = z.object({ id: idSchema }).strict().parse(params);
            const response = await sdk.graphql.execute(DELETE_WORKFLOW_MUTATION, input);
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });
};
