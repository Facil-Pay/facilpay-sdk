import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentLinksResource } from './payment-links';

function createMockHttp() {
  return {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  } as unknown as {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
}

describe('PaymentLinksResource', () => {
  let http: ReturnType<typeof createMockHttp>;
  let links: PaymentLinksResource;

  beforeEach(() => {
    http = createMockHttp();
    links = new PaymentLinksResource(http as never, 'https://pay.facilpay.io');
  });

  it('create posts to /v1/payment-links', async () => {
    const link = { id: 'pl_1' };
    http.post.mockResolvedValue(link);
    await expect(
      links.create({ amount: 100, currency: 'EUR', description: 'Order' }),
    ).resolves.toEqual(link);
    expect(http.post).toHaveBeenCalledWith('/v1/payment-links', {
      amount: 100,
      currency: 'EUR',
      description: 'Order',
    });
  });

  it('list gets /v1/payment-links with query params', async () => {
    const page = { data: [] };
    http.get.mockResolvedValue(page);
    await expect(links.list({ page: 2, limit: 10 })).resolves.toEqual(page);
    expect(http.get).toHaveBeenCalledWith('/v1/payment-links', {
      query: { page: 2, limit: 10 },
    });
  });

  it('retrieve gets /v1/payment-links/:token', async () => {
    const link = { id: 'pl_1' };
    http.get.mockResolvedValue(link);
    await expect(links.retrieve('tok_123')).resolves.toEqual(link);
    expect(http.get).toHaveBeenCalledWith('/v1/payment-links/tok_123');
  });

  it('update patches /v1/payment-links/:id', async () => {
    const link = { id: 'pl_1' };
    http.patch.mockResolvedValue(link);
    await expect(links.update('pl_1', { amount: 200 })).resolves.toEqual(link);
    expect(http.patch).toHaveBeenCalledWith('/v1/payment-links/pl_1', { amount: 200 });
  });

  it('deactivate deletes /v1/payment-links/:id', async () => {
    const link = { id: 'pl_1', active: false };
    http.delete.mockResolvedValue(link);
    await expect(links.deactivate('pl_1')).resolves.toEqual(link);
    expect(http.delete).toHaveBeenCalledWith('/v1/payment-links/pl_1');
  });

  it('redeem posts to /v1/payment-links/:token/redeem', async () => {
    const link = { id: 'pl_1' };
    http.post.mockResolvedValue(link);
    await expect(links.redeem('tok_123', { email: 'a@b.c' })).resolves.toEqual(link);
    expect(http.post).toHaveBeenCalledWith('/v1/payment-links/tok_123/redeem', {
      email: 'a@b.c',
    });
  });

  it('getQrCode gets /v1/payment-links/:token/qr', async () => {
    const qr = { token: 'tok_123', url: 'https://example.com/qr' };
    http.get.mockResolvedValue(qr);
    await expect(links.getQrCode('tok_123')).resolves.toEqual(qr);
    expect(http.get).toHaveBeenCalledWith('/v1/payment-links/tok_123/qr');
  });

  describe('checkoutUrl', () => {
    it('builds the checkout URL for test and live base URLs', () => {
      const test = new PaymentLinksResource(http as never, 'https://pay-test.facilpay.io');
      const live = new PaymentLinksResource(http as never, 'https://pay.facilpay.io');
      expect(test.checkoutUrl('tok_123')).toBe('https://pay-test.facilpay.io/pay/tok_123');
      expect(live.checkoutUrl('tok_123')).toBe('https://pay.facilpay.io/pay/tok_123');
    });

    it('supports custom base URLs and strips trailing slashes', () => {
      const custom = new PaymentLinksResource(http as never, 'https://custom.example.com/');
      expect(custom.checkoutUrl('tok_123')).toBe('https://custom.example.com/pay/tok_123');
    });

    it('embeds the token verbatim', () => {
      expect(links.checkoutUrl('tok_abc-123_XYZ')).toBe(
        'https://pay.facilpay.io/pay/tok_abc-123_XYZ',
      );
    });
  });
});
