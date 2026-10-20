import { describe, expect, it, vi, beforeEach } from 'vitest';
import { FacilPayValidationError } from '../errors';
import { Stellar } from './stellar';

type MockHttp = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function createMockHttp(): MockHttp {
  return { get: vi.fn(), post: vi.fn(), delete: vi.fn() };
}

describe('Stellar', () => {
  let http: MockHttp;
  let stellar: Stellar;

  beforeEach(() => {
    http = createMockHttp();
    stellar = new Stellar(http as unknown as ConstructorParameters<typeof Stellar>[0]);
  });

  it('balances gets /v1/stellar/balances', async () => {
    http.get.mockResolvedValue([]);
    const result = await stellar.balances();
    expect(http.get).toHaveBeenCalledWith('/v1/stellar/balances', undefined);
    expect(result).toEqual([]);
  });

  it('assets gets /v1/stellar/assets', async () => {
    http.get.mockResolvedValue([]);
    await stellar.assets();
    expect(http.get).toHaveBeenCalledWith('/v1/stellar/assets', undefined);
  });

  it('addTrustline posts to /v1/stellar/assets/trustline', async () => {
    const params = { assetCode: 'USDC', issuer: 'GABC' };
    http.post.mockResolvedValue(undefined);
    await stellar.addTrustline(params);
    expect(http.post).toHaveBeenCalledWith('/v1/stellar/assets/trustline', params, undefined);
  });

  it('addTrustline throws FacilPayValidationError when issuer is missing', () => {
    expect(() => stellar.addTrustline({ assetCode: 'USDC', issuer: '' })).toThrow(
      FacilPayValidationError,
    );
    expect(http.post).not.toHaveBeenCalled();
  });

  it('removeTrustline deletes /v1/stellar/assets/trustline', async () => {
    const params = { assetCode: 'USDC', issuer: 'GABC' };
    http.delete.mockResolvedValue(undefined);
    await stellar.removeTrustline(params);
    expect(http.delete).toHaveBeenCalledWith('/v1/stellar/assets/trustline', { params });
  });

  it('removeTrustline throws FacilPayValidationError when assetCode is missing', () => {
    expect(() => stellar.removeTrustline({ assetCode: '', issuer: 'GABC' })).toThrow(
      FacilPayValidationError,
    );
    expect(http.delete).not.toHaveBeenCalled();
  });

  it('transactions gets /v1/stellar/transactions with params', async () => {
    const params = { status: 'pending', assetCode: 'USDC' };
    http.get.mockResolvedValue([]);
    await stellar.transactions(params);
    expect(http.get).toHaveBeenCalledWith('/v1/stellar/transactions', { params });
  });

  it('signTransaction posts to /v1/stellar/transactions/:id/sign', async () => {
    const params = { signature: 'sig_abc' };
    http.post.mockResolvedValue({ id: 'tx_123' });
    const result = await stellar.signTransaction('tx_123', params);
    expect(http.post).toHaveBeenCalledWith(
      '/v1/stellar/transactions/tx_123/sign',
      params,
      undefined,
    );
    expect(result).toEqual({ id: 'tx_123' });
  });

  it('signTransaction throws FacilPayValidationError without id or signature', () => {
    expect(() => stellar.signTransaction('', { signature: 'sig' })).toThrow(
      FacilPayValidationError,
    );
    expect(() => stellar.signTransaction('tx_123', { signature: '' })).toThrow(
      FacilPayValidationError,
    );
    expect(http.post).not.toHaveBeenCalled();
  });

  it('mode gets /v1/stellar/mode', async () => {
    http.get.mockResolvedValue({ mode: 'testnet' });
    const result = await stellar.mode();
    expect(http.get).toHaveBeenCalledWith('/v1/stellar/mode', undefined);
    expect(result).toEqual({ mode: 'testnet' });
  });

  it('fundTestnet posts to /v1/stellar/fund-testnet', async () => {
    const params = { address: 'GABC' };
    http.post.mockResolvedValue({ address: 'GABC' });
    const result = await stellar.fundTestnet(params);
    expect(http.post).toHaveBeenCalledWith('/v1/stellar/fund-testnet', params, undefined);
    expect(result).toEqual({ address: 'GABC' });
  });

  it('fundTestnet refuses to run with a live key', () => {
    const live = new Stellar(
      http as unknown as ConstructorParameters<typeof Stellar>[0],
      'fp_live_abc123',
    );
    expect(() => live.fundTestnet({ address: 'GABC' })).toThrow(FacilPayValidationError);
    expect(http.post).not.toHaveBeenCalled();
  });

  it('fundTestnet throws FacilPayValidationError without an address', () => {
    expect(() => stellar.fundTestnet({ address: '' })).toThrow(FacilPayValidationError);
    expect(http.post).not.toHaveBeenCalled();
  });
});
