import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Payments } from './payments';

function createMockHttp() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    getPage: vi.fn(),
  } as unknown as {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    getPage: ReturnType<typeof vi.fn>;
  };
}

describe('Payments list/retrieve/cancel', () => {
  let http: ReturnType<typeof createMockHttp>;
  let payments: Payments;

  beforeEach(() => {
    http = createMockHttp();
    payments = new Payments(http as never);
  });

  it('retrieve(id) GETs /v1/payments/:id', async () => {
    const payment = { id: 'pay_123' };
    http.get.mockResolvedValue(payment);

    await expect(payments.retrieve('pay_123')).resolves.toEqual(payment);
    expect(http.get).toHaveBeenCalledWith('/v1/payments/pay_123', undefined);
  });

  it('retrieve URL-encodes the id', async () => {
    http.get.mockResolvedValue({});
    await payments.retrieve('pay/123');
    expect(http.get).toHaveBeenCalledWith('/v1/payments/pay%2F123', undefined);
  });

  it('list(params) GETs /v1/payments with filters and pagination', async () => {
    const page = { data: [{ id: 'pay_1' }] };
    http.getPage.mockResolvedValue(page);

    const params = { status: 'succeeded', page: 2, limit: 20, sortOrder: 'desc' as const };
    await expect(payments.list(params)).resolves.toEqual(page);
    expect(http.getPage).toHaveBeenCalledWith('/v1/payments', params, undefined);
  });

  it('cancel(id) POSTs /v1/payments/:id/cancel', async () => {
    const payment = { id: 'pay_123', status: 'cancelled' };
    http.post.mockResolvedValue(payment);

    await expect(payments.cancel('pay_123')).resolves.toEqual(payment);
    expect(http.post).toHaveBeenCalledWith('/v1/payments/pay_123/cancel', undefined, undefined);
  });

  it('forwards testMode as x-test-mode header', async () => {
    http.get.mockResolvedValue({});
    http.post.mockResolvedValue({});
    await payments.retrieve('pay_123', { testMode: true });
    await payments.cancel('pay_123', { testMode: true });
    expect(http.get).toHaveBeenCalledWith('/v1/payments/pay_123', {
      testMode: true,
      headers: { 'x-test-mode': 'true' },
    });
    expect(http.post).toHaveBeenCalledWith('/v1/payments/pay_123/cancel', undefined, {
      testMode: true,
      headers: { 'x-test-mode': 'true' },
    });
  });
});
