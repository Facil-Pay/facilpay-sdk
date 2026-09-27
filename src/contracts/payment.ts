import {
  Account,
  Address,
  Contract,
  Keypair,
  Networks,
  Operation,
  SorobanRpc,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

/**
 * FacilPay payment contract bindings.
 *
 * This module lives behind the `@facilpay/sdk/contracts` entry point so that
 * REST-only consumers of `@facilpay/sdk` never pull in `@stellar/stellar-sdk`.
 *
 * Amounts are represented as `bigint` (Soroban `i128`). FacilPay tokens use
 * 7 decimals of precision, so `1_0000000n` equals `1.0` token.
 */

export type FacilPayNetwork = 'mainnet' | 'testnet' | 'futurenet' | 'local';

export interface PaymentContractOptions {
  /** Deployed payment contract id (C...). */
  contractId: string;
  /** Target network. */
  network: FacilPayNetwork;
  /** Soroban RPC endpoint. */
  rpcUrl: string;
  /** Optional network passphrase override (defaults derived from `network`). */
  networkPassphrase?: string;
}

export interface Payment {
  id: bigint;
  customer: string;
  merchant: string;
  token: string;
  amount: bigint;
  status: string;
  createdAt: bigint;
  expiresAt: bigint;
}

export interface CreatePaymentParams {
  customer: string;
  merchant: string;
  token: string;
  amount: bigint;
  expiresAt?: bigint;
}

export interface PayInstallmentParams {
  paymentId: bigint;
  payer: string;
  amount: bigint;
}

export interface CancelPaymentParams {
  paymentId: bigint;
  caller: string;
}

export interface SubmitResult {
  hash: string;
  status: 'SUCCESS' | 'FAILED';
  result?: unknown;
}

/** Contract error codes mapped to readable names. */
export const FACILPAY_CONTRACT_ERRORS: Record<number, string> = {
  1: 'Unauthorized',
  2: 'PaymentNotFound',
  3: 'PaymentAlreadyCompleted',
  4: 'PaymentExpired',
  5: 'InvalidAmount',
  6: 'TokenNotAllowed',
  7: 'InsufficientBalance',
  8: 'InvalidStatus',
  9: 'RefundNotAllowed',
  10: 'InstallmentNotDue',
};

/** Error thrown for contract failures, with a readable name. */
export class FacilPayContractError extends Error {
  readonly code?: number;
  readonly name: string;

  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
    this.name = code !== undefined ? FACILPAY_CONTRACT_ERRORS[code] ?? 'FacilPayContractError' : 'FacilPayContractError';
  }
}

const NETWORK_PASSPHRASES: Record<FacilPayNetwork, string> = {
  mainnet: Networks.PUBLIC,
  testnet: Networks.TESTNET,
  futurenet: Networks.FUTURENET,
  local: Networks.STANDALONE,
};

function toI128(value: bigint): xdr.ScVal {
  return nativeToScVal(value, { type: 'i128' });
}

function decodePayment(raw: unknown): Payment {
  const value = raw as Record<string, unknown>;
  return {
    id: BigInt(value.id as bigint),
    customer: String(value.customer),
    merchant: String(value.merchant),
    token: String(value.token),
    amount: BigInt(value.amount as bigint),
    status: String(value.status),
    createdAt: BigInt(value.created_at as bigint),
    expiresAt: BigInt(value.expires_at as bigint),
  };
}

/**
 * Ergonomic wrapper around the FacilPay payment contract.
 *
 * Customer-facing methods return an unsigned, assembled transaction for the
 * user's wallet to sign; read-only methods simulate and return decoded values.
 */
export class PaymentContract {
  readonly contractId: string;
  readonly network: FacilPayNetwork;
  readonly rpcUrl: string;
  readonly networkPassphrase: string;

  private readonly server: SorobanRpc.Server;
  private readonly contract: Contract;

  constructor(options: PaymentContractOptions) {
    this.contractId = options.contractId;
    this.network = options.network;
    this.rpcUrl = options.rpcUrl;
    this.networkPassphrase = options.networkPassphrase ?? NETWORK_PASSPHRASES[options.network];
    this.server = new SorobanRpc.Server(this.rpcUrl);
    this.contract = new Contract(this.contractId);
  }

  /** Builds an unsigned transaction for a customer-facing contract call. */
  private async buildUnsigned(
    source: string,
    method: string,
    args: xdr.ScVal[],
  ): Promise<Transaction> {
    const account = await this.server.getAccount(source);
    return new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();
  }

  /** Simulates a read-only contract call and returns the decoded value. */
  private async simulate<T>(source: string, method: string, args: xdr.ScVal[]): Promise<T> {
    const account = new Account(source, '0');
    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const response = await this.server.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(response)) {
      throw this.toError(response.error);
    }
    const retval = (response as SorobanRpc.Api.SimulateTransactionSuccessResponse).result?.retval;
    return (retval ? scValToNative(retval) : undefined) as T;
  }

  private toError(raw: string): FacilPayContractError {
    const match = /Error\((?:Contract, )?(\d+)\)/.exec(raw);
    const code = match ? Number(match[1]) : undefined;
    return new FacilPayContractError(raw, code);
  }

  // --- Customer-facing (unsigned) methods ---

  async createPayment(params: CreatePaymentParams): Promise<Transaction> {
    return this.buildUnsigned(params.customer, 'create_payment', [
      new Address(params.customer).toScVal(),
      new Address(params.merchant).toScVal(),
      new Address(params.token).toScVal(),
      toI128(params.amount),
      nativeToScVal(params.expiresAt ?? 0n, { type: 'u64' }),
    ]);
  }

  async payInstallment(params: PayInstallmentParams): Promise<Transaction> {
    return this.buildUnsigned(params.payer, 'pay_installment', [
      nativeToScVal(params.paymentId, { type: 'u64' }),
      new Address(params.payer).toScVal(),
      toI128(params.amount),
    ]);
  }

  async cancelPayment(params: CancelPaymentParams): Promise<Transaction> {
    return this.buildUnsigned(params.caller, 'cancel_payment', [
      nativeToScVal(params.paymentId, { type: 'u64' }),
      new Address(params.caller).toScVal(),
    ]);
  }

  // --- Read-only methods ---

  async getPayment(paymentId: bigint, source: string): Promise<Payment> {
    const raw = await this.simulate<unknown>(source, 'get_payment', [
      nativeToScVal(paymentId, { type: 'u64' }),
    ]);
    return decodePayment(raw);
  }

  async getPaymentsByCustomer(customer: string, source: string): Promise<Payment[]> {
    const raw = await this.simulate<unknown[]>(source, 'get_payments_by_customer', [
      new Address(customer).toScVal(),
    ]);
    return (raw ?? []).map(decodePayment);
  }

  async getPaymentsByMerchant(merchant: string, source: string): Promise<Payment[]> {
    const raw = await this.simulate<unknown[]>(source, 'get_payments_by_merchant', [
      new Address(merchant).toScVal(),
    ]);
    return (raw ?? []).map(decodePayment);
  }

  async getAllowedTokens(source: string): Promise<string[]> {
    const raw = await this.simulate<unknown[]>(source, 'get_allowed_tokens', []);
    return (raw ?? []).map((token) => String(token));
  }

  async isPaymentExpired(paymentId: bigint, source: string): Promise<boolean> {
    return this.simulate<boolean>(source, 'is_payment_expired', [
      nativeToScVal(paymentId, { type: 'u64' }),
    ]);
  }

  // --- Submission ---

  /**
   * Submits a signed transaction and polls until it succeeds or fails.
   * Returns the decoded result and the transaction hash.
   */
  async submit(signedXdr: string): Promise<SubmitResult> {
    const tx = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase) as Transaction;
    const sent = await this.server.sendTransaction(tx);

    if (sent.status === 'ERROR') {
      throw this.toError(JSON.stringify(sent.errorResult ?? sent.status));
    }

    let response = await this.server.getTransaction(sent.hash);
    while (response.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      response = await this.server.getTransaction(sent.hash);
    }

    if (response.status === SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw this.toError(`Transaction failed: ${sent.hash}`);
    }

    const retval = (response as SorobanRpc.Api.GetSuccessfulTransactionResponse).returnValue;
    return {
      hash: sent.hash,
      status: 'SUCCESS',
      result: retval ? scValToNative(retval) : undefined,
    };
  }
}

export default PaymentContract;
