import assert from "node:assert/strict";
import test from "node:test";

import { formatDetails } from "./shared";

test("confirmation details redact nested secrets", () => {
    const details = formatDetails({
        action: "test",
        params: {
            username: "operator",
            password: "do-not-display",
            nested: { authorization: "Bearer do-not-display", api_token: "do-not-display" },
        },
    });

    assert.match(details, /operator/u);
    assert.doesNotMatch(details, /do-not-display/u);
    assert.match(details, /\[REDACTED\]/u);
});
