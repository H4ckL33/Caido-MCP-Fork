import assert from "node:assert/strict";
import test from "node:test";

import { assertScopeBinding, normalizeScope } from "./scope-binding";

const scope = normalizeScope({
    id: "scope:1",
    name: "web-fixture",
    allowlist: ["API.EXAMPLE.TEST.", "*.example.org"],
    denylist: ["blocked.example.org"],
});

test("normalizes and binds the effective Caido scope", () => {
    assert.deepEqual(scope.allowlist, ["*.example.org", "api.example.test"]);
    assert.match(scope.digest, /^sha256:[a-f0-9]{64}$/u);
    assert.doesNotThrow(() =>
        assertScopeBinding(scope, {
            caidoScopeId: "scope:1",
            caidoScopeDigest: scope.digest,
            targets: [{ host: "api.example.test" }, { host: "shop.example.org" }],
        }),
    );
    assert.doesNotThrow(() =>
        assertScopeBinding(scope, {
            caidoScopeId: "scope:1",
            caidoScopeDigest: scope.digest,
            targets: [{ host: "example.org", includeSubdomains: true }],
        }),
    );
});

test("rejects id, digest and allowlist drift before egress", () => {
    assert.throws(() =>
        assertScopeBinding(scope, {
            caidoScopeId: "scope:2",
            caidoScopeDigest: scope.digest,
            targets: [{ host: "api.example.test" }],
        }),
    );
    assert.throws(() =>
        assertScopeBinding(scope, {
            caidoScopeId: "scope:1",
            caidoScopeDigest: `sha256:${"0".repeat(64)}`,
            targets: [{ host: "api.example.test" }],
        }),
    );
    assert.throws(() =>
        assertScopeBinding(scope, {
            caidoScopeId: "scope:1",
            caidoScopeDigest: scope.digest,
            targets: [{ host: "outside.example.test" }],
        }),
    );
    assert.throws(() =>
        assertScopeBinding(scope, {
            caidoScopeId: "scope:1",
            caidoScopeDigest: scope.digest,
            targets: [{ host: "api.example.test", includeSubdomains: true }],
        }),
    );
});
