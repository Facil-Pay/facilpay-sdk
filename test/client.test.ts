import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { inspect } from 'node:util';
import { FacilPay } from '../src/client';
import { FacilPayError } from '../src/core/errors';

describe('FacilPay API key authentication', () => {
  const originalEnv = process.env.FACILPAY_API_KEY;

  beforeEach(() => {
    delete process.env.FACILPAY_API_KEY;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.FACILPAY_API_KEY;
    } else {
      process.env.FACILPAY_API_KEY = originalEnv;
    }
    vi.restoreAllMocks();
  });

  it('accepts a valid test key and exposes test environment', () => {
    const client = new FacilPay({ apiKey: 'fp_test_1234567890' });
    expect(client.environment).toBe('test');
    expect(client.isTestMode).toBe(true);
  });

  it('accepts a valid live key and exposes live environment', () => {
    const client = new FacilPay({ apiKey: 'fp_live_1234567890' });
    expect(client.environment).toBe('live');
    expect(client.isTestMode).toBe(false);
  });

  it('throws a FacilPayError when the key is missing', () => {
    expect(() => new FacilPay({} as never)).toThrow(FacilPayError);
    expect(() => new FacilPay({} as never)).toThrow(/apiKey/i);
  });

  it('throws a FacilPayError when the key is malformed', () => {
    expect(() => new FacilPay({ apiKey: 'sk_test_123' })).toThrow(FacilPayError);
    expect(() => new FacilPay({ apiKey: 'fp_prod_123' })).toThrow(FacilPayError);
  });

  it('falls back to process.env.FACILPAY_API_KEY in Node', () => {
    process.env.FACILPAY_API_KEY = 'fp_test_from_env';
    const client = new FacilPay({} as never);
    expect(client.environment).toBe('test');
    expect(client.isTestMode).toBe(true);
  });

  it('sends Authorization: ApiKey <key> on every request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new FacilPay({ apiKey: 'fp_test_abc123' });
    await client.request({ method: 'GET', path: '/v1/ping' });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('ApiKey fp_test_abc123');
  });

  it('does not leak the API key via JSON.stringify or util.inspect', () => {
    const client = new FacilPay({ apiKey: 'fp_live_supersecret' });

    expect(JSON.stringify(client)).not.toContain('fp_live_supersecret');
    expect(inspect(client)).not.toContain('fp_live_supersecret');
  });
});
