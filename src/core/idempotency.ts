import { FacilPayValidationError } from './errors';

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9-_.]{1,255}$/;

/**
 * Generate a new idempotency key suitable for the `Idempotency-Key` header.
 *
 * Uses `crypto.randomUUID()` when available and falls back to a
 * cryptographically-random hex string on older runtimes.
 */
export function generateIdempotencyKey(): string {
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== 'undefined' ? (globalThis.crypto as Crypto | undefined) : undefined;

  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }

  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Last-resort fallback for runtimes without a Web Crypto implementation.
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Validate a user-provided idempotency key against the API rules:
 * 1-255 characters matching `[A-Za-z0-9-_.]`.
 *
 * Throws {@link FacilPayValidationError} before any request is made.
 */
export function validateIdempotencyKey(key: string): string {
  if (typeof key !== 'string' || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new FacilPayValidationError(
      'Invalid Idempotency-Key: must be 1-255 characters matching [A-Za-z0-9-_.]',
      { code: 'invalid_idempotency_key' },
    );
  }
  return key;
}
