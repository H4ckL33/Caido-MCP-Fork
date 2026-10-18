import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
