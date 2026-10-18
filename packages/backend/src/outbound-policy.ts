import { Buffer } from "buffer";

const FORBIDDEN = "codex";
const MAX_DECODE_ROUNDS = 5;
const MAX_CANDIDATE_LENGTH = 1_000_000;
const INVISIBLE =
    /[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/gu;
const BASE64_TOKEN = /(?<![A-Za-z0-9+/_-])[A-Za-z0-9+/_-]{4,}={0,2}(?![A-Za-z0-9+/_-])/gu;

export class OutboundPolicyError extends Error {
    readonly code = "forbidden-outbound-reference";

    constructor(reason: string) {
        super(`${reason} (${"forbidden"}-outbound-reference)`);
        this.name = "OutboundPolicyError";
    }
}

const normalize = (value: string) => value.normalize("NFKC").replace(INVISIBLE, "").toLowerCase();

const decodeEscapes = (value: string) =>
    value
        .replace(/\\u\{([0-9a-f]{1,6})\}/giu, (_match, hex: string) =>
            String.fromCodePoint(Number.parseInt(hex, 16)),
        )
        .replace(/\\u([0-9a-f]{4})/giu, (_match, hex: string) =>
            String.fromCharCode(Number.parseInt(hex, 16)),
        )
        .replace(/\\x([0-9a-f]{2})/giu, (_match, hex: string) =>
            String.fromCharCode(Number.parseInt(hex, 16)),
        )
        .replace(/&#x([0-9a-f]+);?/giu, (_match, hex: string) =>
            String.fromCodePoint(Number.parseInt(hex, 16)),
        )
        .replace(/&#([0-9]+);?/gu, (_match, decimal: string) =>
            String.fromCodePoint(Number.parseInt(decimal, 10)),
        )
        .replace(/&colon;/giu, ":")
        .replace(/&sol;/giu, "/")
        .replace(/&bsol;/giu, "\\")
        .replace(/&percnt;/giu, "%");

const decodePercent = (value: string) => {
    try {
        return decodeURIComponent(value);
    } catch {
        return value.replace(/%([0-9a-f]{2})/giu, (_match, hex: string) =>
            String.fromCharCode(Number.parseInt(hex, 16)),
        );
    }
};

const decodeBase64Candidates = (value: string): string[] => {
    const decoded: string[] = [];
    for (const match of value.matchAll(BASE64_TOKEN)) {
        const token = match[0];
        if (token.length > MAX_CANDIDATE_LENGTH) continue;
        try {
            const normalized = token.replace(/-/gu, "+").replace(/_/gu, "/");
            const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
            const bytes = Buffer.from(`${normalized}${padding}`, "base64");
            if (bytes.length === 0) continue;
            const text = bytes.toString("utf8");
            if (Buffer.from(text, "utf8").length !== bytes.length) continue;
            decoded.push(text);
        } catch {
            // Non-decodable tokens are ordinary text, not encoded payloads.
        }
    }
    return decoded;
};

export const assertOutboundText = (input: string) => {
    if (input.length > MAX_CANDIDATE_LENGTH) {
        throw new OutboundPolicyError("outbound content exceeds inspection limit");
    }
    const queue = [input];
    const seen = new Set<string>();
    for (let round = 0; round < MAX_DECODE_ROUNDS && queue.length > 0; round += 1) {
        const batch = queue.splice(0);
        for (const candidate of batch) {
            if (seen.has(candidate)) continue;
            seen.add(candidate);
            const normalized = normalize(candidate);
            if (normalized.includes(FORBIDDEN)) {
                throw new OutboundPolicyError("forbidden outbound content detected");
            }
            const escaped = decodeEscapes(candidate);
            const percent = decodePercent(candidate);
            if (!seen.has(escaped)) queue.push(escaped);
            if (!seen.has(percent)) queue.push(percent);
            queue.push(...decodeBase64Candidates(candidate).filter((value) => !seen.has(value)));
        }
    }
};

const findBodyOffset = (raw: Uint8Array) => {
    for (let index = 0; index <= raw.length - 4; index += 1) {
        if (
            raw[index] === 13 &&
            raw[index + 1] === 10 &&
            raw[index + 2] === 13 &&
            raw[index + 3] === 10
        ) {
            return index + 4;
        }
    }
    return undefined;
};

const isRoundTripUtf8 = (bytes: Uint8Array) => {
    const decoded = Buffer.from(bytes).toString("utf8");
    const encoded = Buffer.from(decoded, "utf8");
    if (encoded.length !== bytes.length) return false;
    return encoded.every((value, index) => value === bytes[index]);
};

export const assertOutboundHttp = (raw: Uint8Array) => {
    const bodyOffset = findBodyOffset(raw);
    const headerBytes = bodyOffset === undefined ? raw : raw.slice(0, bodyOffset);
    if (!isRoundTripUtf8(headerBytes)) {
        throw new OutboundPolicyError("HTTP headers are not inspectable UTF-8");
    }
    const headers = Buffer.from(headerBytes).toString("utf8");
    const encoding = /^content-encoding\s*:\s*([^\r\n]+)/gimu.exec(headers)?.[1]?.trim();
    if (encoding !== undefined && encoding !== "" && encoding.toLowerCase() !== "identity") {
        throw new OutboundPolicyError("compressed outbound body cannot be inspected");
    }
    assertOutboundText(headers);
    if (bodyOffset === undefined || bodyOffset >= raw.length) return;
    const body = raw.slice(bodyOffset);
    if (!isRoundTripUtf8(body)) {
        throw new OutboundPolicyError("outbound body is not inspectable UTF-8");
    }
    assertOutboundText(Buffer.from(body).toString("utf8"));
};
