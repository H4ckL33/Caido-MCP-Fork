import assert from "node:assert/strict";
import test from "node:test";

import { ConfirmActionStore } from "./confirm-actions";

test("a confirmed action executes exactly once", async () => {
    const store = new ConfirmActionStore(100);
    let executions = 0;
    const pending = store.createPendingAction("example.action", { id: 1 }, async () => {
        executions += 1;
        return "done";
    });

    const resolved = await store.resolveToolActionConfirmation(pending.id, true);
    const result = await pending.promise;

    assert.equal(executions, 1);
    assert.equal(resolved?.confirmed, true);
    assert.equal(result.result, "done");
    assert.equal(await store.resolveToolActionConfirmation(pending.id, true), null);
    assert.equal(executions, 1);
});

test("an unanswered action expires and cannot execute later", async () => {
    const store = new ConfirmActionStore(10);
    let executions = 0;
    const pending = store.createPendingAction("example.action", {}, async () => {
        executions += 1;
    });

    const result = await pending.promise;

    assert.equal(result.confirmed, false);
    assert.equal(result.reason, "expired");
    assert.equal(await store.resolveToolActionConfirmation(pending.id, true), null);
    assert.equal(executions, 0);
});

test("stopping the runtime can cancel all pending actions", async () => {
    const store = new ConfirmActionStore(1_000);
    const first = store.createPendingAction("first", {}, async () => undefined);
    const second = store.createPendingAction("second", {}, async () => undefined);

    store.cancelPendingActions();

    const [firstResult, secondResult] = await Promise.all([first.promise, second.promise]);
    assert.equal(firstResult.reason, "cancelled");
    assert.equal(secondResult.reason, "cancelled");
    assert.equal(await store.resolveToolActionConfirmation(first.id, true), null);
});
