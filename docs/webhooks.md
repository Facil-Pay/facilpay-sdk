# Webhook Signature Verification

FacilPay sends webhooks to your configured endpoints to notify you about events like payments, refunds, and disputes. Since webhooks can be spoofed, you must verify the `X-FacilPay-Signature` header before processing any event.

The SDK provides the `@facilpay/sdk/webhooks` module for signature verification:

```ts
import { Webhooks } from '@facilpay/sdk';
// or
import { Webhooks, constructEvent } from '@facilpay/sdk';
```

## Framework-Specific Setup

### Express

Express needs the raw request body for signature verification. Use `express.raw()` for the webhook route:

```ts
import express from 'express';
import { Webhooks, constructEvent } from '@facilpay/sdk';

const app = express();

// WARNING: Use express.raw() for the webhook route - not express.json()
app.post('/webhooks/facilpay', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.get('X-FacilPay-Signature');
  if (!signature) {
    return res.status(400).send('Missing X-FacilPay-Signature header');
  }

  try {
    // req.body is a Buffer in Express when using express.raw()
    const event = await constructEvent(req.body, signature, process.env.WEBHOOK_SECRET!);
    
    // Process the event
    switch (event.type) {
      case 'payment.completed':
        console.log('Payment completed:', event.data);
        break;
      case 'payment.failed':
        console.log('Payment failed:', event.data);
        break;
      // ... handle other event types
    }
    
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook verification failed:', err);
    res.status(400).send('Invalid signature');
  }
});
```

### Next.js App Router

In Next.js App Router, use `req.text()` to get the raw body:

```ts
import { NextResponse } from 'next/server';
import { constructEvent } from '@facilpay/sdk';

export async function POST(req: Request) {
  const signature = req.headers.get('X-FacilPay-Signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  try {
    // Get raw body as string
    const rawBody = await req.text();
    
    const event = await constructEvent(rawBody, signature, process.env.WEBHOOK_SECRET!);
    
    switch (event.type) {
      case 'payment.completed':
        // Handle payment completed
        break;
      case 'refund.issued':
        // Handle refund
        break;
    }
    
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error('Webhook verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
}
```

### Fastify

```ts
import Fastify from 'fastify';
import { constructEvent } from '@facilpay/sdk';

const fastify = Fastify();

fastify.post('/webhooks/facilpay', async (request, reply) => {
  const signature = request.headers['x-facilpay-signature'];
  if (!signature) {
    return reply.status(400).send('Missing signature');
  }

  try {
    // Fastify provides raw body via request.body as a Buffer
    const rawBody = request.body as Buffer;
    const event = await constructEvent(rawBody, signature, process.env.WEBHOOK_SECRET!);
    
    // Handle event...
    
    return { received: true };
  } catch (err) {
    return reply.status(400).send('Invalid signature');
  }
});
```

### Hono / Cloudflare Workers

Hono and Cloudflare Workers use the Web Crypto API. The SDK automatically falls back to async verification:

```ts
import { Hono } from 'hono';
import { constructEvent } from '@facilpay/sdk';

const app = new Hono();

app.post('/webhooks/facilpay', async (c) => {
  const signature = c.req.header('X-FacilPay-Signature');
  if (!signature) {
    return c.text('Missing signature', 400);
  }

  try {
    const rawBody = await c.req.text();
    const event = await constructEvent(rawBody, signature, process.env.WEBHOOK_SECRET!);
    
    switch (event.type) {
      case 'payment.completed':
        // Handle payment completed
        break;
    }
    
    return c.json({ received: true });
  } catch (err) {
    console.error(err);
    return c.text('Invalid signature', 400);
  }
});

export default app;
```

## Secret Rotation

When rotating webhook secrets, you may have multiple active secrets during the transition period. The SDK supports passing an array of secrets:

```ts
import { constructEvent } from '@facilpay/sdk';

// Support both old and new secrets during rotation
const secrets = [
  process.env.WEBHOOK_SECRET_NEW!,  // Current secret
  process.env.WEBHOOK_SECRET_OLD!,  // Previous secret during transition
];

const event = await constructEvent(rawBody, signature, secrets);
```

The SDK checks each secret in order and accepts the webhook if any secret produces a valid signature.

## Timestamp Tolerance

FacilPay includes a signed timestamp to prevent replay attacks. You can enforce a tolerance window:

```ts
import { constructEvent } from '@facilpay/sdk';

const event = await constructEvent(
  rawBody,
  signature,
  process.env.WEBHOOK_SECRET!,
  {
    tolerance: 300, // Allow up to 5 minutes (300 seconds) clock drift
  }
);
```

If the timestamp is outside the tolerance window, the SDK throws a `FacilPaySignatureVerificationError` with the message "Webhook timestamp is outside the allowed tolerance."

## Replay Protection

The signed timestamp combined with the unique event ID provides replay protection. Store processed event IDs in your database and reject duplicates:

```ts
import { constructEvent } from '@facilpay/sdk';

async function processWebhook(rawBody: string, signature: string, secret: string) {
  const event = await constructEvent(rawBody, signature, secret);
  
  // Check for duplicates
  const alreadyProcessed = await db.eventLog.findUnique({
    where: { id: event.id },
  });
  
  if (alreadyProcessed) {
    console.log('Duplicate event received:', event.id);
    return { received: true }; // Still return 200 to acknowledge
  }
  
  // Process the event
  await handleEvent(event);
  
  // Log the processed event
  await db.eventLog.create({
    data: { id: event.id, type: event.type, processedAt: new Date() },
  });
  
  return { received: true };
}
```

## Idempotent Event Handling

Webhook events are idempotent — the same event is never sent twice with a different payload. However, network failures can cause duplicate deliveries. Handle this by:

1. **Checking the event ID** before processing
2. **Using database transactions** to ensure atomic processing
3. **Implementing idempotency keys** for critical operations

```ts
async function handleEvent(event: FacilPayEvent) {
  await db.$transaction(async (tx) => {
    // Double-check no duplicate processing
    const existing = await tx.webhookEvent.findUnique({
      where: { id: event.id },
    });
    
    if (existing) {
      return; // Already processed
    }
    
    // Process based on event type
    switch (event.type) {
      case 'payment.completed':
        await updatePaymentStatus(tx, event.data);
        break;
      case 'refund.issued':
        await processRefund(tx, event.data);
        break;
    }
    
    // Record processed event
    await tx.webhookEvent.create({
      data: { id: event.id, type: event.type },
    });
  });
}
```

## Event Types and Payloads

### Payment Events

#### `payment.created`

Triggered when a new payment is created.

```json
{
  "id": "evt_01HABC123DEF456GHI789",
  "type": "payment.created",
  "timestamp": "2024-05-15T10:30:00.000Z",
  "data": {
    "id": "pay_01HABC123DEF456GHI789",
    "amount": 100.00,
    "currency": "XLM",
    "status": "PENDING",
    "customerId": "cus_01HABC123DEF456GHI789",
    "createdAt": "2024-05-15T10:30:00.000Z",
    "expiresAt": "2024-05-15T11:00:00.000Z"
  }
}
```

#### `payment.completed`

Triggered when a payment is successfully completed.

```json
{
  "id": "evt_01HABC123DEF456GHI790",
  "type": "payment.completed",
  "timestamp": "2024-05-15T10:35:00.000Z",
  "data": {
    "id": "pay_01HABC123DEF456GHI789",
    "amount": 100.00,
    "currency": "XLM",
    "status": "COMPLETED",
    "customerId": "cus_01HABC123DEF456GHI789",
    "stellarTransactionId": "tx_01HABC123DEF456GHI789",
    "completedAt": "2024-05-15T10:35:00.000Z"
  }
}
```

#### `payment.failed`

Triggered when a payment fails.

```json
{
  "id": "evt_01HABC123DEF456GHI791",
  "type": "payment.failed",
  "timestamp": "2024-05-15T10:35:00.000Z",
  "data": {
    "id": "pay_01HABC123DEF456GHI789",
    "amount": 100.00,
    "currency": "XLM",
    "status": "FAILED",
    "failureReason": "INSUFFICIENT_BALANCE",
    "customerId": "cus_01HABC123DEF456GHI789"
  }
}
```

#### `payment.expired`

Triggered when a payment expires without being completed.

```json
{
  "id": "evt_01HABC123DEF456GHI792",
  "type": "payment.expired",
  "timestamp": "2024-05-15T11:00:00.000Z",
  "data": {
    "id": "pay_01HABC123DEF456GHI789",
    "amount": 100.00,
    "currency": "XLM",
    "status": "EXPIRED",
    "customerId": "cus_01HABC123DEF456GHI789"
  }
}
```

#### `payment.split_processed`

Triggered when a split payment has been processed to all recipients.

```json
{
  "id": "evt_01HABC123DEF456GHI793",
  "type": "payment.split_processed",
  "timestamp": "2024-05-15T10:35:00.000Z",
  "data": {
    "id": "pay_01HABC123DEF456GHI789",
    "amount": 100.00,
    "currency": "XLM",
    "status": "COMPLETED",
    "splits": [
      { "recipientId": "acct_01H...", "amount": 90.00 },
      { "recipientId": "acct_01I...", "amount": 10.00 }
    ]
  }
}
```

### Refund Events

#### `refund.issued`

Triggered when a refund is issued.

```json
{
  "id": "evt_01HABC123DEF456GHI794",
  "type": "refund.issued",
  "timestamp": "2024-05-15T12:00:00.000Z",
  "data": {
    "id": "rfnd_01HABC123DEF456GHI789",
    "paymentId": "pay_01HABC123DEF456GHI789",
    "amount": 50.00,
    "currency": "XLM",
    "reason": "CUSTOMER_REQUEST",
    "createdAt": "2024-05-15T12:00:00.000Z"
  }
}
```

### Dispute Events

#### `dispute.opened`

Triggered when a dispute is opened.

```json
{
  "id": "evt_01HABC123DEF456GHI795",
  "type": "dispute.opened",
  "timestamp": "2024-05-15T14:00:00.000Z",
  "data": {
    "id": "dsp_01HABC123DEF456GHI789",
    "paymentId": "pay_01HABC123DEF456GHI789",
    "reason": "NOT_RECEIVED",
    "status": "OPEN",
    "openedAt": "2024-05-15T14:00:00.000Z",
    "customerId": "cus_01HABC123DEF456GHI789"
  }
}
```

### Transaction Events

#### `transaction.multisig_required`

Triggered when a Stellar transaction requires additional signatures.

```json
{
  "id": "evt_01HABC123DEF456GHI796",
  "type": "transaction.multisig_required",
  "timestamp": "2024-05-15T10:30:00.000Z",
  "data": {
    "transactionId": "tx_01HABC123DEF456GHI789",
    "signersRequired": 2,
    "signersReceived": 1,
    "transactionXdr": "AAAA...",
    "createdAt": "2024-05-15T10:30:00.000Z"
  }
}
```

#### `transaction.multisig_completed`

Triggered when all required signatures are collected and the transaction is submitted.

```json
{
  "id": "evt_01HABC123DEF456GHI797",
  "type": "transaction.multisig_completed",
  "timestamp": "2024-05-15T10:35:00.000Z",
  "data": {
    "transactionId": "tx_01HABC123DEF456GHI789",
    "stellarTransactionHash": "abc123...",
    "submittedAt": "2024-05-15T10:35:00.000Z"
  }
}
```

### Test Event

#### `test`

Sent when you validate your webhook endpoint in the dashboard.

```json
{
  "id": "evt_01HABC123DEF456GHI798",
  "type": "test",
  "timestamp": "2024-05-15T10:00:00.000Z",
  "data": {
    "message": "Webhook endpoint validated successfully"
  }
}
```

## Handling All Events

Use type narrowing to handle different event types:

```ts
import { constructEvent, isEventType } from '@facilpay/sdk';
import type { FacilPayEvent } from '@facilpay/sdk';

async function handleWebhook(payload: string, signature: string, secret: string) {
  const event = await constructEvent<FacilPayEvent>(payload, signature, secret);
  
  // Using type guards
  if (isEventType(event, 'payment.completed')) {
    console.log('Payment received:', event.data.amount);
  } else if (isEventType(event, 'refund.issued')) {
    console.log('Refund issued:', event.data.amount);
  }
  
  // Using switch (for full type narrowing)
  switch (event.type) {
    case 'payment.created':
    case 'payment.completed':
    case 'payment.failed':
    case 'payment.expired':
    case 'payment.split_processed':
      console.log('Payment event:', event.data.id);
      break;
    case 'refund.issued':
      console.log('Refund event:', event.data.id);
      break;
    case 'dispute.opened':
      console.log('Dispute opened:', event.data.id);
      break;
    case 'transaction.multisig_required':
      console.log('Multisig required:', event.data.signersRequired);
      break;
    case 'transaction.multisig_completed':
      console.log('Multisig completed:', event.data.transactionId);
      break;
    case 'test':
      console.log('Test event:', event.data.message);
      break;
  }
}
```

## Error Handling

The SDK throws `FacilPaySignatureVerificationError` for various failure cases:

```ts
import { constructEvent, FacilPaySignatureVerificationError } from '@facilpay/sdk';

try {
  const event = await constructEvent(rawBody, signature, secret);
} catch (err) {
  if (err instanceof FacilPaySignatureVerificationError) {
    switch (err.code) {
      case 'E_MISSING_HEADER':
        // Missing X-FacilPay-Signature header
        break;
      case 'E_MALFORMED_HEADER':
        // Malformed signature header
        break;
      case 'E_INVALID_SIGNATURE':
        // Signature doesn't match any secret
        break;
      case 'E_TIMESTAMP_OUTSIDE_TOLERANCE':
        // Timestamp outside tolerance window
        break;
    }
  }
  throw err;
}
```