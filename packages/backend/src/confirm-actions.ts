export type PendingActionResult = {
    confirmed: boolean;
    action: string;
    params: Record<string, unknown>;
    reason?: "rejected" | "expired" | "cancelled";
    result?: unknown;
    error?: string;
};

export type ActionHandler = (params: Record<string, unknown>) => unknown;

type PendingAction = {
    action: string;
    params: Record<string, unknown>;
    resolve: (result: PendingActionResult) => void;
    execute: () => Promise<unknown>;
    timeout: ReturnType<typeof setTimeout>;
};

export const DEFAULT_CONFIRMATION_TIMEOUT_MS = 15_000;

export class ConfirmActionStore {
    private readonly pendingActions = new Map<number, PendingAction>();
    private readonly actionHandlers = new Map<string, ActionHandler>();

    constructor(private readonly confirmationTimeoutMs = DEFAULT_CONFIRMATION_TIMEOUT_MS) {
        if (!Number.isFinite(confirmationTimeoutMs) || confirmationTimeoutMs <= 0) {
            throw new Error("confirmationTimeoutMs must be a positive finite number");
        }
    }

    private generateId() {
        let id = Math.floor(Math.random() * 1_000_000);
        while (this.pendingActions.has(id)) {
            id = Math.floor(Math.random() * 1_000_000);
        }
        return id;
    }

    createPendingAction(
        action: string,
        params: Record<string, unknown>,
        execute: () => Promise<unknown>,
    ) {
        const id = this.generateId();
        const promise = new Promise<PendingActionResult>((resolve) => {
            const timeout = setTimeout(() => {
                const pending = this.pendingActions.get(id);
                if (pending === undefined) return;
                this.pendingActions.delete(id);
                pending.resolve({
                    confirmed: false,
                    action: pending.action,
                    params: pending.params,
                    reason: "expired",
                });
            }, this.confirmationTimeoutMs);
            this.pendingActions.set(id, { action, params, resolve, execute, timeout });
        });
        return { id, promise };
    }

    async resolveToolActionConfirmation(id: number, confirmed: boolean) {
        if (!Number.isFinite(id)) return null;
        const pending = this.pendingActions.get(id);
        if (!pending) return null;
        this.pendingActions.delete(id);
        clearTimeout(pending.timeout);
        const result: PendingActionResult = {
            confirmed,
            action: pending.action,
            params: pending.params,
            reason: confirmed ? undefined : "rejected",
        };
        if (confirmed) {
            try {
                result.result = await pending.execute();
            } catch (err) {
                result.error = err instanceof Error ? err.message : String(err);
            }
        }
        pending.resolve(result);
        return result;
    }

    cancelPendingActions() {
        for (const [id, pending] of this.pendingActions) {
            clearTimeout(pending.timeout);
            this.pendingActions.delete(id);
            pending.resolve({
                confirmed: false,
                action: pending.action,
                params: pending.params,
                reason: "cancelled",
            });
        }
    }

    registerAction(name: string, handler: ActionHandler) {
        this.actionHandlers.set(name, handler);
    }

    runAction(name: string, params: Record<string, unknown>) {
        const handler = this.actionHandlers.get(name);
        if (!handler) {
            throw new Error(`Unknown action "${name}"`);
        }
        return Promise.resolve(handler(params));
    }
}
