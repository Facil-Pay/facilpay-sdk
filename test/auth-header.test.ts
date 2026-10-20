import { describe, expect, it, vi } from 'vitest';
import { FacilPay } from '../src/client';
import { HttpClient } from '../src/core/http';

function okFetch() {
  return vi.fn(
    async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch;
}

function authHeader(fetchMock: ReturnType<typeof vi.fn>): string | null {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return new Headers(init.headers).get('authorization');
}

describe('Authorization header scheme', () => {
  it('FacilPay sends exactly `ApiKey <key>`', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const client = new FacilPay({ apiKey: 'fp_test_abc123' });
      await client.request({ method: 'GET', path: '/ping' });
      expect(authHeader(fetchMock)).toBe('ApiKey fp_test_abc123');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('HttpClient sends `ApiKey <key>` and never Bearer', async () => {
    const fetchMock = okFetch();
    const http = new HttpClient({ apiKey: 'fp_test_direct', fetch: fetchMock });
    await http.request({ method: 'GET', path: '/ping' });
    const value = authHeader(fetchMock);
    expect(value).toBe('ApiKey fp_test_direct');
    expect(value).not.toMatch(/^Bearer /);
  });
});
