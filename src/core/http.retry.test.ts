import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from './http';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('HttpClient automatic retries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries a 500 and logs the actual attempt', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, { message: 'boom' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const logger = { debug: vi.fn(), error: vi.fn() };
    const http = new HttpClient({ fetch: fetch as unknown as typeof globalThis.fetch, logger });
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const pending = http.request({ path: '/payments' });
    await vi.advanceTimersByTimeAsync(10_000);
    const res = await pending;

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(logger.debug).toHaveBeenCalledWith(expect.objectContaining({ attempt: 2, status: 200 }));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('retries network errors until success', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const http = new HttpClient({ fetch: fetch as unknown as typeof globalThis.fetch });
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const pending = http.request({ path: '/payments' });
    await vi.advanceTimersByTimeAsync(10_000);
    const res = await pending;

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('honors the Retry-After header in seconds', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(429, { message: 'slow down' }, { 'retry-after': '120' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const http = new HttpClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      maxRetries: 1,
    });

    const pending = http.request({ path: '/payments' });
    // Backoff must wait out the capped Retry-After delay before retrying.
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const res = await pending;

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a 400 and logs attempt 1', async () => {
    const fetch = vi.fn(async () => jsonResponse(400, { message: 'bad request' }));
    const logger = { error: vi.fn() };
    const http = new HttpClient({ fetch: fetch as unknown as typeof globalThis.fetch, logger });

    const pending = http.request({ path: '/payments' });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).rejects.toThrow('Request failed');

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ attempt: 1, status: 400 }));
  });

  it('does not retry a non-idempotent POST without an Idempotency-Key', async () => {
    const fetch = vi.fn(async () => jsonResponse(503, { message: 'unavailable' }));
    const http = new HttpClient({ fetch: fetch as unknown as typeof globalThis.fetch });

    const pending = http.request({ method: 'POST', path: '/payments', body: { amount: 1 } });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).rejects.toThrow('Request failed');

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a POST when an Idempotency-Key is present', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { message: 'unavailable' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const http = new HttpClient({ fetch: fetch as unknown as typeof globalThis.fetch });
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const pending = http.request({
      method: 'POST',
      path: '/payments',
      body: { amount: 1 },
      idempotencyKey: 'key_123',
    });
    await vi.advanceTimersByTimeAsync(10_000);
    const res = await pending;

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries a 409 only when the body signals a lock timeout', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const conflict = vi.fn(async () => jsonResponse(409, { message: 'state conflict' }));
    const http = new HttpClient({ fetch: conflict as unknown as typeof globalThis.fetch });

    const pending = http.request({ path: '/payments' });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).rejects.toThrow('Request failed');
    expect(conflict).toHaveBeenCalledTimes(1);

    const lockTimeout = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(409, { code: 'lock_timeout', message: 'row lock timeout' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const retrying = new HttpClient({
      fetch: lockTimeout as unknown as typeof globalThis.fetch,
    });
    const pendingRetry = retrying.request({ path: '/payments' });
    await vi.advanceTimersByTimeAsync(10_000);
    const res = await pendingRetry;

    expect(res.status).toBe(200);
    expect(lockTimeout).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRetries and logs the final attempt', async () => {
    const fetch = vi.fn(async () => jsonResponse(500, { message: 'boom' }));
    const logger = { error: vi.fn() };
    const http = new HttpClient({
      fetch: fetch as unknown as typeof globalThis.fetch,
      logger,
      maxRetries: 2,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const pending = http.request({ path: '/payments' });
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(pending).rejects.toThrow('Request failed');

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ attempt: 3, status: 500 }));
  });
});
