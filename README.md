# Agent Safe Caido MCP

A hardened local fork of [Vibe Hacking](https://github.com/vvvvvvvvvvel/VibeHacking) for controlled web-audit automation. Version 4 adds grant-bound HTTP execution, delivery receipts, per-tool permissions, and reviewed Caido lifecycle adapters.

## Highlights

- **MCP‑native**: exposes an MCP server over Streamable HTTP inside Caido.
- **Tool governance**: control every tool independently with `auto`, `guarded-auto`, `confirm`, or `disabled`, while retaining group and bulk controls.
- **Clear UX**: user‑friendly tool names in the UI (no SDK internals).
- **History-first output**: request and WebSocket tools use stable list/get envelopes, Caido-native filters, field projection, and bounded body serialization.
- **Fail-closed defaults**: unknown, traffic-producing, environment, and tamper operations start disabled.
- **Bounded confirmation**: unanswered confirmations expire after 15 seconds and cannot be executed later.
- **Credential summaries**: cookie and authentication-header values are redacted instead of previewed.
- **Execution grants**: active MCP HTTP sends bind the selected project, authorization reference, effective Caido scope ID and digest, targets, methods, expiry, and request budget. The live scope binding is revalidated before each guarded send.
- **Delivery receipts**: operation IDs are single-use and post-egress failures remain explicit `ambiguous-0..1` outcomes without automatic retry.
- **Declared boundaries**: proxy-wide HTTP, active WebSocket, Automate start, and active workflow runs are reported unsupported until they can be inspected at the final send point.
- **Side-by-side testing**: the fork uses its own plugin ID and port `3334`, so it can be validated before replacing the upstream plugin.

![Overview](./assets/screenshot-overview.png)

## Install

1. Build the plugin in this repo.
2. Load it in Caido as a local plugin.

> If you already have a dev flow, just build and load as usual.

## Compatibility

- **Caido**: tested with v0.58.3; GraphQL adapters must be re-admitted when the runtime schema changes.

## Usage

- Open the plugin page in Caido.
- Use the **Tools** section to set group defaults or individual tools to `auto`, `guarded-auto`, `confirm`, or `disabled`.
- Call tools from your agent and rely on consistent JSON outputs.

The labels inherited from upstream describe feature families, not a security boundary. Review every tool listed in a group before changing it to `auto`.

## API Control

The plugin exposes a localhost-only control endpoint at `http://127.0.0.1:<port>/control`.
When MCP also listens on a local host, both endpoints share one server. When MCP listens on
another interface, control stays local on the same port.

```bash
curl -sS -X POST "$CONTROL_URL" \
  -H "content-type: application/json" \
  -d '{"method":"getMcpServerSettings"}'
```

Control requests are accepted only when the TCP peer is loopback, for example `127.0.0.1`
or `::1`. If MCP is bound to `0.0.0.0`, the control route is still served by that listener,
but non-loopback peers receive `403`.

The loopback control endpoint is intentionally read-only. Supported methods are
`getMcpServerSettings` and `getToolGroupPermissionModes`. Configuration and permission changes
must be made in the Caido plugin interface.

## Tooling Notes

- Some tools accept arrays even when the name is singular — this is intentional to support batch operations while keeping UI labels simple.
- Discovery tools are not scope-limited by default: `list_requests` returns all traffic (annotating `in_scope`), and Sitemap/WebSocket lists only filter by scope when an explicit `scope_id` is passed. Since Caido scopes are often broad (e.g. `.+`), narrow by host with HTTPQL (`req.host.eq` / `req.host.regex`) instead.
- Broad history discovery should start with `list_requests` / `list_websocket_messages` and tight `fields`; exact follow-up should use `get_requests_by_ids` / `get_websocket_messages_by_ids`.
- `list_requests` uses native Caido cursor pagination; feed `page_info.end_cursor`/`start_cursor` back as `cursor`.
- `list_requests.filter` is a raw HTTPQL string for method, host, status, port, time, path, raw, and row constraints.
- HTTP body output uses `{ encoding, size, text|base64, omitted_reason }`. Raw request/response bytes are returned only when requested through `fields`.
- `list_requests.serialization.include_body=false` by default for broad discovery; set it to `true` or request body/raw paths explicitly through `fields`.
- Sitemap tools expose Caido's deduplicated Sitemap tree; use `list_sitemap_roots` / `list_sitemap_descendants` for tree discovery and `list_sitemap_entry_requests` for cursor-paginated requests attached to one entry.
- Sitemap entry lists use offset pagination and return `has_more` / `next_offset`; they do not expose unusable GraphQL cursors.
- Sitemap entry lists use `request_limit=0` by default, which returns request counts without samples; set `request_limit>0` when projecting `requests.items.*`.
- Nested Sitemap `requests` include only `count` and optional sampled `items`; use `list_sitemap_entry_requests` for request pagination cursors.
- `list_sitemap_entry_requests` returns concrete HTTP history-shaped items and supports the same `serialization`, `regex_excerpt`, `fields`, and `exclude_fields` controls as `list_requests`.
- `fields` and `exclude_fields` project item payloads while preserving envelopes such as `page_info`, `items`, `requested`, `found`, and `results`.

### Kali WSL proxy bridge

Caido and the MCP remain bound to Windows loopback. When Kali runs under WSL2
with NAT networking, an elevated PowerShell session can expose only the Caido
proxy port to the private WSL adapter:

```powershell
./scripts/ensure-wsl-caido-bridge.ps1 -Action Ensure
```

The script owns and replaces only its named firewall rules and its port-proxy
entry for port `8080`. It validates that the gateway belongs to a WSL adapter,
does not expose the MCP port, and removes its changes if the connectivity check
fails. Inspect or remove it with `-Action Status` or `-Action Remove`.

Copy `scripts/caido-proxy-url` to `~/.local/bin` in Kali. Tools can then opt in
per invocation, for example with `--proxy "$(caido-proxy-url)"`. Do not export a
global proxy: every audit still requires its authorization, scope, and outbound
content guards before traffic is sent.

## Core Tool Catalog

Request history:

- `list_requests`
- `get_requests_by_ids`
- `match_requests`
- `execute_guarded_requests`
- `execute_guarded_raw_requests`
- `send_requests` (legacy, disabled by default)
- `send_raw_requests` (legacy, disabled by default)
- `check_requests_scope`
- `summarize_request_cookies`
- `summarize_request_auth_headers`

WebSocket/SSE:

- `list_websocket_streams`
- `get_websocket_streams_by_ids`
- `list_websocket_messages`
- `get_websocket_messages_by_ids`
- `get_websocket_message_edits_by_ids`

Sitemap:

- `list_sitemap_roots`
- `list_sitemap_descendants`
- `get_sitemap_entries_by_ids`
- `list_sitemap_entry_requests`

Environment:

- `list_environments`
- `get_environment`
- `get_environment_context`
- `create_environment`
- `update_environment`
- `delete_environment`
- `select_environment`
- `get_environment_variable`
- `list_environment_variables`
- `set_environment_variable`

Policy and lifecycle:

- `get_agent_safe_capabilities`
- `install_execution_grant` / `revoke_execution_grant`
- `get_guard_readiness` (selected project, effective scope digest, active grants, and distinct guarded-HTTP/browser/proxy-wide readiness)
- `list_execution_grants` / `list_egress_receipts`
- project and scope lifecycle
- workflow read/review/convert operations
- Automate session read/create/assessment (no start)
- intercept state and upstream proxy management

Other existing groups cover Replay, Tamper rules, findings, hosted files, and environment/runtime info.

Example request discovery:

```json
{
    "limit": 50,
    "filter": "req.host.eq:\"example.com\" AND req.method.eq:\"POST\" AND (resp.code.eq:200 OR resp.code.eq:401)",
    "fields": ["cursor", "id", "time", "request.method", "request.url", "response.status_code"]
}
```

## Development

```bash
pnpm install
pnpm build
```

Watch mode:

```bash
pnpm watch
```

## Upstream maintenance

The fork keeps `vvvvvvvvvvel/VibeHacking` as `upstream`. A scheduled GitHub
workflow compares the fork with `upstream/main` every week and opens or updates
an issue when commits require review. It never merges, tags, releases, or
changes the installed plugin automatically.

Handle every update in a dedicated branch. Review the upstream diff, preserve
the conservative permission model, run the backend tests and typecheck, build
the plugin package, and repeat the local MCP smoke test before merging.

## License

MIT
