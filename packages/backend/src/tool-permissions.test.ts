import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ToolGroupId, ToolPermissionsStore } from "./tool-permissions";
import type { MCPSDK } from "./types/sdk";

const makeStore = async () => {
    const directory = await mkdtemp(join(tmpdir(), "caido-permissions-"));
    const sdk = {
        meta: { path: () => directory },
        console: { error: () => undefined },
    } as unknown as MCPSDK;
    const store = new ToolPermissionsStore(sdk);
    await store.load();
    return { directory, store };
};

test("tool defaults and explicit overrides are independent", async (t) => {
    const { directory, store } = await makeStore();
    t.after(() => rm(directory, { recursive: true, force: true }));
    store.registerTool("request.legacy", ToolGroupId.RequestUnsafe, "legacy", "disabled");
    store.registerTool("request.guarded", ToolGroupId.RequestUnsafe, "guarded", "guarded-auto");

    assert.equal(store.getModeForAction("request.legacy"), "disabled");
    assert.equal(store.getModeForAction("request.guarded"), "guarded-auto");

    await store.setToolMode("request.legacy", "confirm");
    assert.equal(store.getModeForAction("request.legacy"), "confirm");
    assert.equal(store.getModeForAction("request.guarded"), "guarded-auto");
});

test("changing a group deliberately propagates to its tools", async (t) => {
    const { directory, store } = await makeStore();
    t.after(() => rm(directory, { recursive: true, force: true }));
    store.registerTool("request.legacy", ToolGroupId.RequestUnsafe, "legacy", "disabled");
    store.registerTool("request.guarded", ToolGroupId.RequestUnsafe, "guarded", "guarded-auto");

    await store.setGroupMode(ToolGroupId.RequestUnsafe, "confirm");
    assert.equal(store.getModeForAction("request.legacy"), "confirm");
    assert.equal(store.getModeForAction("request.guarded"), "confirm");
});

test("history-only request and websocket groups default to auto", async (t) => {
    const { directory, store } = await makeStore();
    t.after(() => rm(directory, { recursive: true, force: true }));
    store.registerTool("request.read", ToolGroupId.RequestSafe, "request read");
    store.registerTool("websocket.read", ToolGroupId.WsSafe, "websocket read");

    assert.equal(store.getModeForAction("request.read"), "auto");
    assert.equal(store.getModeForAction("websocket.read"), "auto");
});

test("proxy-observer profile has no confirmation defaults and disables active egress", async (t) => {
    const { directory, store } = await makeStore();
    t.after(() => rm(directory, { recursive: true, force: true }));
    store.registerTool("project.select", ToolGroupId.ProjectUnsafe, "select project");
    store.registerTool("scope.update", ToolGroupId.ScopeUnsafe, "update scope");
    store.registerTool("request.send", ToolGroupId.RequestUnsafe, "send request");
    store.registerTool("policy.install", ToolGroupId.PolicyUnsafe, "install grant");

    const permissions = store.getPermissions();
    assert.equal(Object.values(permissions.states).includes("confirm"), false);
    assert.equal(store.getModeForAction("project.select"), "auto");
    assert.equal(store.getModeForAction("scope.update"), "auto");
    assert.equal(store.getModeForAction("request.send"), "disabled");
    assert.equal(store.getModeForAction("policy.install"), "disabled");
});

test("profile v2 removes persisted confirmation blockers", async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "caido-permissions-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(
        join(directory, "tool-permissions.json"),
        JSON.stringify({
            permissionProfileVersion: 1,
            groups: [],
            states: {
                [ToolGroupId.ProjectUnsafe]: "confirm",
                [ToolGroupId.RequestUnsafe]: "guarded-auto",
            },
            toolStates: { "project.select": "confirm", "request.send": "guarded-auto" },
        }),
    );
    const sdk = {
        meta: { path: () => directory },
        console: { error: () => undefined },
    } as unknown as MCPSDK;
    const store = new ToolPermissionsStore(sdk);
    await store.load();
    store.registerTool("project.select", ToolGroupId.ProjectUnsafe, "select project");
    store.registerTool("request.send", ToolGroupId.RequestUnsafe, "send request");

    assert.equal(store.getModeForAction("project.select"), "auto");
    assert.equal(store.getModeForAction("request.send"), "disabled");
});
