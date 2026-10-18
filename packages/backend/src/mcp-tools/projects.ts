import { z } from "zod";

import {
    CREATE_PROJECT_MUTATION,
    DELETE_PROJECT_MUTATION,
    LIST_PROJECTS_QUERY,
    RENAME_PROJECT_MUTATION,
    SELECT_PROJECT_MUTATION,
} from "../graphql";
import { ToolGroupId } from "../tool-permissions";

import { registerToolAction, type ToolContext } from "./register";
import { stringifyResult, toNumericId } from "./shared";

export const registerProjectTools = ({ server, sdk, store, permissions }: ToolContext) => {
    const projectIdSchema = z.preprocess(
        (value) => (typeof value === "number" ? String(value) : value),
        z.string().min(1),
    );
    const projectInfoSchema = z
        .object({
            field: z.enum(["id", "name", "path", "version", "status", "full"]).default("full"),
        })
        .strict();

    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.projects.getInfo",
        group: ToolGroupId.ProjectSafe,
        toolName: "get_project_info",
        description:
            "Get a field from the current project. " +
            'If field is omitted, it defaults to "full". ' +
            'Use field="full" to return all fields. ' +
            "If no project is selected, returns (no project selected).",
        inputSchema: projectInfoSchema,
        handler: async (params) => {
            const { field } = projectInfoSchema.parse(params);
            const project = await sdk.projects.getCurrent();
            if (project === undefined) {
                return {
                    content: [{ type: "text", text: "(no project selected)" }],
                };
            }
            const info = {
                id: toNumericId(String(project.getId())),
                name: project.getName(),
                path: project.getPath(),
                version: project.getVersion(),
                status: project.getStatus(),
            };
            if (field === "full") {
                return {
                    content: [{ type: "text", text: stringifyResult(info) }],
                };
            }
            const value = info[field];
            return { content: [{ type: "text", text: String(value) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.projects.list",
        group: ToolGroupId.ProjectSafe,
        toolName: "list_projects",
        description: "List Caido projects and their lifecycle state.",
        inputSchema: z.object({}).strict(),
        defaultMode: "auto",
        handler: async () => {
            const response = await sdk.graphql.execute(LIST_PROJECTS_QUERY);
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.projects.create",
        group: ToolGroupId.ProjectUnsafe,
        toolName: "create_project",
        description: "Create a Caido project. This does not select it automatically.",
        inputSchema: z
            .object({ name: z.string().min(1).max(200), temporary: z.boolean().default(false) })
            .strict(),
        defaultMode: "confirm",
        readOnly: false,
        handler: async (params) => {
            const input = z
                .object({ name: z.string().min(1).max(200), temporary: z.boolean().default(false) })
                .strict()
                .parse(params);
            const response = await sdk.graphql.execute(CREATE_PROJECT_MUTATION, { input });
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.projects.rename",
        group: ToolGroupId.ProjectUnsafe,
        toolName: "rename_project",
        description: "Rename a Caido project.",
        inputSchema: z.object({ id: projectIdSchema, name: z.string().min(1).max(200) }).strict(),
        defaultMode: "confirm",
        readOnly: false,
        handler: async (params) => {
            const input = z
                .object({ id: projectIdSchema, name: z.string().min(1).max(200) })
                .strict()
                .parse(params);
            const response = await sdk.graphql.execute(RENAME_PROJECT_MUTATION, input);
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.projects.select",
        group: ToolGroupId.ProjectUnsafe,
        toolName: "select_project",
        description:
            "Select a Caido project. The plugin can reload during selection, so the caller must verify the selected project and must not retry an ambiguous response automatically.",
        inputSchema: z.object({ id: projectIdSchema }).strict(),
        defaultMode: "confirm",
        readOnly: false,
        handler: async (params) => {
            const input = z.object({ id: projectIdSchema }).strict().parse(params);
            const response = await sdk.graphql.execute(SELECT_PROJECT_MUTATION, input);
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });

    registerToolAction(server, sdk, store, permissions, {
        action: "sdk.projects.delete",
        group: ToolGroupId.ProjectUnsafe,
        toolName: "delete_project",
        description: "Delete a Caido project permanently.",
        inputSchema: z.object({ id: projectIdSchema }).strict(),
        defaultMode: "disabled",
        readOnly: false,
        annotations: { destructiveHint: true, idempotentHint: false },
        handler: async (params) => {
            const input = z.object({ id: projectIdSchema }).strict().parse(params);
            const response = await sdk.graphql.execute(DELETE_PROJECT_MUTATION, input);
            return { content: [{ type: "text", text: stringifyResult(response) }] };
        },
    });
};
