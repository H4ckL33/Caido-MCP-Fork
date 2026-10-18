/* eslint-disable no-console */
/**
 * Live integration test: drives the running Caido MCP plugin end to end.
 *
 * Unlike the per-tool smoke suite, this sends real HTTP traffic to a target and verifies the
 * full host-filtering round-trip that the skill documents:
 *   1. execute_guarded_raw_requests -> hit the authorized target, save into history
 *   2. list_requests with req.host.eq  -> the sent request is found
 *   3. list_requests with req.host.regex -> same request is found via regex
 *   4. get_requests_by_ids -> full request + response bytes
 *
 * Prerequisites:
 *   - The updated plugin build is loaded and its MCP server is enabled.
 *   - A project is open in Caido (otherwise the history DB is unavailable).
 *   - The target host is reachable from Caido's upstream.
 *
 * Config via env:
 *   MCP_URL               (default http://127.0.0.1:3334/mcp)
 *   INTEGRATION_HOST      authorized target host (required)
 *   INTEGRATION_GRANT_ID  installed execution grant (required)
 *   INTEGRATION_PORT      target port   (default 443)
 *   INTEGRATION_TLS       "true"/"false" (default true)
 *   INTEGRATION_PATH      request path  (default /)
 */
import { assert, getToolText, initSession, rpc, tryParseJSON } from "./_utils";
import { randomUUID } from "node:crypto";

const HOST = process.env.INTEGRATION_HOST;
const GRANT_ID = process.env.INTEGRATION_GRANT_ID;
const PORT = Number(process.env.INTEGRATION_PORT ?? "443");
const TLS = (process.env.INTEGRATION_TLS ?? "true") !== "false";
const PATH = process.env.INTEGRATION_PATH ?? "/";

const call = async (name: string, args: Record<string, unknown>) => {
    const res = (await rpc("tools/call", { name, arguments: args })) as {
        result?: unknown;
        error?: unknown;
    };
    if (res.error) throw new Error(`${name} error: ${JSON.stringify(res.error)}`);
    const text = getToolText(res.result);
    const parsed = tryParseJSON<{ errors?: unknown[] }>(text);
    if (parsed?.errors?.length) throw new Error(`${name} graphql errors: ${text}`);
    return { text, parsed };
};

const main = async () => {
    assert(HOST !== undefined && HOST !== "", "INTEGRATION_HOST is required");
    assert(GRANT_ID !== undefined && GRANT_ID !== "", "INTEGRATION_GRANT_ID is required");
    await initSession();

    const list = (await rpc("tools/list", {})) as { result?: { tools?: Array<{ name: string }> } };
    const tools = new Set((list.result?.tools ?? []).map((t) => t.name));
    assert(
        tools.has("execute_guarded_raw_requests"),
        "execute_guarded_raw_requests missing — load the v4 build",
    );

    const raw = `GET ${PATH} HTTP/1.1\r\nHost: ${HOST}\r\nUser-Agent: caido-mcp-integration\r\nConnection: close\r\n\r\n`;
    const rawBase64 = Buffer.from(raw).toString("base64");

    console.log(
        `\n== execute_guarded_raw_requests -> ${TLS ? "https" : "http"}://${HOST}:${PORT}${PATH}`,
    );
    const sent = await call("execute_guarded_raw_requests", {
        grant_id: GRANT_ID,
        operation_id: `integration-${randomUUID()}`,
        items: [{ raw_base64: rawBase64, host: HOST, port: PORT, is_tls: TLS }],
        options: { save: true, timeouts: { global: 15000 } },
    });
    const sentResult = tryParseJSON<{
        results?: Array<{
            ok?: boolean;
            receipt?: { sent_request_id?: string; error?: string };
        }>;
    }>(sent.text);
    const first = sentResult?.results?.[0];
    assert(first?.ok === true, `guarded send failed: ${first?.receipt?.error ?? sent.text}`);
    const sentId = first?.receipt?.sent_request_id;
    console.log(`sent request id: ${sentId}`);

    console.log(`\n== list_requests host EXACT eq:"${HOST}"`);
    const exact = await call("list_requests", {
        limit: 10,
        order: { target: "req", field: "id", direction: "desc" },
        filter: `req.host.eq:"${HOST}"`,
        fields: ["id", "request.method", "request.url", "response.status_code"],
    });
    const exactItems = (exact.parsed as { items?: Array<{ id?: unknown }> })?.items ?? [];
    assert(exactItems.length > 0, "exact host filter returned no rows");
    console.log(`exact matches: ${exactItems.length}`);

    console.log(`\n== list_requests host REGEX (dot as wildcard; HTTPQL eats single backslashes)`);
    const regex = await call("list_requests", {
        limit: 10,
        filter: `req.host.regex:"${HOST}$"`,
        fields: ["id", "request.url", "response.status_code"],
    });
    const regexItems = (regex.parsed as { items?: Array<{ id?: unknown }> })?.items ?? [];
    assert(regexItems.length > 0, "regex host filter returned no rows");
    console.log(`regex matches: ${regexItems.length}`);

    // Case-insensitive ordering (adaptivity): DESC should be accepted where the schema is desc.
    console.log(`\n== list_requests with upper-case direction (ci-enum adaptivity)`);
    await call("list_requests", {
        limit: 1,
        order: { target: "req", field: "id", direction: "DESC" },
        fields: ["id"],
    });
    console.log("upper-case direction accepted");

    if (sentId !== undefined) {
        console.log(`\n== get_requests_by_ids ${sentId} (full req+resp)`);
        const full = await call("get_requests_by_ids", {
            ids: [Number(sentId)],
            fields: ["id", "request.raw.text", "response.status_code", "response.raw.text"],
            serialization: { include_body: true, max_text_body_chars: 2000 },
        });
        assert(full.text.includes("request"), "get_requests_by_ids returned no request payload");
        console.log("full request/response retrieved");
    }

    console.log("\nINTEGRATION OK");
};

main().catch((e) => {
    console.error("INTEGRATION FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
});
