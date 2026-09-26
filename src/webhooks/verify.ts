import { FacilPaySignatureVerificationError } from "../errors";

export type WebhookPayload = string | Uint8Array | Buffer;

export interface ConstructEventOptions {
  /**
   * Maximum allowed age of a signed timestamp, in seconds. Only enforced when
   * the API includes a signed timestamp in the signature header (tracked
   * upstream). When omitted, timestamp tolerance is not checked.
   */
  tolerance?: number;
  /**
   * Current time in seconds, used for timestamp tolerance checks. Defaults to
   * `Math.floor(Date.now() / 1000)`. Exposed for deterministic tests.
   */
  now?: number;
}

const HEX_RE = /^[0-9a-fA-F]+$/;

function isBytes(value: unknown): value is Uint8Array {
  return (
    value instanceof Uint8Array ||
    (typeof Buffer !== "undefined" && Buffer.isBuffer(value))
  );
}

function toBytes(payload: WebhookPayload): Uint8Array {
  if (typeof payload === "string") {
    return new TextEncoder().encode(payload);
  }
  if (isBytes(payload)) {
    return payload;
  }
  throw new FacilPaySignatureVerificationError(
    "Webhook payload must be the raw request body as a string, Uint8Array, or Buffer. " +
      "Do not pass a parsed object: verify the signature against the raw body before parsing JSON.",
  );
}

function normalizeSecrets(secret: string | string[]): string[] {
  const secrets = Array.isArray(secret) ? secret : [secret];
  if (secrets.length === 0 || secrets.some((s) => typeof s !== "string" || s.length === 0)) {
    throw new FacilPaySignatureVerificationError(
      "A webhook signing secret (or non-empty array of secrets) is required.",
    );
  }
  return secrets;
}

interface ParsedSignature {
  signatures: string[];
  timestamp?: number;
}

function parseSignatureHeader(signature: string): ParsedSignature {
  if (typeof signature !== "string" || signature.length === 0) {
    throw new FacilPaySignatureVerificationError(
      "Missing X-FacilPay-Signature header.",
    );
  }

  // Support both the plain hex digest and a `t=<ts>,v1=<hex>` scheme so the
  // helper is ready for when the API adds a signed timestamp.
  if (signature.includes("=")) {
    const parts = signature.split(",");
    const signatures: string[] = [];
    let timestamp: number | undefined;
    for (const part of parts) {
      const [key, value] = part.split("=", 2).map((p) => p.trim());
      if (key === "t") {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          throw new FacilPaySignatureVerificationError(
            "Malformed timestamp in X-FacilPay-Signature header.",
          );
        }
        timestamp = parsed;
      } else if (key === "v1" || key === "v0") {
        signatures.push(value);
      }
    }
    if (signatures.length === 0) {
      throw new FacilPaySignatureVerificationError(
        "Malformed X-FacilPay-Signature header: no signature value found.",
      );
    }
    return { signatures, timestamp };
  }

  return { signatures: [signature.trim()] };
}

function assertHex(value: string): void {
  if (value.length === 0 || value.length % 2 !== 0 || !HEX_RE.test(value)) {
    throw new FacilPaySignatureVerificationError(
      "Malformed X-FacilPay-Signature header: expected a hex-encoded HMAC-SHA256 digest.",
    );
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function getNodeCrypto(): typeof import("node:crypto") | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const req = typeof require === "function" ? require : undefined;
    if (req) {
      return req("node:crypto");
    }
  } catch {
    // Not running on Node or crypto unavailable; fall back to Web Crypto.
  }
  return undefined;
}

function computeNodeHmac(
  payload: Uint8Array,
  secret: string,
  nodeCrypto: typeof import("node:crypto"),
): Uint8Array {
  return nodeCrypto.createHmac("sha256", secret).update(payload).digest();
}

async function computeWebHmac(payload: Uint8Array, secret: string): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new FacilPaySignatureVerificationError(
      "No crypto implementation available: expected node:crypto or Web Crypto (crypto.subtle).",
    );
  }
  const key = await subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await subtle.sign("HMAC", key, payload);
  return new Uint8Array(digest);
}

function checkTolerance(
  timestamp: number | undefined,
  options: ConstructEventOptions | undefined,
): void {
  if (timestamp === undefined || options?.tolerance === undefined) {
    return;
  }
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > options.tolerance) {
    throw new FacilPaySignatureVerificationError(
      "Webhook timestamp is outside the allowed tolerance.",
    );
  }
}

function matchesAny(
  expected: Uint8Array,
  candidates: string[],
): boolean {
  let matched = false;
  for (const candidate of candidates) {
    assertHex(candidate);
    const provided = hexToBytes(candidate);
    // Evaluate every candidate to keep timing independent of which one matches.
    if (constantTimeEqual(expected, provided)) {
      matched = true;
    }
  }
  return matched;
}

/**
 * Verify a webhook signature against one or more endpoint secrets.
 *
 * Accepts the raw request body (string, Uint8Array, or Buffer) and the value of
 * the `X-FacilPay-Signature` header. Uses `node:crypto` synchronously when
 * available and falls back to Web Crypto (`crypto.subtle`) on edge runtimes.
 *
 * @throws {FacilPaySignatureVerificationError} on missing header, malformed
 * hex, or signature mismatch.
 */
export function verifySignature(
  payload: WebhookPayload,
  signature: string,
  secret: string | string[],
  options?: ConstructEventOptions,
): boolean {
  const body = toBytes(payload);
  const secrets = normalizeSecrets(secret);
  const { signatures, timestamp } = parseSignatureHeader(signature);
  checkTolerance(timestamp, options);

  const nodeCrypto = getNodeCrypto();
  if (nodeCrypto) {
    let matched = false;
    for (const s of secrets) {
      const expected = computeNodeHmac(body, s, nodeCrypto);
      if (matchesAny(expected, signatures)) {
        matched = true;
      }
    }
    if (!matched) {
      throw new FacilPaySignatureVerificationError(
        "Webhook signature verification failed.",
      );
    }
    return true;
  }

  // Web Crypto path is async; surface a clear error for the sync entrypoint.
  throw new FacilPaySignatureVerificationError(
    "Synchronous verification requires node:crypto. Use Webhooks.constructEvent() on edge runtimes.",
  );
}

/**
 * Verify a webhook signature and return the parsed event.
 *
 * The raw body is verified before JSON parsing so tampered payloads never reach
 * application code. Works on Node and edge runtimes via Web Crypto.
 *
 * @throws {FacilPaySignatureVerificationError} on missing header, malformed
 * hex, or signature mismatch.
 */
export async function constructEvent<T = unknown>(
  payload: WebhookPayload,
  signature: string,
  secret: string | string[],
  options?: ConstructEventOptions,
): Promise<T> {
  const body = toBytes(payload);
  const secrets = normalizeSecrets(secret);
  const { signatures, timestamp } = parseSignatureHeader(signature);
  checkTolerance(timestamp, options);

  let matched = false;
  for (const s of secrets) {
    const expected = await computeWebHmac(body, s);
    if (matchesAny(expected, signatures)) {
      matched = true;
    }
  }
  if (!matched) {
    throw new FacilPaySignatureVerificationError(
      "Webhook signature verification failed.",
    );
  }

  const text = typeof payload === "string" ? payload : new TextDecoder().decode(body);
  return JSON.parse(text) as T;
}

/**
 * Generate a valid `X-FacilPay-Signature` header value for a payload and secret.
 * Intended for users' own tests.
 */
export function generateTestHeader(
  payload: WebhookPayload,
  secret: string,
): string {
  const body = toBytes(payload);
  const nodeCrypto = getNodeCrypto();
  if (nodeCrypto) {
    return bytesToHex(computeNodeHmac(body, secret, nodeCrypto));
  }
  throw new FacilPaySignatureVerificationError(
    "generateTestHeader requires node:crypto.",
  );
}

export const Webhooks = {
  verifySignature,
  constructEvent,
  generateTestHeader,
};
