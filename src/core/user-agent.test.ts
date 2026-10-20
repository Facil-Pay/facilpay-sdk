import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from './http';
import { VERSION, clientUserAgent } from './version';

describe('HttpClient version headers', () => {
  it('defaults to the SDK VERSION and uses clientUserAgent()', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as unknown as typeof fetch;
    const http = new HttpClient({ fetch: fetchMock });

    expect(http.version).toBe(VERSION);

    await http.request({ path: '/ping' });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('User-Agent')).toBe(clientUserAgent());
    expect(headers.get('User-Agent')).toContain(VERSION);
    expect(headers.get('X-FacilPay-Client')).toBe(clientUserAgent());
  });
});
