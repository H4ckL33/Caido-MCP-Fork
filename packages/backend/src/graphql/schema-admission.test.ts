import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

type IntrospectionType = {
    name?: string;
    fields?: Array<{ name: string }> | null;
    inputFields?: Array<{ name: string }> | null;
};

test("the captured Caido schema admits every v4 adapter surface", async () => {
    const raw = await readFile(join(process.cwd(), "gql.txt"), "utf8");
    const document = JSON.parse(raw) as {
        data: { __schema: { types: IntrospectionType[] } };
    };
    const types = new Map(document.data.__schema.types.map((type) => [type.name, type]));
    const requireFields = (typeName: string, expected: string[]) => {
        const type = types.get(typeName);
        assert.ok(type, `missing schema type ${typeName}`);
        const actual = new Set(
            [...(type.fields ?? []), ...(type.inputFields ?? [])].map((field) => field.name),
        );
        expected.forEach((field) =>
            assert.ok(actual.has(field), `${typeName}.${field} is unavailable`),
        );
    };

    requireFields("QueryRoot", [
        "projects",
        "workflows",
        "workflow",
        "automateSession",
        "interceptStatus",
        "upstreamProxiesHttp",
        "upstreamProxiesSocks",
    ]);
    requireFields("MutationRoot", [
        "createProject",
        "selectProject",
        "renameProject",
        "deleteProject",
        "createWorkflow",
        "updateWorkflow",
        "toggleWorkflow",
        "deleteWorkflow",
        "runConvertWorkflow",
        "createAutomateSession",
        "pauseIntercept",
        "resumeIntercept",
        "createUpstreamProxyHttp",
        "updateUpstreamProxyHttp",
        "toggleUpstreamProxyHttp",
        "deleteUpstreamProxyHttp",
        "createUpstreamProxySocks",
        "updateUpstreamProxySocks",
        "toggleUpstreamProxySocks",
        "deleteUpstreamProxySocks",
    ]);
    requireFields("CreateWorkflowInput", ["definition", "global"]);
    requireFields("UpdateWorkflowInput", ["definition"]);
    requireFields("CreateAutomateSessionInput", ["requestSource"]);
    requireFields("CreateUpstreamProxyHttpInput", [
        "enabled",
        "connection",
        "auth",
        "allowlist",
        "denylist",
    ]);
    requireFields("CreateUpstreamProxySocksInput", ["includeDns"]);
});
