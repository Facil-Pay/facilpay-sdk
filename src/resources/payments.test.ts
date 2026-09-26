import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentsResource } from './payments';
import type { HttpClient } from '../http';

function createMockHttp() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as HttpClient & {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };
}

describe('PaymentsResource', () => {
  let http: ReturnType<typeof createMockHttp>;
  let payments: PaymentsResource;

  beforeEach(() => {
    http = createMockHttp();
    payments = new PaymentsResource(http);
  });

  describe('createBulk', () => {
    it('posts items to /v1/payments/bulk and returns per-item results', async () => {
      const items = [{ amount: 100 }, { amount: 200 }];
      const response = {
        successes: [{ id: 'pay_1', amount: 100 }],
        failures: [{ index: 1, error: 'invalid amount' }],
      };
      http.post.mockResolvedValue(response);

      const result = await payments.createBulk(items);

      expect(http.post).toHaveBeenCalledWith('/v1/payments/bulk', { items });
      expect(result).toEqual(response);
    });

    it('surfaces partial failures without throwing for the whole batch', async () => {
      const response = {
        successes: [],
        failures: [{ index: 0, error: 'card declined' }],
      };
      http.post.mockResolvedValue(response);

      await expect(payments.createBulk([{ amount: 100 }])).resolves.toEqual(response);
    });
  });

  describe('export', () => {
    it('requests CSV text from /v1/payments/export', async () => {
      const csv = 'id,amount\npay_1,100\n';
      http.get.mockResolvedValue(csv);

      const result = await payments.export({ from: '2024-01-01' });

      expect(http.get).toHaveBeenCalledWith('/v1/payments/export', {
        params: { from: '2024-01-01' },
        responseType: 'text',
      });
      expect(result).toBe(csv);
    });
  });

  describe('timeline', () => {
    it('fetches the payment timeline', async () => {
      const timeline = [{ status: 'created', at: '2024-01-01T00:00:00Z' }];
      http.get.mockResolvedValue(timeline);

      const result = await payments.timeline('pay_1');

      expect(http.get).toHaveBeenCalledWith('/v1/payments/pay_1/timeline');
      expect(result).toEqual(timeline);
    });
  });

  describe('invoice', () => {
    it('fetches the payment invoice', async () => {
      const invoice = { id: 'inv_1', url: 'https://example.com/inv_1' };
      http.get.mockResolvedValue(invoice);

      const result = await payments.invoice('pay_1');

      expect(http.get).toHaveBeenCalledWith('/v1/payments/pay_1/invoice');
      expect(result).toEqual(invoice);
    });
  });

  describe('publicInvoice', () => {
    it('fetches a public invoice by token without auth', async () => {
      const invoice = { id: 'inv_1', token: 'tok_1' };
      http.get.mockResolvedValue(invoice);

      const result = await payments.publicInvoice('tok_1');

      expect(http.get).toHaveBeenCalledWith('/v1/payments/invoice/tok_1', {
        auth: false,
      });
      expect(result).toEqual(invoice);
    });
  });

  describe('getQrCode', () => {
    it('returns a data URL when the response is JSON', async () => {
      const dataUrl = 'data:image/png;base64,AAAA';
      http.get.mockResolvedValue({ dataUrl });

      const result = await payments.getQrCode('pay_1', { format: 'png' });

      expect(http.get).toHaveBeenCalledWith('/v1/payments/pay_1/qr', {
        params: { format: 'png' },
      });
      expect(result).toBe(dataUrl);
    });

    it('returns raw bytes when the response is binary', async () => {
      const bytes = new Uint8Array([137, 80, 78, 71]);
      http.get.mockResolvedValue(bytes);

      const result = await payments.getQrCode('pay_1', { format: 'png' });

      expect(result).toBe(bytes);
    });
  });
});
