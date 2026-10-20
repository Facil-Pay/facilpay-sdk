import type { RequestOptions } from '../core/http';

/**
 * Per-request options accepted as the optional trailing argument of every
 * resource method.
 *
 * Lets callers cancel a request (`signal`), bound it (`timeout`), set an
 * idempotency key for write operations (`idempotencyKey`), or attach
 * per-request headers (`headers`). Everything is forwarded to
 * {@link HttpClient.request}.
 */
export type ResourceRequestOptions = Pick<
  RequestOptions,
  'signal' | 'timeout' | 'idempotencyKey' | 'headers'
>;
