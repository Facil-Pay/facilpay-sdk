/**
 * Per-request overrides accepted as an optional trailing argument by every
 * resource method.
 */
export interface ResourceRequestOptions {
  /** Abort the request via an AbortSignal. */
  signal?: AbortSignal;
  /** Per-request timeout in milliseconds. */
  timeout?: number;
  /** Idempotency key forwarded as the `Idempotency-Key` header. */
  idempotencyKey?: string;
  /** Additional headers merged into the request. */
  headers?: Record<string, string>;
}
