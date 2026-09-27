import { FacilPayValidationError } from '../errors';
import type { HttpClient, RequestOptions } from '../http';

/** A single Stellar balance entry. */
export interface StellarBalance {
  /** Asset code, e.g. `XLM` or `USDC`. */
  assetCode: string;
  /** Issuer account of the asset, omitted for the native asset. */
  issuer?: string;
  /** Balance amount as a string. */
  balance: string;
  /** Optional limit configured on the trustline. */
  limit?: string;
}

/** A single Stellar asset entry. */
export interface StellarAsset {
  /** Asset code, e.g. `USDC`. */
  assetCode: string;
  /** Issuer account of the asset. */
  issuer: string;
  /** Optional human readable name. */
  name?: string;
  /** Optional number of decimal places. */
  decimals?: number;
}

/** Parameters accepted by {@link Stellar.addTrustline} and {@link Stellar.removeTrustline}. */
export interface TrustlineParams {
  /** Asset code of the trustline. */
  assetCode: string;
  /** Issuer account of the asset. */
  issuer: string;
}

/** Filters accepted by {@link Stellar.transactions}. */
export interface ListStellarTransactionsParams {
  /** Filter by transaction status. */
  status?: string;
  /** Filter by asset code. */
  assetCode?: string;
  /** ISO 8601 lower bound. */
  from?: string;
  /** ISO 8601 upper bound. */
  to?: string;
  page?: number;
  limit?: number;
}

/** A single Stellar transaction. */
export interface StellarTransaction {
  id: string;
  /** Transaction hash on the Stellar network. */
  hash?: string;
  status: string;
  /** Whether the transaction still requires additional signatures. */
  multisigRequired?: boolean;
  /** Number of signatures collected so far. */
  multisigSignatures?: number;
  /** Number of signatures required to submit the transaction. */
  multisigThreshold?: number;
  /** ISO 8601 timestamp of creation. */
  createdAt?: string;
}

/** Parameters accepted by {@link Stellar.signTransaction}. */
export interface SignTransactionParams {
  /** Signature to attach to the transaction. */
  signature: string;
  /** Optional public key of the signer. */
  publicKey?: string;
}

/** Response returned by {@link Stellar.mode}. */
export interface StellarMode {
  /** Current Stellar network mode, e.g. `testnet` or `mainnet`. */
  mode: string;
}

/** Parameters accepted by {@link Stellar.fundTestnet}. */
export interface FundTestnetParams {
  /** Stellar address to fund. */
  address: string;
}

/** Response returned by {@link Stellar.fundTestnet}. */
export interface FundTestnetResponse {
  address: string;
  /** Optional transaction hash of the funding operation. */
  hash?: string;
}

/** Per-request options supported by the stellar resource. */
export interface StellarRequestOptions extends RequestOptions {
  /** When true, sends the `x-test-mode: true` header. */
  testMode?: boolean;
}

const LIVE_KEY_PREFIX = 'fp_live_';

function withTestMode(options?: StellarRequestOptions): RequestOptions | undefined {
  if (!options?.testMode) {
    return options;
  }
  return {
    ...options,
    headers: { ...options.headers, 'x-test-mode': 'true' },
  };
}

function validateTrustlineParams(params: TrustlineParams): void {
  if (!params || typeof params.assetCode !== 'string' || params.assetCode.length === 0) {
    throw new FacilPayValidationError('`assetCode` is required.');
  }
  if (typeof params.issuer !== 'string' || params.issuer.length === 0) {
    throw new FacilPayValidationError('`issuer` is required.');
  }
}

/**
 * Stellar resource.
 *
 * Exposed as `facilpay.stellar`.
 */
export class Stellar {
  constructor(
    private readonly http: HttpClient,
    private readonly apiKey?: string,
  ) {}

  /**
   * List the Stellar balances of the account.
   *
   * @example
   * ```ts
   * const balances = await facilpay.stellar.balances();
   * ```
   */
  balances(options?: StellarRequestOptions): Promise<StellarBalance[]> {
    return this.http.get<StellarBalance[]>('/v1/stellar/balances', withTestMode(options));
  }

  /**
   * List the Stellar assets available to the account.
   *
   * @example
   * ```ts
   * const assets = await facilpay.stellar.assets();
   * ```
   */
  assets(options?: StellarRequestOptions): Promise<StellarAsset[]> {
    return this.http.get<StellarAsset[]>('/v1/stellar/assets', withTestMode(options));
  }

  /**
   * Add a trustline for an asset.
   *
   * @example
   * ```ts
   * await facilpay.stellar.addTrustline({ assetCode: 'USDC', issuer: 'G...' });
   * ```
   */
  addTrustline(params: TrustlineParams, options?: StellarRequestOptions): Promise<void> {
    validateTrustlineParams(params);
    return this.http.post<void>('/v1/stellar/assets/trustline', params, withTestMode(options));
  }

  /**
   * Remove a trustline for an asset.
   *
   * @example
   * ```ts
   * await facilpay.stellar.removeTrustline({ assetCode: 'USDC', issuer: 'G...' });
   * ```
   */
  removeTrustline(params: TrustlineParams, options?: StellarRequestOptions): Promise<void> {
    validateTrustlineParams(params);
    return this.http.delete<void>('/v1/stellar/assets/trustline', {
      ...withTestMode(options),
      params,
    });
  }

  /**
   * List Stellar transactions.
   *
   * @example
   * ```ts
   * const transactions = await facilpay.stellar.transactions({ status: 'pending' });
   * ```
   */
  transactions(
    params?: ListStellarTransactionsParams,
    options?: StellarRequestOptions,
  ): Promise<StellarTransaction[]> {
    return this.http.get<StellarTransaction[]>('/v1/stellar/transactions', {
      ...withTestMode(options),
      params,
    });
  }

  /**
   * Attach a signature to a multisig transaction.
   *
   * Multisig progress is reported through the `transaction.multisig_*` webhooks.
   *
   * @example
   * ```ts
   * await facilpay.stellar.signTransaction('tx_123', { signature: '...' });
   * ```
   */
  signTransaction(
    id: string,
    params: SignTransactionParams,
    options?: StellarRequestOptions,
  ): Promise<StellarTransaction> {
    if (!id || typeof id !== 'string') {
      throw new FacilPayValidationError('`id` is required.');
    }
    if (!params || typeof params.signature !== 'string' || params.signature.length === 0) {
      throw new FacilPayValidationError('`signature` is required.');
    }
    return this.http.post<StellarTransaction>(
      `/v1/stellar/transactions/${encodeURIComponent(id)}/sign`,
      params,
      withTestMode(options),
    );
  }

  /**
   * Retrieve the current Stellar network mode.
   *
   * @example
   * ```ts
   * const { mode } = await facilpay.stellar.mode();
   * ```
   */
  mode(options?: StellarRequestOptions): Promise<StellarMode> {
    return this.http.get<StellarMode>('/v1/stellar/mode', withTestMode(options));
  }

  /**
   * Fund a Stellar address on testnet.
   *
   * Only available with a test key. Calling this with a live (`fp_live_`) key
   * throws a {@link FacilPayValidationError} without making a request.
   *
   * @example
   * ```ts
   * await facilpay.stellar.fundTestnet({ address: 'G...' });
   * ```
   */
  fundTestnet(
    params: FundTestnetParams,
    options?: StellarRequestOptions,
  ): Promise<FundTestnetResponse> {
    if (this.apiKey && this.apiKey.startsWith(LIVE_KEY_PREFIX)) {
      throw new FacilPayValidationError(
        '`fundTestnet` is only available with a test key; live keys cannot fund testnet accounts.',
      );
    }
    if (!params || typeof params.address !== 'string' || params.address.length === 0) {
      throw new FacilPayValidationError('`address` is required.');
    }
    return this.http.post<FundTestnetResponse>(
      '/v1/stellar/fund-testnet',
      params,
      withTestMode(options),
    );
  }
}
