import { describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../core/http';
import { FacilPayConnectionError } from '../core/errors';
import { DisputesResource } from './disputes';
import { RecurringPaymentsResource } from './recurring-payments';
import { PaymentLinksResource } from './payment-links';
import { ApiKeysResource } from './api-keys';
import { WebhooksResource } from './webhooks';
import type { ResourceRequestOptions } from './request-options';

function createMockHttp() {
  return {
    request: vi.fn(async () => ({ data: {}, status: 200, headers: new Headers() })),
  } as unknown as HttpClient & { request: ReturnType<typeof vi.fn> };
}

function abortedSignal(): AbortSignal {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
}

describe('resource request options (signal / timeout)', () => {
  it('disputes.create forwards signal, timeout, idempotencyKey and headers', async () => {
    const http = createMockHttp();
    const disputes = new DisputesResource(http);
    const options: ResourceRequestOptions = {
      signal: abortedSignal(),
      timeout: 1000,
      idempotencyKey: 'dispute-key_1',
      headers: { 'X-Custom': 'yes' },
    };

    await disputes.create('pay_123', { reason: 'fraud' }, options);

    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        signal: options.signal,
        timeout: 1000,
        idempotencyKey: 'dispute-key_1',
        headers: { 'X-Custom': 'yes' },
      }),
    );
  });

  it('recurring-payments.list forwards signal and timeout', async () => {
    const http = createMockHttp();
    const recurring = new RecurringPaymentsResource(http);
    const signal = abortedSignal();

    await recurring.list({ status: 'active' }, { signal, timeout: 500 });

    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', signal, timeout: 500 }),
    );
  });

  it('payment-links.retrieve forwards signal and timeout', async () => {
    const http = createMockHttp();
    const links = new PaymentLinksResource(http, 'https://pay.facilpay.io');
    const signal = abortedSignal();

    await links.retrieve('tok_123', { signal, timeout: 500 });

    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', signal, timeout: 500 }),
    );
  });

  it('api-keys.retrieve forwards signal and timeout', async () => {
    const http = createMockHttp();
    const apiKeys = new ApiKeysResource(http);
    const signal = abortedSignal();

    await apiKeys.retrieve('key_123', { signal, timeout: 500 });

    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', signal, timeout: 500 }),
    );
  });

  it('webhooks.list forwards signal and timeout', async () => {
    const http = createMockHttp();
    const webhooks = new WebhooksResource(http);
    const signal = abortedSignal();

    await webhooks.list({ signal, timeout: 500 });

    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', signal, timeout: 500 }),
    );
  });

  it('aborts a real request when the signal is already aborted', async () => {
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      if (init?.signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    const http = new HttpClient({ fetch });

    await expect(
      http.request({ path: '/disputes', signal: abortedSignal(), timeout: 5000 }),
    ).rejects.toThrow(FacilPayConnectionError);
  });

  it('times out a hanging request after the per-request timeout', async () => {
    const fetch = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    ) as unknown as typeof fetch;
    const http = new HttpClient({ fetch });

    await expect(http.request({ path: '/disputes', timeout: 20 })).rejects.toThrow(
      /timed out after 20ms/,
    );
  });
});
