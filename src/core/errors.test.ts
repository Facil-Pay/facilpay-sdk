import { describe, expect, it, vi } from 'vitest';
import {
  FacilPayAPIError,
  FacilPayAuthenticationError,
  FacilPayConflictError,
  FacilPayError,
  FacilPayInvalidRequestError,
  FacilPayNotFoundError,
  FacilPayPermissionError,
  FacilPayRateLimitError,
  FacilPayServerError,
  createApiError,
} from './errors';
import { HttpClient } from './http';

function errorFetch(status: number, headers: Record<string, string> = {}) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ message: `err ${status}` }), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
      }),
  ) as unknown as typeof fetch;
}

describe('createApiError', () => {
  const cases: Array<[number, new (...args: never[]) => FacilPayAPIError]> = [
    [401, FacilPayAuthenticationError],
    [403, FacilPayPermissionError],
    [404, FacilPayNotFoundError],
    [409, FacilPayConflictError],
    [400, FacilPayInvalidRequestError],
    [422, FacilPayInvalidRequestError],
    [429, FacilPayRateLimitError],
    [500, FacilPayServerError],
    [503, FacilPayServerError],
  ];

  it.each(cases)('maps status %i to %O', (status, Expected) => {
    const err = createApiError(status, { body: { message: `err ${status}` } });
    expect(err).toBeInstanceOf(Expected);
    expect(err).toBeInstanceOf(FacilPayAPIError);
    expect(err).toBeInstanceOf(FacilPayError);
    expect(err.status).toBe(status);
  });

  it('falls back to FacilPayAPIError for unmapped statuses', () => {
    const err = createApiError(418);
    expect(err.constructor).toBe(FacilPayAPIError);
    expect(err.status).toBe(418);
  });

  it('carries field errors on 422', () => {
    const err = createApiError(422, { body: { errors: [{ field: 'amount' }] } });
    expect(err).toBeInstanceOf(FacilPayInvalidRequestError);
    expect((err as FacilPayInvalidRequestError).fieldErrors).toEqual([{ field: 'amount' }]);
  });

  it('carries retryAfter on 429', () => {
    const err = createApiError(429, { retryAfter: 30 });
    expect(err).toBeInstanceOf(FacilPayRateLimitError);
    expect((err as FacilPayRateLimitError).retryAfter).toBe(30);
  });
});

describe('HttpClient typed errors', () => {
  it.each([
    [401, FacilPayAuthenticationError],
    [403, FacilPayPermissionError],
    [404, FacilPayNotFoundError],
    [409, FacilPayConflictError],
    [422, FacilPayInvalidRequestError],
    [429, FacilPayRateLimitError],
    [500, FacilPayServerError],
  ])('throws the typed error for status %i', async (status, Expected) => {
    const http = new HttpClient({ fetch: errorFetch(status, { 'retry-after': '5' }) });
    const error = await http.request({ path: '/payments' }).catch((e) => e);
    expect(error).toBeInstanceOf(Expected);
    expect((error as FacilPayAPIError).status).toBe(status);
  });

  it('exposes retryAfter from the Retry-After header on 429', async () => {
    const http = new HttpClient({ fetch: errorFetch(429, { 'retry-after': '12' }) });
    const error = await http.request({ path: '/payments' }).catch((e) => e);
    expect(error).toBeInstanceOf(FacilPayRateLimitError);
    expect((error as FacilPayRateLimitError).retryAfter).toBe(12);
  });
});
