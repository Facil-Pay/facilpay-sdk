import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebhooksResource } from './webhooks';
import type { HttpClient } from '../http/client';

function createMockHttp(): HttpClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as HttpClient;
}

describe('WebhooksResource', () => {
  let http: HttpClient;
  let webhooks: WebhooksResource;

  beforeEach(() => {
    http = createMockHttp();
    webhooks = new WebhooksResource(http);
  });

  it('create posts to /v1/webhooks', async () => {
    const params = { url: 'https://example.com/hook', events: ['payment.succeeded'] as const };
    await webhooks.create({ url: params.url, events: [...params.events] });
    expect(http.post).toHaveBeenCalledWith(
      '/v1/webhooks',
      {
        url: params.url,
        events: [...params.events],
      },
      undefined,
    );
  });

  it('list gets /v1/webhooks', async () => {
    await webhooks.list();
    expect(http.get).toHaveBeenCalledWith('/v1/webhooks', undefined);
  });

  it('retrieve gets /v1/webhooks/:id', async () => {
    await webhooks.retrieve('wh_123');
    expect(http.get).toHaveBeenCalledWith('/v1/webhooks/wh_123', undefined);
  });

  it('listDeliveries gets /v1/webhooks/:id/deliveries with params', async () => {
    await webhooks.listDeliveries('wh_123', { page: 2, limit: 25 });
    expect(http.get).toHaveBeenCalledWith('/v1/webhooks/wh_123/deliveries', {
      params: { page: 2, limit: 25 },
    });
  });

  it('listDeliveries works without params', async () => {
    await webhooks.listDeliveries('wh_123');
    expect(http.get).toHaveBeenCalledWith('/v1/webhooks/wh_123/deliveries', {
      params: undefined,
    });
  });

  it('update patches /v1/webhooks/:id', async () => {
    const params = { url: 'https://example.com/hook', isActive: false };
    await webhooks.update('wh_123', params);
    expect(http.patch).toHaveBeenCalledWith('/v1/webhooks/wh_123', params, undefined);
  });

  it('delete deletes /v1/webhooks/:id', async () => {
    await webhooks.delete('wh_123');
    expect(http.delete).toHaveBeenCalledWith('/v1/webhooks/wh_123', undefined);
  });

  it('sendTest posts to /v1/webhooks/:id/test', async () => {
    await webhooks.sendTest('wh_123');
    expect(http.post).toHaveBeenCalledWith('/v1/webhooks/wh_123/test', {}, undefined);
  });

  it('rotateSecret posts to /v1/webhooks/:id/rotate-secret', async () => {
    await webhooks.rotateSecret('wh_123');
    expect(http.post).toHaveBeenCalledWith(
      '/v1/webhooks/wh_123/rotate-secret',
      {},
      undefined,
    );
  });

  it('retryDelivery posts to /v1/webhooks/deliveries/:deliveryId/retry', async () => {
    await webhooks.retryDelivery('dlv_123');
    expect(http.post).toHaveBeenCalledWith(
      '/v1/webhooks/deliveries/dlv_123/retry',
      {},
      undefined,
    );
  });
});
