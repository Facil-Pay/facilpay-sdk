import { describe, expect, it, vi } from 'vitest';
import { DisputesResource } from './disputes';
import { RecurringPaymentsResource } from './recurring-payments';
import { PaymentLinksResource } from './payment-links';
import { ApiKeysResource } from './api-keys';
import { WebhooksResource } from './webhooks';

function requestClient() {
  return { request: vi.fn(async () => ({})) };
}

function helperClient() {
  return {
    get: vi.fn(async () => ({})),
    post: vi.fn(async () => ({})),
    patch: vi.fn(async () => ({})),
    delete: vi.fn(async () => ({})),
  };
}

describe('ResourceRequestOptions', () => {
  it('forwards signal/timeout/headers from Disputes.retrieve', async () => {
    const client = requestClient();
    const controller = new AbortController();
    await new DisputesResource(client as never).retrieve('dp_1', {
      signal: controller.signal,
      timeout: 1000,
      headers: { 'X-Trace': 'a' },
    });
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: controller.signal,
        timeout: 1000,
        headers: { 'X-Trace': 'a' },
      }),
    );
  });

  it('aborts RecurringPayments.retrieve via signal', async () => {
    const client = helperClient();
    const controller = new AbortController();
    controller.abort();
    await new RecurringPaymentsResource(client as never).retrieve('rp_1', {
      signal: controller.signal,
    });
    const [, options] = client.get.mock.calls[0] as unknown as [string, { signal?: AbortSignal }];
    expect(options?.signal).toBe(controller.signal);
    expect(options?.signal?.aborted).toBe(true);
  });

  it('forwards timeout from PaymentLinks.retrieve', async () => {
    const client = helperClient();
    await new PaymentLinksResource(client as never, 'https://pay.example').retrieve('tok_1', {
      timeout: 2500,
    });
    expect(client.get).toHaveBeenCalledWith(
      '/v1/payment-links/tok_1',
      expect.objectContaining({ timeout: 2500 }),
    );
  });

  it('forwards idempotencyKey from ApiKeys.create', async () => {
    const client = requestClient();
    await new ApiKeysResource(client as never).create(
      { name: 'k', environment: 'test' },
      { idempotencyKey: 'key_123' },
    );
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'key_123' }),
    );
  });

  it('aborts Webhooks.sendTest via signal', async () => {
    const client = helperClient();
    const controller = new AbortController();
    controller.abort();
    await new WebhooksResource(client as never).sendTest('wh_1', {
      signal: controller.signal,
    });
    const [, , options] = client.post.mock.calls[0] as unknown as [
      string,
      unknown,
      { signal?: AbortSignal },
    ];
    expect(options?.signal).toBe(controller.signal);
    expect(options?.signal?.aborted).toBe(true);
  });
});
