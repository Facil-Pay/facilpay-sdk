import { describe, expect, it, vi } from 'vitest';
import { FacilPay } from '../src/client';

function mockFetch(body: unknown = { ok: true }) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

describe('FacilPay resources', () => {
  it('exposes every resource sharing the client HttpClient', () => {
    const client = new FacilPay({ apiKey: 'fp_test_123' });

    expect(client.payments).toBeDefined();
    expect(client.paymentLinks).toBeDefined();
    expect(client.disputes).toBeDefined();
    expect(client.recurringPayments).toBeDefined();
    expect(client.webhooks).toBeDefined();
    expect(client.apiKeys).toBeDefined();
    expect(client.stellar).toBeDefined();
  });

  it('payments.create hits /v1/payments', async () => {
    const fetch = mockFetch({ id: 'pay_123' });
    const client = new FacilPay({
      apiKey: 'fp_test_123',
      fetch: fetch as unknown as typeof globalThis.fetch,
    });

    const payment = await client.payments.create({ amount: 10, currency: 'USD' });

    expect(payment).toEqual({ id: 'pay_123' });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe('https://api.facilpay.io/v1/payments');
    expect(init?.method).toBe('POST');
  });
});
