import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { OperationPolicyStore } from "./operation-policy";

const request = (
    overrides: Partial<Parameters<OperationPolicyStore["validatePlan"]>[2][number]> = {},
) => ({
    host: "api.example.test",
    port: 443,
    tls: true,
    method: "GET",
    path: "/v1/profile",
    raw: Buffer.from("GET /v1/profile HTTP/1.1\r\nHost: api.example.test\r\n\r\n"),
    ...overrides,
});

const createStore = async () => {
    const store = new OperationPolicyStore(await mkdtemp(join(tmpdir(), "caido-policy-")));
    await store.load();
    await store.installGrant({
        id: "grant:test",
        projectId: "project:1",
        authorizationId: "auth-1",
        scopeDigest: "sha256:test",
        caidoScopeId: "scope:1",
        caidoScopeDigest: `sha256:${"a".repeat(64)}`,
        targets: [
            {
                host: "example.test",
                includeSubdomains: true,
                ports: [443],
                tls: true,
                pathPrefix: "/v1",
            },
        ],
        methods: ["GET"],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        maxRequests: 2,
    });
    return store;
};

test("grant validates target method path and outbound content", async () => {
    const store = await createStore();
    assert.doesNotThrow(() => store.validatePlan("grant:test", "project:1", [request()]));
    assert.throws(() =>
        store.validatePlan("grant:test", "project:1", [request({ method: "POST" })]),
    );
    assert.throws(() =>
        store.validatePlan("grant:test", "project:1", [request({ path: "/admin" })]),
    );
    assert.throws(() =>
        store.validatePlan("grant:test", "project:1", [
            request({ raw: Buffer.from("GET /codex HTTP/1.1\r\nHost: api.example.test\r\n\r\n") }),
        ]),
    );
});

test("operation ids are single-use and quota is reserved before egress", async () => {
    const store = await createStore();
    const receipts = await store.beginOperation("operation:1", "grant:test", "project:1", [
        request(),
    ]);
    assert.equal(receipts[0]?.state, "not-armed");
    await assert.rejects(
        store.beginOperation("operation:1", "grant:test", "project:1", [request()]),
    );
    await store.beginOperation("operation:2", "grant:test", "project:1", [request()]);
    await assert.rejects(
        store.beginOperation("operation:3", "grant:test", "project:1", [request()]),
    );
});

test("armed failures stay delivery-ambiguous and are not reusable", async () => {
    const store = await createStore();
    const [receipt] = await store.beginOperation("operation:ambiguous", "grant:test", "project:1", [
        request(),
    ]);
    assert.ok(receipt);
    await store.markArmed(receipt.id);
    const failed = await store.markFailure(receipt.id, new Error("transport stopped"));
    assert.equal(failed.delivery, "ambiguous-0..1");
    assert.equal(failed.state, "terminal");
});
