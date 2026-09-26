<p align="center">
  <img src="https://raw.githubusercontent.com/Facil-Pay/facilpay-frontend/main/app/branding/logo/horizontal/facilpay-horizontal-logo.png" alt="FacilPay" width="320" />
</p>

<h1 align="center">FacilPay SDK</h1>

<p align="center">
  Easily integrate crypto payments into your app.<br/>
  The official TypeScript/JavaScript SDK for the <a href="https://github.com/Facil-Pay/facilpay-api">FacilPay API</a> and the FacilPay <a href="https://github.com/Facil-Pay/facilpay-contracts">Soroban smart contracts</a> on Stellar.
</p>

<p align="center">
  <img alt="Status" src="https://img.shields.io/badge/status-pre--release-orange" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-blue" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178c6" />
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D18-339933" />
</p>

> [!WARNING]
> The SDK is under active development and has not been published to npm yet. The API shown below is the target design and may change before `1.0.0`. See the [open issues](https://github.com/Facil-Pay/facilpay-sdk/issues) for the roadmap and to pick something to work on.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Authentication](#authentication)
- [Configuration](#configuration)
- [Usage](#usage)
  - [Payments](#payments)
  - [Payment Links](#payment-links)
  - [Refunds](#refunds)
  - [Disputes](#disputes)
  - [Recurring Payments](#recurring-payments)
  - [Webhooks](#webhooks)
  - [Settlements, Rates & Currencies](#settlements-rates--currencies)
  - [On-chain Contracts (Soroban)](#on-chain-contracts-soroban)
- [Error Handling](#error-handling)
- [Idempotency & Retries](#idempotency--retries)
- [Pagination](#pagination)
- [Test Mode](#test-mode)
- [Framework Integrations](#framework-integrations)
- [Project Structure](#project-structure)
- [Development](#development)
- [Contributing](#contributing)
- [Related Repositories](#related-repositories)
- [License](#license)

---

## Overview

FacilPay is a Stellar-based payment gateway that lets merchants accept crypto payments and settle in stablecoins (USDC). The platform has three parts:

| Layer         | Repository                                                                  | Stack                     |
| ------------- | --------------------------------------------------------------------------- | ------------------------- |
| Contracts     | [facilpay-contracts](https://github.com/Facil-Pay/facilpay-contracts)       | Rust, Soroban (Stellar)   |
| Backend API   | [facilpay-api](https://github.com/Facil-Pay/facilpay-api)                   | NestJS, PostgreSQL, BullMQ |
| Dashboard     | [facilpay-frontend](https://github.com/Facil-Pay/facilpay-frontend)         | Next.js, React, Tailwind  |
| **SDK**       | **facilpay-sdk** (this repo)                                                | **TypeScript**            |

The SDK wraps all of this in one typed client, so you don't have to write HTTP calls, sign webhooks or build Soroban transactions yourself.

```text
┌──────────────────┐        HTTPS (/v1)         ┌──────────────────┐     Soroban RPC     ┌──────────────────────┐
│   Your app       │ ─────────────────────────▶ │  facilpay-api    │ ──────────────────▶ │  payment / escrow /  │
│  + facilpay-sdk  │ ◀───── signed webhooks ─── │  (NestJS)        │                     │  refund / admin      │
└──────────────────┘                            └──────────────────┘                     └──────────────────────┘
         │                                                                                          ▲
         └────────────────────────── optional direct contract calls (@facilpay/sdk/contracts) ──────┘
```

## Features

- **Typed REST client** for every public `/v1` resource: payments, payment links, refunds, disputes, recurring payments, webhooks, settlements, rates, currencies, API keys and Stellar balances.
- **API key authentication** with `fp_test_…` / `fp_live_…` keys and automatic environment detection.
- **Automatic idempotency keys** on payment creation, so a retried request never charges twice.
- **Retries with exponential backoff** for network errors, `429` and `5xx` responses.
- **Webhook signature verification** (HMAC-SHA256, constant-time comparison) plus typed event payloads.
- **Auto-pagination** helpers for list endpoints.
- **Typed errors** (`FacilPayAuthenticationError`, `FacilPayRateLimitError`, …) carrying the request ID.
- **Soroban contract bindings** for the `payment`, `escrow` and `refund` contracts, for apps that talk to the chain directly.
- **Runs anywhere**: Node.js 18+, Bun, Deno, edge runtimes and the browser (publishable-key features only). Uses native `fetch`.
- **Tree-shakeable ESM + CJS builds** with bundled type declarations.

## Installation

```bash
npm install @facilpay/sdk
# or
yarn add @facilpay/sdk
# or
pnpm add @facilpay/sdk
```

## Quick Start

```ts
import { FacilPay } from '@facilpay/sdk';

const facilpay = new FacilPay({
  apiKey: process.env.FACILPAY_API_KEY!, // fp_test_... or fp_live_...
});

// Create a payment
const payment = await facilpay.payments.create({
  amount: 49.99,
  currency: 'USD',
  description: 'Order #12345',
  payerEmail: 'customer@example.com',
  metadata: { orderId: 'order_12345' },
  expiresIn: 1800, // seconds
});

console.log(payment.id, payment.status); // "…", "PENDING"

// Get a QR code the customer can scan with a Stellar wallet
const qr = await facilpay.payments.getQrCode(payment.id);
```

## Authentication

Create API keys in the FacilPay dashboard or through `POST /v1/api-keys`. Keys come in two environments:

| Prefix       | Environment | Moves real funds |
| ------------ | ----------- | ---------------- |
| `fp_test_`   | Testnet     | No               |
| `fp_live_`   | Mainnet     | Yes              |

The SDK sends the key as `Authorization: ApiKey <key>`. Never ship a secret key to a browser or mobile app. Keep it on your server.

```ts
const facilpay = new FacilPay({ apiKey: process.env.FACILPAY_API_KEY! });
```

## Configuration

```ts
const facilpay = new FacilPay({
  apiKey: 'fp_test_...',
  baseUrl: 'https://api.facilpay.io', // override for self-hosted or local (http://localhost:3000)
  timeout: 30_000,                    // per-request timeout in ms
  maxRetries: 2,                      // retries on network errors, 429 and 5xx
  fetch: customFetch,                 // bring your own fetch implementation
  headers: { 'X-Correlation-Id': 'checkout-service' },
  logger: console,                    // optional debug logging (API keys are redacted)
});
```

| Option       | Type                       | Default                     | Description                                   |
| ------------ | -------------------------- | --------------------------- | --------------------------------------------- |
| `apiKey`     | `string`                   | —                           | **Required.** Your `fp_test_` or `fp_live_` key |
| `baseUrl`    | `string`                   | `https://api.facilpay.io`   | API origin. `/v1` is appended automatically    |
| `timeout`    | `number`                   | `30000`                     | Request timeout in milliseconds                |
| `maxRetries` | `number`                   | `2`                         | Maximum automatic retries                      |
| `fetch`      | `typeof fetch`             | `globalThis.fetch`          | Custom fetch implementation                    |
| `headers`    | `Record<string, string>`   | `{}`                        | Extra headers sent with every request          |
| `logger`     | `Logger`                   | `undefined`                 | Receives request/response debug logs           |

## Usage

### Payments

```ts
// Create (an Idempotency-Key is generated for you; pass your own to control retries)
const payment = await facilpay.payments.create(
  { amount: 100, currency: 'USD', description: 'Pro plan' },
  { idempotencyKey: `order_${orderId}` },
);

// Split a payment between several recipients (percentages must sum to 100)
await facilpay.payments.create({
  amount: 200,
  currency: 'USD',
  splits: [
    { recipient: 'G...MERCHANT', percentage: 90 },
    { recipient: 'G...PLATFORM', percentage: 10 },
  ],
});

// Retrieve, list, cancel
const p = await facilpay.payments.retrieve(payment.id);
const page = await facilpay.payments.list({ status: 'COMPLETED', limit: 50 });
await facilpay.payments.cancel(payment.id);

// Timeline, invoice and QR code
const timeline = await facilpay.payments.timeline(payment.id);
const invoice  = await facilpay.payments.invoice(payment.id);
const qr       = await facilpay.payments.getQrCode(payment.id);

// Bulk create and CSV export
await facilpay.payments.createBulk([{ amount: 10, currency: 'USD' }, { amount: 20, currency: 'USD' }]);
const csv = await facilpay.payments.export({ from: '2026-01-01', to: '2026-01-31' });
```

Payment statuses: `PENDING`, `COMPLETED`, `PARTIALLY_COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`, `REFUNDED`, `PARTIALLY_REFUNDED`.

### Payment Links

```ts
const link = await facilpay.paymentLinks.create({
  amount: 50,
  currency: 'USD',
  description: 'Invoice #42',
  expiresAt: '2026-12-31T23:59:59Z',
});

console.log(link.token); // share the hosted checkout URL with your customer

await facilpay.paymentLinks.update(link.id, { description: 'Invoice #42 (updated)' });
await facilpay.paymentLinks.deactivate(link.id);
```

### Refunds

```ts
// Full refund
await facilpay.payments.refund(payment.id);

// Partial refund
await facilpay.payments.refund(payment.id, { amount: 25, reason: 'Item returned' });
```

### Disputes

```ts
const dispute = await facilpay.disputes.create(payment.id, { reason: 'Item not received' });
const disputes = await facilpay.disputes.list({ status: 'OPEN' });
await facilpay.disputes.update(dispute.id, { evidence: 'Tracking number: 1Z999...' });
```

### Recurring Payments

```ts
const sub = await facilpay.recurringPayments.create({
  amount: 9.99,
  currency: 'USD',
  interval: 'monthly',
  payerEmail: 'customer@example.com',
});

await facilpay.recurringPayments.pause(sub.id);
await facilpay.recurringPayments.resume(sub.id);
await facilpay.recurringPayments.cancel(sub.id);
```

### Webhooks

Register an endpoint:

```ts
const endpoint = await facilpay.webhooks.create({
  url: 'https://example.com/webhooks/facilpay',
  events: ['payment.completed', 'payment.failed', 'refund.issued'],
});

// The secret is only returned once. Store it securely.
console.log(endpoint.secret); // whsec_...
```

Verify and handle incoming events. FacilPay signs the **raw request body** with HMAC-SHA256 and sends the hex digest in `X-FacilPay-Signature`:

```ts
import express from 'express';
import { Webhooks, FacilPaySignatureVerificationError } from '@facilpay/sdk';

const app = express();

app.post('/webhooks/facilpay', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const event = Webhooks.constructEvent(
      req.body,                               // raw Buffer, not parsed JSON
      req.header('X-FacilPay-Signature')!,
      process.env.FACILPAY_WEBHOOK_SECRET!,
    );

    switch (event.type) {
      case 'payment.completed':
        // event.data is typed as a Payment
        fulfillOrder(event.data.metadata?.orderId);
        break;
      case 'refund.issued':
        markRefunded(event.data.paymentId);
        break;
    }

    res.sendStatus(200);
  } catch (err) {
    if (err instanceof FacilPaySignatureVerificationError) return res.sendStatus(401);
    throw err;
  }
});
```

Supported events: `payment.created`, `payment.completed`, `payment.failed`, `payment.expired`, `payment.split_processed`, `refund.issued`, `dispute.opened`, `transaction.multisig_required`, `transaction.multisig_completed`.

Other webhook operations:

```ts
await facilpay.webhooks.list();
await facilpay.webhooks.update(endpoint.id, { events: ['payment.completed'] });
await facilpay.webhooks.sendTest(endpoint.id);
await facilpay.webhooks.rotateSecret(endpoint.id);
await facilpay.webhooks.retryDelivery(deliveryId);
await facilpay.webhooks.delete(endpoint.id);
```

### Settlements, Rates & Currencies

```ts
const currencies = await facilpay.currencies.list();
const rates      = await facilpay.rates.get({ base: 'XLM', quote: 'USD' });

await facilpay.settlements.configure({ asset: 'USDC', schedule: 'daily', destination: 'G...' });
const settlements = await facilpay.settlements.list();

const balances = await facilpay.stellar.balances();
const fees     = await facilpay.merchants.feeReport({ from: '2026-01-01' });
```

### On-chain Contracts (Soroban)

For apps that want to talk to the FacilPay contracts directly (non-custodial wallets, dApps), the SDK ships typed bindings under a separate entry point, so the REST client stays small:

```ts
import { PaymentContract, EscrowContract, RefundContract, Networks } from '@facilpay/sdk/contracts';

const payments = new PaymentContract({
  contractId: 'C...PAYMENT',
  network: Networks.TESTNET,
  rpcUrl: 'https://soroban-testnet.stellar.org',
});

// Build an unsigned transaction and sign it with the user's wallet (e.g. Freighter)
const tx = await payments.createPayment({
  customer: 'G...CUSTOMER',
  merchant: 'G...MERCHANT',
  amount: 100_0000000n, // i128, 7 decimals
  token: 'C...USDC',
});

const signed = await wallet.signTransaction(tx.toXDR(), { networkPassphrase: Networks.TESTNET });
const result = await payments.submit(signed);

// Read-only queries need no signature
const onChain = await payments.getPayment(result.paymentId);
const escrow  = await new EscrowContract({ contractId: 'C...ESCROW', network: Networks.TESTNET }).getEscrow(1n);
```

## Error Handling

Every failed request throws a subclass of `FacilPayError`:

| Error class                          | HTTP status | When                                        |
| ------------------------------------ | ----------- | ------------------------------------------- |
| `FacilPayValidationError`            | 400, 422    | Invalid parameters or idempotency mismatch  |
| `FacilPayAuthenticationError`        | 401         | Missing, invalid or revoked API key         |
| `FacilPayPermissionError`            | 403         | Key lacks scope, IP not allowlisted, geo-blocked |
| `FacilPayNotFoundError`              | 404         | Resource does not exist                     |
| `FacilPayConflictError`              | 409         | Resource state conflict                     |
| `FacilPayRateLimitError`             | 429         | Too many requests (`retryAfter` available)  |
| `FacilPayAPIError`                   | 5xx         | Server-side error                           |
| `FacilPayConnectionError`            | —           | Network failure or timeout                  |
| `FacilPaySignatureVerificationError` | —           | Webhook signature mismatch                  |

```ts
import { FacilPayError, FacilPayRateLimitError } from '@facilpay/sdk';

try {
  await facilpay.payments.create({ amount: 10, currency: 'USD' });
} catch (err) {
  if (err instanceof FacilPayRateLimitError) {
    console.log(`Retry after ${err.retryAfter}s`);
  } else if (err instanceof FacilPayError) {
    console.error(err.status, err.message, err.requestId);
  }
}
```

Include `err.requestId` when you contact support. It matches the `x-request-id` header returned by the API.

## Idempotency & Retries

- `payments.create()` always sends an `Idempotency-Key` header. If you don't pass one, the SDK generates a UUID v4 and **reuses it across automatic retries**, so a retry after a timeout never creates a second payment.
- Pass your own key (e.g. your order ID) to make retries safe across process restarts.
- Reusing a key with a **different** body returns `422` (`FacilPayValidationError`).
- Keys expire on the server after 24 hours.
- Automatic retries apply to network errors, `408`, `429` and `5xx`, with exponential backoff and jitter. `Retry-After` is respected.

## Pagination

List methods return a single page. To walk every page, iterate the result with `for await`:

```ts
for await (const payment of facilpay.payments.list({ status: 'COMPLETED' })) {
  console.log(payment.id);
}

// Or collect into an array (with a safety cap)
const all = await facilpay.paymentLinks.list().toArray({ limit: 500 });
```

## Test Mode

Use an `fp_test_` key to run against Stellar Testnet. In test mode you can fund a testnet account through the API:

```ts
await facilpay.stellar.fundTestnet({ address: 'G...' });
```

## Framework Integrations

| Package                   | Description                                                  | Status  |
| ------------------------- | ------------------------------------------------------------ | ------- |
| `@facilpay/sdk`           | Core client (Node, Bun, Deno, edge)                          | Planned |
| `@facilpay/sdk/contracts` | Soroban contract bindings                                    | Planned |
| `@facilpay/react`         | `<FacilPayCheckout />` component and `usePaymentStatus` hook | Planned |
| `@facilpay/nextjs`        | Webhook route handler helper for the App Router              | Planned |

## Project Structure

```text
facilpay-sdk/
├── src/
│   ├── index.ts              # Public entry point
│   ├── client.ts             # FacilPay class
│   ├── core/
│   │   ├── http.ts           # fetch wrapper, retries, timeouts
│   │   ├── errors.ts         # FacilPayError hierarchy
│   │   ├── idempotency.ts
│   │   └── pagination.ts
│   ├── resources/            # payments, paymentLinks, refunds, disputes, webhooks, ...
│   ├── webhooks/             # signature verification + event types
│   ├── contracts/            # Soroban bindings (separate entry point)
│   └── types/                # Shared API types
├── test/
├── examples/                 # express, nextjs, react checkout
├── package.json
└── tsconfig.json
```

## Development

Requirements: Node.js 18+ and npm.

```bash
git clone https://github.com/Facil-Pay/facilpay-sdk.git
cd facilpay-sdk
npm install

npm run build      # compile ESM + CJS + .d.ts
npm test           # unit tests
npm run lint       # ESLint + Prettier
npm run typecheck
```

To run against a local API, start [facilpay-api](https://github.com/Facil-Pay/facilpay-api) with `docker compose up --build` and point the SDK at it:

```ts
const facilpay = new FacilPay({ apiKey: 'fp_test_...', baseUrl: 'http://localhost:3000' });
```

## Contributing

Contributions are welcome.

1. Pick an issue from the [issue tracker](https://github.com/Facil-Pay/facilpay-sdk/issues). Issues labelled `good first issue` are a good place to start.
2. Comment on the issue to get it assigned before starting work.
3. Fork the repo and create a branch: `git checkout -b feat/<short-description>`.
4. Write tests for your change and make sure `npm test`, `npm run lint` and `npm run typecheck` pass.
5. Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:` …).
6. Open a pull request that references the issue (`Closes #12`).

## Related Repositories

- [facilpay-contracts](https://github.com/Facil-Pay/facilpay-contracts): Soroban smart contracts (payment, escrow, refund, admin)
- [facilpay-api](https://github.com/Facil-Pay/facilpay-api): NestJS backend API
- [facilpay-frontend](https://github.com/Facil-Pay/facilpay-frontend): Next.js merchant dashboard
- Community: [Telegram](https://t.me/+afM9uh7GGtVkYmZk)

## License

This project is licensed under the [MIT License](LICENSE).

## Handsoff notes

<!-- handsoff-issue-19 -->
- #19: Settlements, rates, currencies and merchant fee resources
