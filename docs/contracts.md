# Stellar Contract Integration

The FacilPay SDK provides bindings for interacting with FacilPay's Soroban smart contracts on the Stellar network. This module enables you to create payments, process installments, and manage payment lifecycles directly through Stellar contracts.

## Installation

### Installing the Peer Dependency

The contracts module requires `@stellar/stellar-sdk` as a peer dependency. Install it alongside the SDK:

```bash
npm install @facilpay/sdk @stellar/stellar-sdk
```

Or with peer dependencies allowed to be missing:

```bash
npm install @facilpay/sdk
npm install @stellar/stellar-sdk --save-peer
```

If you're using TypeScript, the types will be included automatically. The contracts are optional — if you only need the REST API client, you can skip the Stellar SDK installation.

## Configuration

### Network Selection

Configure the contract with your target network:

```ts
import { PaymentContract, type FacilPayNetwork } from '@facilpay/sdk/contracts';

const contract = new PaymentContract({
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4', // Your contract ID
  network: 'testnet', // 'mainnet' | 'testnet' | 'futurenet' | 'local'
  rpcUrl: 'https://soroban-testnet.stellar.org',
});
```

### Available Networks

| Network | RPC URL | Use Case |
|---------|---------|----------|
| `testnet` | `https://soroban-testnet.stellar.org` | Development and testing |
| `mainnet` | `https://soroban-mainnet.stellar.org` | Production |
| `futurenet` | `https://rpc-futurenet.stellar.org` | Next-version testing |
| `local` | `http://localhost:8000` | Local standalone node |

### Custom Network Passphrase

If needed, you can override the network passphrase:

```ts
const contract = new PaymentContract({
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
  network: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015', // Override default
});
```

### Getting Contract IDs

The contract ID follows the format `C...` (C address). You can obtain it:

1. **From the FacilPay dashboard** — Navigate to Settings > Contracts
2. **From deployment output** — When deploying via `soroban contract deploy`
3. **From the API** — Call `GET /v1/contracts` to list deployed contracts

## Building Transactions

The contract methods return **unsigned transactions** that must be signed by the user's wallet (e.g., Freighter, Albedo) before submission.

### Creating a Payment

```ts
import { PaymentContract } from '@facilpay/sdk/contracts';

const contract = new PaymentContract({
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
  network: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
});

// Build an unsigned transaction for the customer
const createPaymentTx = await contract.createPayment({
  customer: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890', // Customer's Stellar address
  merchant: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567891', // Merchant's Stellar address
  token: 'CAABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',   // Token contract ID
  amount: 100_0000000n, // 100 XLM (7 decimal precision)
  expiresAt: 86400n,    // Expires in 24 hours (seconds from now)
});

// The transaction is now ready for the user's wallet to sign
const xdr = createPaymentTx.toXDR();
console.log('Transaction XDR:', xdr);
```

### Paying an Installment

```ts
const payInstallmentTx = await contract.payInstallment({
  paymentId: 1n,              // Payment ID from contract state
  payer: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890', // Payer's Stellar address
  amount: 10_0000000n,        // 10 XLM installment
});
```

### Canceling a Payment

```ts
const cancelTx = await contract.cancelPayment({
  paymentId: 1n,
  caller: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890', // Either customer or merchant
});
```

## Simulating Transactions

For read-only operations, use simulation to get the result without submitting a transaction:

```ts
// Get payment details
const payment = await contract.getPayment(1n, 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');
console.log('Payment:', {
  id: payment.id,
  customer: payment.customer,
  amount: payment.amount,
  status: payment.status,
});

// Get all payments for a customer
const customerPayments = await contract.getPaymentsByCustomer(
  'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
  'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890' // Source account for simulation
);

// Get all payments for a merchant
const merchantPayments = await contract.getPaymentsByMerchant(
  'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567891',
  'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
);

// Check allowed tokens
const allowedTokens = await contract.getAllowedTokens('GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');
console.log('Allowed tokens:', allowedTokens);

// Check if a payment is expired
const isExpired = await contract.isPaymentExpired(1n, 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890');
console.log('Payment expired:', isExpired);
```

## Signing and Submitting Transactions

After the user signs the transaction with their wallet, submit it to the network:

```ts
import { Keypair } from '@stellar/stellar-sdk';

// This is what your frontend would receive after the user signs
const signedXdr = '...'; // Signed transaction from wallet

try {
  const result = await contract.submit(signedXdr);
  console.log('Transaction hash:', result.hash);
  console.log('Status:', result.status);
  console.log('Result:', result.result);
} catch (error) {
  if (error instanceof FacilPayContractError) {
    console.error('Contract error:', error.name, error.code);
  } else {
    throw error;
  }
}
```

### Complete Frontend Flow Example

```ts
// 1. Build transaction on server
const createPaymentTx = await contract.createPayment({
  customer: customerAddress,
  merchant: merchantAddress,
  token: tokenContractId,
  amount: BigInt(amount * 10_000_000), // Convert to 7 decimal places
  expiresAt: BigInt(expiresInSeconds),
});

// 2. Send XDR to frontend
const xdr = createPaymentTx.toXDR();
return { xdr };

// 3. Frontend: User signs with wallet (e.g., Freighter)
// const signedXdr = await freighter.signTransaction(xdr);

// 4. Submit signed transaction
const result = await contract.submit(signedXdr);
```

## Testnet Funding

For testing, you can fund Stellar testnet accounts through the FacilPay API:

```ts
import { FacilPay } from '@facilpay/sdk';

const facilpay = new FacilPay({
  apiKey: 'fp_test_...', // Test key only
});

// Fund a testnet account with 10,000 XLM
const response = await facilpay.stellar.fundTestnet({
  address: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
});

console.log('Funded:', response.address);
console.log('Transaction hash:', response.hash);
```

> **Note:** `fundTestnet()` only works with test API keys (`fp_test_...`). Using a live key throws an error.

### Getting Testnet Accounts

For testing, create accounts on testnet:
1. Use [Stellar Laboratory](https://laboratory.stellar.org/) to generate a keypair
2. Fund via [Stellar Testnet Friendbot](https://friendbot.stellar.org)
3. Or use FacilPay's `fundTestnet()` if you have a test API key

## Common Errors

### Missing Trustline

```ts
// Error: You don't have a trustline for this token
// Solution: Establish trustline first
const trustlineTx = new TransactionBuilder(account, {
  fee: '100',
  networkPassphrase: Networks.TESTNET,
})
  .appendChangeTrustOperation({
    asset: new Asset('XLM'), // Or your token
    source: customerAddress,
  })
  .setTimeout(30)
  .build();
```

The contract will return error code **6** (`TokenNotAllowed`) if the customer doesn't trust the token before making a payment.

### Insufficient Balance

```ts
// Error: Customer doesn't have enough balance
// Contract error code: 7 (InsufficientBalance)
// Solution: Fund the account or use a different token
```

### Simulation Failure

```ts
// Error during simulation
try {
  const payment = await contract.getPayment(1n, sourceAddress);
} catch (error) {
  if (error instanceof FacilPayContractError) {
    // Handle contract errors
    switch (error.code) {
      case 2:
        console.log('Payment not found');
        break;
      case 4:
        console.log('Payment has expired');
        break;
    }
  }
}
```

### Contract Error Codes

| Code | Error Name | Description |
|------|------------|-------------|
| 1 | Unauthorized | Caller is not authorized to perform this action |
| 2 | PaymentNotFound | No payment exists with the given ID |
| 3 | PaymentAlreadyCompleted | Payment is already completed |
| 4 | PaymentExpired | Payment has expired |
| 5 | InvalidAmount | Amount must be greater than 0 |
| 6 | TokenNotAllowed | Token is not in the allowed list |
| 7 | InsufficientBalance | Not enough balance for the operation |
| 8 | InvalidStatus | Invalid payment status for this operation |
| 9 | RefundNotAllowed | Refund is not allowed for this payment |
| 10 | InstallmentNotDue | Installment payment is not due yet |

## Amount Precision

FacilPay contracts use **7 decimal places** for amounts. Convert between human-readable and contract values:

```ts
const TOKENS_PER_XLM = 10_000_000n;

// Human-readable to contract
const toContractAmount = (amount: number): bigint =>
  BigInt(Math.round(amount * 10_000_000));

// Contract to human-readable
const fromContractAmount = (amount: bigint): number =>
  Number(amount) / 10_000_000;

console.log(toContractAmount(100));   // 100_0000000n
console.log(fromContractAmount(100_0000000n)); // 100
```

## Error Handling

The SDK provides `FacilPayContractError` with readable error names:

```ts
import { PaymentContract, FacilPayContractError } from '@facilpay/sdk/contracts';

const contract = new PaymentContract({ ... });

try {
  const payment = await contract.getPayment(1n, source);
} catch (error) {
  if (error instanceof FacilPayContractError) {
    console.log('Error name:', error.name);    // e.g., "PaymentNotFound"
    console.log('Error code:', error.code);    // e.g., 2
    console.log('Error message:', error.message);
  }
}
```

## Full Example: Create and Process Payment

```ts
import { PaymentContract } from '@facilpay/sdk/contracts';

// Initialize contract
const contract = new PaymentContract({
  contractId: 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
  network: 'testnet',
  rpcUrl: 'https://soroban-testnet.stellar.org',
});

// 1. Merchant creates a payment on behalf of customer
const createTx = await contract.createPayment({
  customer: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
  merchant: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567891',
  token: 'CAABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
  amount: 100_0000000n, // 100 XLM
  expiresAt: 86400n,
});

// 2. Customer signs with their wallet (e.g., Freighter)
// const signedXdr = await freighter.signTransaction(createTx.toXDR());

// 3. Submit signed transaction
const result = await contract.submit(signedXdr);
console.log('Payment created:', result.hash);

// 4. Later, customer pays installment
const installmentTx = await contract.payInstallment({
  paymentId: 1n,
  payer: 'GABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890',
  amount: 25_0000000n, // 25 XLM
});

// 5. Customer signs and submits
// const signedInstallmentXdr = await freighter.signTransaction(installmentTx.toXDR());
const installmentResult = await contract.submit(signedInstallmentXdr);
console.log('Installment paid:', installmentResult.hash);
```