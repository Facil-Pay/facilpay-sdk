import { WebhooksResource } from './webhooks';
import type { HttpClient } from '../http/client';

function createMockHttp(): HttpClient {
  return {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
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
    expect(http.post).toHaveBeenCalledWith('/v1/webhooks', {
      url: params.url,
      events: [...params.events],
    });
  });

  it('list gets /v1/webhooks', async () => {
    await webhooks.list();
    expect(http.get).toHaveBeenCalledWith('/v1/webhooks');
  });

  it('update patches /v1/webhooks/:id', async () => {
    const params = { url: 'https://example.com/hook', isActive: false };
    await webhooks.update('wh_123', params);
    expect(http.patch).toHaveBeenCalledWith('/v1/webhooks/wh_123', params);
  });

  it('delete deletes /v1/webhooks/:id', async () => {
    await webhooks.delete('wh_123');
    expect(http.delete).toHaveBeenCalledWith('/v1/webhooks/wh_123');
  });

  it('sendTest posts to /v1/webhooks/:id/test', async () => {
    await webhooks.sendTest('wh_123');
    expect(http.post).toHaveBeenCalledWith('/v1/webhooks/wh_123/test', {});
  });

  it('rotateSecret posts to /v1/webhooks/:id/rotate-secret', async () => {
    await webhooks.rotateSecret('wh_123');
    expect(http.post).toHaveBeenCalledWith('/v1/webhooks/wh_123/rotate-secret', {});
  });

  it('retryDelivery posts to /v1/webhooks/deliveries/:deliveryId/retry', async () => {
    await webhooks.retryDelivery('dlv_123');
    expect(http.post).toHaveBeenCalledWith('/v1/webhooks/deliveries/dlv_123/retry', {});
  });
});
