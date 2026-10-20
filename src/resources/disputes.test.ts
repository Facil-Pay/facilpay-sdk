import { describe, expect, it, vi, beforeEach } from 'vitest';
import { DisputesResource } from './disputes';
import { FacilPayAPIError } from '../core/errors';

type MockClient = {
  request: ReturnType<typeof vi.fn>;
};

function createMockClient(): MockClient {
  return { request: vi.fn() };
}

describe('DisputesResource', () => {
  let client: MockClient;
  let disputes: DisputesResource;

  beforeEach(() => {
    client = createMockClient();
    disputes = new DisputesResource(
      client as unknown as ConstructorParameters<typeof DisputesResource>[0],
    );
  });

  it('create posts to /v1/payments/:id/dispute with the body', async () => {
    const body = { reason: 'fraudulent', amount: 100, currency: 'USD' };
    client.request.mockResolvedValue({ id: 'dsp_123' });

    const result = await disputes.create('pay_123', body);

    expect(client.request).toHaveBeenCalledWith({
      method: 'POST',
      path: '/v1/payments/pay_123/dispute',
      body,
    });
    expect(result).toEqual({ id: 'dsp_123' });
  });

  it('list gets /v1/disputes with query params', async () => {
    const params = { paymentId: 'pay_123', status: 'OPENED' as const, page: 2, limit: 10 };
    client.request.mockResolvedValue({ data: [] });

    await disputes.list(params);

    expect(client.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/v1/disputes',
      query: params,
    });
  });

  it('list works without params', async () => {
    client.request.mockResolvedValue({ data: [] });

    await disputes.list();

    expect(client.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/v1/disputes',
      query: undefined,
    });
  });

  it('retrieve gets /v1/disputes/:id', async () => {
    client.request.mockResolvedValue({ id: 'dsp_123' });

    await disputes.retrieve('dsp_123');

    expect(client.request).toHaveBeenCalledWith({
      method: 'GET',
      path: '/v1/disputes/dsp_123',
    });
  });

  it('update patches /v1/disputes/:id with the body', async () => {
    const body = { status: 'WON' as const, evidence: { note: 'proof' } };
    client.request.mockResolvedValue({ id: 'dsp_123' });

    await disputes.update('dsp_123', body);

    expect(client.request).toHaveBeenCalledWith({
      method: 'PATCH',
      path: '/v1/disputes/dsp_123',
      body,
    });
  });

  it('propagates API errors (404)', async () => {
    const apiError = new FacilPayAPIError('Dispute not found', { status: 404 });
    client.request.mockRejectedValue(apiError);

    await expect(disputes.retrieve('dsp_missing')).rejects.toBe(apiError);
  });
});
