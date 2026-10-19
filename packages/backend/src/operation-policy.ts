import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname, join } from "path";

import { assertOutboundHttp, assertOutboundText } from "./outbound-policy";

export type GrantTarget = {
    host: string;
    includeSubdomains?: boolean;
    ports?: number[];
    tls?: boolean;
    pathPrefix?: string;
};

export type ExecutionGrant = {
    id: string;
    projectId: string;
    authorizationId: string;
    scopeDigest: string;
    caidoScopeId: string;
    caidoScopeDigest: string;
    targets: GrantTarget[];
    methods: string[];
    expiresAt: string;
    maxRequests: number;
    usedRequests: number;
    createdAt: string;
    revokedAt?: string;
};

export type EgressRequest = {
    host: string;
    authorityHost?: string;
    port: number;
    tls: boolean;
    method: string;
    path: string;
    raw: Uint8Array;
};

export type EgressState = "not-armed" | "egress-armed" | "response-observed" | "terminal";

export type EgressReceipt = {
    id: string;
    operationId: string;
    itemIndex: number;
    grantId: string;
    projectId: string;
    target: string;
    method: string;
    state: EgressState;
    delivery: "none" | "observed" | "ambiguous-0..1";
    createdAt: string;
    updatedAt: string;
    requestId?: string;
    responseObserved?: boolean;
    error?: string;
};

type PersistedPolicy = {
    version: 1;
    grants: ExecutionGrant[];
    receipts: EgressReceipt[];
};

export type InstallGrantInput = Omit<ExecutionGrant, "usedRequests" | "createdAt" | "revokedAt">;

const EMPTY_POLICY: PersistedPolicy = { version: 1, grants: [], receipts: [] };
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/u;
const PROJECT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const MAX_RECEIPTS = 10_000;

const normalizeHost = (host: string) => host.trim().toLowerCase().replace(/\.$/u, "");
const normalizePath = (path: string) => (path.startsWith("/") ? path : `/${path}`);

const targetMatches = (target: GrantTarget, request: EgressRequest) => {
    const expected = normalizeHost(target.host);
    const actual = normalizeHost(request.host);
    const hostMatches =
        actual === expected ||
        (target.includeSubdomains === true && actual.endsWith(`.${expected}`));
    if (!hostMatches) return false;
    if (target.ports !== undefined && !target.ports.includes(request.port)) return false;
    if (target.tls !== undefined && target.tls !== request.tls) return false;
    if (
        target.pathPrefix !== undefined &&
        !normalizePath(request.path).startsWith(normalizePath(target.pathPrefix))
    ) {
        return false;
    }
    return true;
};

const sanitizeError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 500);
};

export class OperationPolicyStore {
    private readonly path: string;
    private readonly temporaryPath: string;
    private data: PersistedPolicy = { ...EMPTY_POLICY, grants: [], receipts: [] };
    private saveQueue: Promise<void> = Promise.resolve();

    constructor(root: string) {
        this.path = join(root, "operation-policy.json");
        this.temporaryPath = join(root, "operation-policy.next.json");
    }

    async load() {
        try {
            const parsed = JSON.parse(
                await readFile(this.path, "utf8"),
            ) as Partial<PersistedPolicy>;
            this.data = {
                version: 1,
                grants: Array.isArray(parsed.grants) ? parsed.grants : [],
                receipts: Array.isArray(parsed.receipts)
                    ? parsed.receipts.slice(-MAX_RECEIPTS)
                    : [],
            };
        } catch (error) {
            const message = sanitizeError(error);
            if (!message.includes("ENOENT") && !message.includes("no such file")) throw error;
            await this.save();
        }
    }

    listGrants() {
        return this.data.grants.map((grant) => ({ ...grant, targets: [...grant.targets] }));
    }

    listReceipts(limit = 100) {
        return this.data.receipts.slice(-Math.max(1, Math.min(limit, 500))).reverse();
    }

    getGrantForExecution(id: string, projectId: string) {
        return this.getActiveGrant(id, projectId);
    }

    async installGrant(input: InstallGrantInput) {
        this.validateGrantInput(input);
        if (this.data.grants.some((grant) => grant.id === input.id)) {
            throw new Error(`Execution grant already exists: ${input.id}`);
        }
        const grant: ExecutionGrant = {
            ...input,
            targets: input.targets.map((target) => ({
                ...target,
                host: normalizeHost(target.host),
                pathPrefix:
                    target.pathPrefix === undefined ? undefined : normalizePath(target.pathPrefix),
            })),
            methods: input.methods.map((method) => method.toUpperCase()),
            usedRequests: 0,
            createdAt: new Date().toISOString(),
        };
        this.data.grants.push(grant);
        await this.save();
        return grant;
    }

    async revokeGrant(id: string) {
        const grant = this.data.grants.find((candidate) => candidate.id === id);
        if (grant === undefined) throw new Error(`Unknown execution grant: ${id}`);
        grant.revokedAt = new Date().toISOString();
        await this.save();
        return grant;
    }

    validatePlan(grantId: string, projectId: string, requests: EgressRequest[]) {
        const grant = this.getActiveGrant(grantId, projectId);
        if (requests.length === 0) throw new Error("Execution plan contains no requests");
        if (grant.usedRequests + requests.length > grant.maxRequests) {
            throw new Error("Execution grant request budget exhausted");
        }
        for (const request of requests) this.validateRequest(grant, request);
        return grant;
    }

    revalidateRequest(grantId: string, projectId: string, request: EgressRequest) {
        const grant = this.getActiveGrant(grantId, projectId);
        this.validateRequest(grant, request);
    }

    async beginOperation(
        operationId: string,
        grantId: string,
        projectId: string,
        requests: EgressRequest[],
    ) {
        if (!ID_PATTERN.test(operationId)) throw new Error("Invalid operation_id");
        if (this.data.receipts.some((receipt) => receipt.operationId === operationId)) {
            throw new Error(`operation_id already used: ${operationId}`);
        }
        const grant = this.validatePlan(grantId, projectId, requests);
        const now = new Date().toISOString();
        const receipts = requests.map<EgressReceipt>((request, itemIndex) => ({
            id: `${operationId}:${itemIndex}`,
            operationId,
            itemIndex,
            grantId,
            projectId,
            target: `${request.tls ? "https" : "http"}://${normalizeHost(request.host)}:${request.port}${normalizePath(request.path)}`,
            method: request.method.toUpperCase(),
            state: "not-armed",
            delivery: "none",
            createdAt: now,
            updatedAt: now,
        }));
        grant.usedRequests += requests.length;
        this.data.receipts.push(...receipts);
        this.data.receipts = this.data.receipts.slice(-MAX_RECEIPTS);
        await this.save();
        return receipts;
    }

    async markArmed(receiptId: string) {
        return await this.updateReceipt(receiptId, {
            state: "egress-armed",
            delivery: "ambiguous-0..1",
        });
    }

    async markResponse(receiptId: string, requestId: string, responseObserved: boolean) {
        return await this.updateReceipt(receiptId, {
            state: "response-observed",
            delivery: "observed",
            requestId,
            responseObserved,
        });
    }

    async markTerminal(receiptId: string) {
        return await this.updateReceipt(receiptId, { state: "terminal" });
    }

    async markFailure(receiptId: string, error: unknown) {
        const receipt = this.getReceipt(receiptId);
        return await this.updateReceipt(receiptId, {
            state: "terminal",
            delivery: receipt.state === "not-armed" ? "none" : "ambiguous-0..1",
            error: sanitizeError(error),
        });
    }

    private validateGrantInput(input: InstallGrantInput) {
        if (!ID_PATTERN.test(input.id)) throw new Error("Invalid grant id");
        if (!PROJECT_ID_PATTERN.test(input.projectId)) throw new Error("Invalid project id");
        if (
            input.authorizationId.trim() === "" ||
            input.scopeDigest.trim() === "" ||
            input.caidoScopeId.trim() === "" ||
            input.caidoScopeDigest.trim() === ""
        ) {
            throw new Error(
                "authorizationId, scopeDigest, caidoScopeId and caidoScopeDigest are required",
            );
        }
        if (input.targets.length === 0) throw new Error("At least one target is required");
        if (input.methods.length === 0) throw new Error("At least one HTTP method is required");
        if (!Number.isInteger(input.maxRequests) || input.maxRequests < 1) {
            throw new Error("maxRequests must be a positive integer");
        }
        const expiry = Date.parse(input.expiresAt);
        if (!Number.isFinite(expiry) || expiry <= Date.now()) {
            throw new Error("expiresAt must be a future ISO-8601 timestamp");
        }
        input.targets.forEach((target) => {
            assertOutboundText(target.host);
            if (normalizeHost(target.host) === "") throw new Error("Target host is required");
            target.pathPrefix !== undefined && assertOutboundText(target.pathPrefix);
        });
    }

    private getActiveGrant(id: string, projectId: string) {
        const grant = this.data.grants.find((candidate) => candidate.id === id);
        if (grant === undefined) throw new Error(`Unknown execution grant: ${id}`);
        if (grant.revokedAt !== undefined) throw new Error(`Execution grant is revoked: ${id}`);
        if (Date.parse(grant.expiresAt) <= Date.now())
            throw new Error(`Execution grant expired: ${id}`);
        if (grant.projectId !== projectId) throw new Error("Execution grant project mismatch");
        if (grant.caidoScopeId === undefined || grant.caidoScopeDigest === undefined) {
            throw new Error("Legacy execution grant has no effective Caido scope binding");
        }
        return grant;
    }

    private validateRequest(grant: ExecutionGrant, request: EgressRequest) {
        assertOutboundText(request.host);
        assertOutboundText(request.path);
        assertOutboundHttp(request.raw);
        if (!grant.methods.includes(request.method.toUpperCase())) {
            throw new Error(`HTTP method not allowed by execution grant: ${request.method}`);
        }
        if (!grant.targets.some((target) => targetMatches(target, request))) {
            throw new Error(`Target is outside execution grant: ${request.host}`);
        }
        if (
            request.authorityHost !== undefined &&
            normalizeHost(request.authorityHost) !== normalizeHost(request.host) &&
            !grant.targets.some((target) =>
                targetMatches(target, { ...request, host: request.authorityHost as string }),
            )
        ) {
            throw new Error(`HTTP authority is outside execution grant: ${request.authorityHost}`);
        }
    }

    private getReceipt(id: string) {
        const receipt = this.data.receipts.find((candidate) => candidate.id === id);
        if (receipt === undefined) throw new Error(`Unknown egress receipt: ${id}`);
        return receipt;
    }

    private async updateReceipt(id: string, patch: Partial<EgressReceipt>) {
        const receipt = this.getReceipt(id);
        Object.assign(receipt, patch, { updatedAt: new Date().toISOString() });
        await this.save();
        return receipt;
    }

    private save() {
        const persist = async () => {
            const directory = dirname(this.path);
            await mkdir(directory, { recursive: true });
            await writeFile(this.temporaryPath, JSON.stringify(this.data, null, 2));
            await rename(this.temporaryPath, this.path);
        };
        this.saveQueue = this.saveQueue.then(persist, persist);
        return this.saveQueue;
    }
}
