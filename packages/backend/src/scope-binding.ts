import { GET_SCOPE_QUERY } from "./graphql";
import type { ExecutionGrant, OperationPolicyStore } from "./operation-policy";
import { sha256Hex } from "./sha256";
import type { MCPSDK } from "./types/sdk";

export type EffectiveScope = {
    id: string;
    name: string;
    allowlist: string[];
    denylist: string[];
    digest: string;
    allowlistDigest: string;
};

type ScopeRecord = {
    id?: unknown;
    name?: unknown;
    allowlist?: unknown;
    denylist?: unknown;
};

const normalizeEntry = (value: string) => value.trim().toLowerCase().replace(/\.$/u, "");
const normalizeEntries = (values: unknown) =>
    Array.isArray(values)
        ? [...new Set(values.filter((value): value is string => typeof value === "string").map(normalizeEntry))]
              .filter(Boolean)
              .sort()
        : [];

const sha256 = (value: unknown) =>
    `sha256:${sha256Hex(JSON.stringify(value))}`;

export const normalizeScope = (scope: ScopeRecord): EffectiveScope => {
    const id = String(scope.id ?? "");
    if (id === "") throw new Error("Caido scope has no id");
    const allowlist = normalizeEntries(scope.allowlist);
    const denylist = normalizeEntries(scope.denylist);
    return {
        id,
        name: String(scope.name ?? ""),
        allowlist,
        denylist,
        allowlistDigest: sha256(allowlist),
        digest: sha256({ id, allowlist, denylist }),
    };
};

const responseScope = (response: unknown): ScopeRecord | undefined => {
    if (response === null || typeof response !== "object") return undefined;
    const root = response as Record<string, unknown>;
    const data =
        root.data !== null && typeof root.data === "object"
            ? (root.data as Record<string, unknown>)
            : root;
    const scope = data.scope;
    return scope !== null && typeof scope === "object" ? (scope as ScopeRecord) : undefined;
};

export const getEffectiveScope = async (sdk: MCPSDK, scopeId: string) => {
    const response = await sdk.graphql.execute(GET_SCOPE_QUERY, { id: scopeId });
    const scope = responseScope(response);
    if (scope === undefined) throw new Error(`Caido scope not found: ${scopeId}`);
    const normalized = normalizeScope(scope);
    if (normalized.id !== scopeId) throw new Error("Caido scope id mismatch");
    return normalized;
};

const hostFromScopeEntry = (entry: string) => {
    const candidate = entry.includes("://") ? entry : `https://${entry}`;
    try {
        return new URL(candidate.replace("*." , "wildcard.")).hostname.replace(/^wildcard\./u, "*.");
    } catch {
        return entry.split("/")[0]?.split(":")[0] ?? entry;
    }
};

const scopeAllowsTarget = (allowlist: string[], target: ExecutionGrant["targets"][number]) => {
    const targetHost = normalizeEntry(target.host);
    return allowlist.some((entry) => {
        const allowedHost = normalizeEntry(hostFromScopeEntry(entry));
        if (allowedHost === targetHost) return target.includeSubdomains !== true;
        if (allowedHost.startsWith("*.")) {
            const suffix = allowedHost.slice(2);
            return (
                targetHost === suffix ||
                targetHost.endsWith(`.${suffix}`) ||
                (target.includeSubdomains === true && suffix === targetHost)
            );
        }
        return false;
    });
};

export const assertScopeBinding = (
    scope: EffectiveScope,
    expected: {
        caidoScopeId: string;
        caidoScopeDigest: string;
        targets: ExecutionGrant["targets"];
    },
) => {
    if (scope.id !== expected.caidoScopeId) throw new Error("Execution grant Caido scope id mismatch");
    if (scope.digest !== expected.caidoScopeDigest) {
        throw new Error("Execution grant Caido scope digest mismatch");
    }
    if (expected.targets.some((target) => !scopeAllowsTarget(scope.allowlist, target))) {
        throw new Error("Execution grant target is outside the effective Caido scope allowlist");
    }
};

export const assertLiveGrantScope = async (
    sdk: MCPSDK,
    policy: OperationPolicyStore,
    grantId: string,
    projectId: string,
) => {
    const grant = policy.getGrantForExecution(grantId, projectId);
    const scope = await getEffectiveScope(sdk, grant.caidoScopeId);
    assertScopeBinding(scope, grant);
    return { grant, scope };
};
