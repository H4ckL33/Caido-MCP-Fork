import assert from "node:assert/strict";
import test from "node:test";

import { assertOutboundHttp, assertOutboundText, OutboundPolicyError } from "./outbound-policy";

const blocked = (fn: () => void) => assert.throws(fn, OutboundPolicyError);

test("outbound policy blocks literal and encoded variants", () => {
    blocked(() => assertOutboundText("CoDeX"));
    blocked(() => assertOutboundText("%63%6f%64%65%78"));
    blocked(() => assertOutboundText("\\u0063\\u006f\\u0064\\u0065\\u0078"));
    blocked(() => assertOutboundText("Y29kZXg="));
});

test("outbound policy covers URL headers cookies and body", () => {
    blocked(() =>
        assertOutboundHttp(
            Buffer.from(
                "POST /safe HTTP/1.1\r\nHost: example.test\r\nCookie: marker=codex\r\n\r\nok",
            ),
        ),
    );
    blocked(() =>
        assertOutboundHttp(
            Buffer.from('POST /safe HTTP/1.1\r\nHost: example.test\r\n\r\n{"v":"Y29kZXg="}'),
        ),
    );
});

test("outbound policy blocks compressed or uninspectable bodies", () => {
    blocked(() =>
        assertOutboundHttp(
            Buffer.from(
                "POST /safe HTTP/1.1\r\nHost: example.test\r\nContent-Encoding: gzip\r\n\r\ndata",
            ),
        ),
    );
    blocked(() =>
        assertOutboundHttp(
            Buffer.concat([
                Buffer.from("POST /safe HTTP/1.1\r\nHost: example.test\r\n\r\n"),
                Buffer.from([0xff, 0xfe]),
            ]),
        ),
    );
});

test("outbound policy permits ordinary inspectable content", () => {
    assert.doesNotThrow(() =>
        assertOutboundHttp(
            Buffer.from(
                "GET /health HTTP/1.1\r\nHost: example.test\r\nUser-Agent: audit-agent\r\n\r\n",
            ),
        ),
    );
});
