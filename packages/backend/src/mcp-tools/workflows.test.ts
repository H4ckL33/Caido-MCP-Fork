import assert from "node:assert/strict";
import test from "node:test";

import { findUnsafeWorkflowTerms } from "./workflows";

test("workflow admission detects shell and network capabilities recursively", () => {
    assert.deepEqual(
        findUnsafeWorkflowTerms({
            nodes: [{ type: "ShellCommand" }, { config: { url: "fetch" } }],
        }),
        ["command", "fetch", "shell"],
    );
});

test("workflow admission permits ordinary convert nodes", () => {
    assert.deepEqual(
        findUnsafeWorkflowTerms({ nodes: [{ type: "Base64Decode" }, { type: "JsonParse" }] }),
        [],
    );
});
