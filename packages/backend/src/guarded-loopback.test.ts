import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { OperationPolicyStore } from "./operation-policy";
import { assertScopeBinding, normalizeScope } from "./scope-binding";

test("loopback fixture reaches only the scope-bound guarded plan", async (t) => {
    let arrivals = 0;
    const server = http.createServer((_request, response) => {
        arrivals += 1;
        response.end("fixture-ok");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
    const address = server.address();
    assert.ok(address !== null && typeof address === "object");

    const directory = await mkdtemp(join(tmpdir(), "caido-loopback-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const policy = new OperationPolicyStore(directory);
    await policy.load();
    const scope = normalizeScope({
        id: "scope:loopback",
        name: "agent-safe-loopback-fixture",
        allowlist: ["127.0.0.1"],
        denylist: [],
    });
    const target = {
        host: "127.0.0.1",
        ports: [address.port],
        tls: false,
        pathPrefix: "/allowed",
    };
    assertScopeBinding(scope, {
        caidoScopeId: scope.id,
        caidoScopeDigest: scope.digest,
        targets: [target],
    });
    await policy.installGrant({
        id: "grant:loopback",
        projectId: "project:loopback",
        authorizationId: "auth:loopback-fixture",
        scopeDigest: "sha256:canonical-fixture",
        caidoScopeId: scope.id,
        caidoScopeDigest: scope.digest,
        targets: [target],
        methods: ["GET"],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        maxRequests: 1,
    });
    const plan = {
        host: "127.0.0.1",
        port: address.port,
        tls: false,
        method: "GET",
        path: "/allowed",
        raw: Buffer.from("GET /allowed HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"),
    };
    policy.validatePlan("grant:loopback", "project:loopback", [plan]);
    const [receipt] = await policy.beginOperation(
        "operation:loopback",
        "grant:loopback",
        "project:loopback",
        [plan],
    );
    assert.ok(receipt);
    await policy.markArmed(receipt.id);
    const response = await fetch(`http://127.0.0.1:${address.port}/allowed`);
    assert.equal(await response.text(), "fixture-ok");
    await policy.markResponse(receipt.id, "fixture-request", true);
    const terminal = await policy.markTerminal(receipt.id);
    assert.equal(terminal.state, "terminal");
    assert.equal(arrivals, 1);

    assert.throws(() =>
        policy.validatePlan("grant:loopback", "project:loopback", [
            { ...plan, host: "127.0.0.2" },
        ]),
    );
    assert.equal(arrivals, 1);
});
