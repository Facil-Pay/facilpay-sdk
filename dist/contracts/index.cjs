'use strict';

var stellarSdk = require('@stellar/stellar-sdk');

// src/contracts/payment.ts
var FACILPAY_CONTRACT_ERRORS = {
  1: "Unauthorized",
  2: "PaymentNotFound",
  3: "PaymentAlreadyCompleted",
  4: "PaymentExpired",
  5: "InvalidAmount",
  6: "TokenNotAllowed",
  7: "InsufficientBalance",
  8: "InvalidStatus",
  9: "RefundNotAllowed",
  10: "InstallmentNotDue"
};
var FacilPayContractError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = code !== void 0 ? FACILPAY_CONTRACT_ERRORS[code] ?? "FacilPayContractError" : "FacilPayContractError";
  }
};
var NETWORK_PASSPHRASES = {
  mainnet: stellarSdk.Networks.PUBLIC,
  testnet: stellarSdk.Networks.TESTNET,
  futurenet: stellarSdk.Networks.FUTURENET,
  local: stellarSdk.Networks.STANDALONE
};
function toI128(value) {
  return stellarSdk.nativeToScVal(value, { type: "i128" });
}
function decodePayment(raw) {
  const value = raw;
  return {
    id: BigInt(value.id),
    customer: String(value.customer),
    merchant: String(value.merchant),
    token: String(value.token),
    amount: BigInt(value.amount),
    status: String(value.status),
    createdAt: BigInt(value.created_at),
    expiresAt: BigInt(value.expires_at)
  };
}
var PaymentContract = class {
  constructor(options) {
    this.contractId = options.contractId;
    this.network = options.network;
    this.rpcUrl = options.rpcUrl;
    this.networkPassphrase = options.networkPassphrase ?? NETWORK_PASSPHRASES[options.network];
    this.server = new stellarSdk.SorobanRpc.Server(this.rpcUrl);
    this.contract = new stellarSdk.Contract(this.contractId);
  }
  /** Builds an unsigned transaction for a customer-facing contract call. */
  async buildUnsigned(source, method, args) {
    const account = await this.server.getAccount(source);
    return new stellarSdk.TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this.networkPassphrase
    }).addOperation(this.contract.call(method, ...args)).setTimeout(30).build();
  }
  /** Simulates a read-only contract call and returns the decoded value. */
  async simulate(source, method, args) {
    const account = new stellarSdk.Account(source, "0");
    const tx = new stellarSdk.TransactionBuilder(account, {
      fee: "100",
      networkPassphrase: this.networkPassphrase
    }).addOperation(this.contract.call(method, ...args)).setTimeout(30).build();
    const response = await this.server.simulateTransaction(tx);
    if (stellarSdk.SorobanRpc.Api.isSimulationError(response)) {
      throw this.toError(response.error);
    }
    const retval = response.result?.retval;
    return retval ? stellarSdk.scValToNative(retval) : void 0;
  }
  toError(raw) {
    const match = /Error\((?:Contract, )?(\d+)\)/.exec(raw);
    const code = match ? Number(match[1]) : void 0;
    return new FacilPayContractError(raw, code);
  }
  // --- Customer-facing (unsigned) methods ---
  async createPayment(params) {
    return this.buildUnsigned(params.customer, "create_payment", [
      new stellarSdk.Address(params.customer).toScVal(),
      new stellarSdk.Address(params.merchant).toScVal(),
      new stellarSdk.Address(params.token).toScVal(),
      toI128(params.amount),
      stellarSdk.nativeToScVal(params.expiresAt ?? 0n, { type: "u64" })
    ]);
  }
  async payInstallment(params) {
    return this.buildUnsigned(params.payer, "pay_installment", [
      stellarSdk.nativeToScVal(params.paymentId, { type: "u64" }),
      new stellarSdk.Address(params.payer).toScVal(),
      toI128(params.amount)
    ]);
  }
  async cancelPayment(params) {
    return this.buildUnsigned(params.caller, "cancel_payment", [
      stellarSdk.nativeToScVal(params.paymentId, { type: "u64" }),
      new stellarSdk.Address(params.caller).toScVal()
    ]);
  }
  // --- Read-only methods ---
  async getPayment(paymentId, source) {
    const raw = await this.simulate(source, "get_payment", [
      stellarSdk.nativeToScVal(paymentId, { type: "u64" })
    ]);
    return decodePayment(raw);
  }
  async getPaymentsByCustomer(customer, source) {
    const raw = await this.simulate(source, "get_payments_by_customer", [
      new stellarSdk.Address(customer).toScVal()
    ]);
    return (raw ?? []).map(decodePayment);
  }
  async getPaymentsByMerchant(merchant, source) {
    const raw = await this.simulate(source, "get_payments_by_merchant", [
      new stellarSdk.Address(merchant).toScVal()
    ]);
    return (raw ?? []).map(decodePayment);
  }
  async getAllowedTokens(source) {
    const raw = await this.simulate(source, "get_allowed_tokens", []);
    return (raw ?? []).map((token) => String(token));
  }
  async isPaymentExpired(paymentId, source) {
    return this.simulate(source, "is_payment_expired", [
      stellarSdk.nativeToScVal(paymentId, { type: "u64" })
    ]);
  }
  // --- Submission ---
  /**
   * Submits a signed transaction and polls until it succeeds or fails.
   * Returns the decoded result and the transaction hash.
   */
  async submit(signedXdr) {
    const tx = stellarSdk.TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase);
    const sent = await this.server.sendTransaction(tx);
    if (sent.status === "ERROR") {
      throw this.toError(JSON.stringify(sent.errorResult ?? sent.status));
    }
    let response = await this.server.getTransaction(sent.hash);
    while (response.status === stellarSdk.SorobanRpc.Api.GetTransactionStatus.NOT_FOUND) {
      await new Promise((resolve) => setTimeout(resolve, 1e3));
      response = await this.server.getTransaction(sent.hash);
    }
    if (response.status === stellarSdk.SorobanRpc.Api.GetTransactionStatus.FAILED) {
      throw this.toError(`Transaction failed: ${sent.hash}`);
    }
    const retval = response.returnValue;
    return {
      hash: sent.hash,
      status: "SUCCESS",
      result: retval ? stellarSdk.scValToNative(retval) : void 0
    };
  }
};

Object.defineProperty(exports, "Account", {
  enumerable: true,
  get: function () { return stellarSdk.Account; }
});
Object.defineProperty(exports, "Address", {
  enumerable: true,
  get: function () { return stellarSdk.Address; }
});
Object.defineProperty(exports, "Keypair", {
  enumerable: true,
  get: function () { return stellarSdk.Keypair; }
});
Object.defineProperty(exports, "Networks", {
  enumerable: true,
  get: function () { return stellarSdk.Networks; }
});
Object.defineProperty(exports, "Transaction", {
  enumerable: true,
  get: function () { return stellarSdk.Transaction; }
});
exports.FACILPAY_CONTRACT_ERRORS = FACILPAY_CONTRACT_ERRORS;
exports.FacilPayContractError = FacilPayContractError;
exports.PaymentContract = PaymentContract;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map