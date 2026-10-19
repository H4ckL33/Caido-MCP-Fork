import assert from "node:assert/strict";
import test from "node:test";

import { sha256Hex } from "./sha256";

test("portable SHA-256 matches known UTF-8 vectors", () => {
    assert.equal(
        sha256Hex("abc"),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    assert.equal(
        sha256Hex("ámbito"),
        "c13d347b58f403a05c76d58f597c382fcb2cdb49d8bec0b37865d021f62d94b0",
    );
});
