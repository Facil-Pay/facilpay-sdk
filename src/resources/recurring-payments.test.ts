import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RecurringPaymentsResource } from './recurring-payments';
import { FacilPayError } from '../errors';

function createMockHttp() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  } as unknown as {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
  };
}

describe('RecurringPaymentsResource', () => {
  let http: ReturnType<typeof createMockHttp>;
  let recurring: RecurringPaymentsResource;

  beforeEach(() => {
    http = createMockHttp();
    recurring = new RecurringPaymentsResource(http as never);
  });

  it('create posts to /v1/recurring-payments', async () => {
    const sub = { id: 'rp_1' };
    http.post.mockResolvedValue(sub);
    const params = { customerId: 'cus_1', amount: 100, currency: 'EUR', interval: 'monthly' as const };
    await expect(recurring.create(params)).resolves.toEqual(sub);
    expect(http.post).toHaveBeenCalledWith('/v1/recurring-payments', params);
  });

  it('list gets /v1/recurring-payments with params', async () => {
    const page = { data: [] };
    http.get.mockResolvedValue(page);
    await expect(recurring.list({ status: 'active' })).resolves.toEqual(page);
    expect(http.get).toHaveBeenCalledWith('/v1/recurring-payments', {
      params: { status: 'active' },
    });
  });

  it('retrieve gets /v1/recurring-payments/:id', async () => {
    const sub = { id: 'rp_1' };
    http.get.mockResolvedValue(sub);
    await expect(recurring.retrieve('rp_1')).resolves.toEqual(sub);
    expect(http.get).toHaveBeenCalledWith('/v1/recurring-payments/rp_1');
  });

  it('update patches /v1/recurring-payments/:id', async () => {
    const sub = { id: 'rp_1' };
    http.patch.mockResolvedValue(sub);
    await expect(recurring.update('rp_1', { amount: 200 })).resolves.toEqual(sub);
    expect(http.patch).toHaveBeenCalledWith('/v1/recurring-payments/rp_1', { amount: 200 });
  });

  it.each([
    ['pause', '/v1/recurring-payments/rp_1/pause'],
    ['resume', '/v1/recurring-payments/rp_1/resume'],
    ['cancel', '/v1/recurring-payments/rp_1/cancel'],
  ] as const)('%s posts to %s', async (action, path) => {
    const sub = { id: 'rp_1' };
    http.post.mockResolvedValue(sub);
    await expect(recurring[action]('rp_1')).resolves.toEqual(sub);
    expect(http.post).toHaveBeenCalledWith(path);
  });

  it('maps an invalid pause transition to a descriptive API error', async () => {
    http.post.mockRejectedValue({
      status: 409,
      currentStatus: 'cancelled',
      message: 'invalid state transition',
    });
    await expect(recurring.pause('rp_1')).rejects.toThrow(FacilPayError);
    await expect(recurring.pause('rp_1')).rejects.toThrow(
      'Cannot pause a cancelled recurring payment.',
    );
  });

  it('maps an invalid resume transition to a descriptive API error', async () => {
    http.post.mockRejectedValue({
      status: 409,
      currentStatus: 'completed',
      message: 'invalid state transition',
    });
    await expect(recurring.resume('rp_1')).rejects.toThrow(
      'Cannot resume a completed recurring payment.',
    );
  });

  it('maps an invalid cancel transition to a descriptive API error', async () => {
    http.post.mockRejectedValue({
      status: 409,
      currentStatus: 'cancelled',
      message: 'state conflict',
    });
    await expect(recurring.cancel('rp_1')).rejects.toThrow(
      'Recurring payment is already cancelled.',
    );
  });

  it('rethrows non-transition errors unchanged', async () => {
    const cause = new Error('network down');
    http.post.mockRejectedValue(cause);
    await expect(recurring.cancel('rp_1')).rejects.toBe(cause);
  });
});
