# Error Handling

Every error the SDK throws is an instance of `FacilPayError`, so one `instanceof` check catches anything that came from the SDK. Subclasses tell you _where_ the failure happened: before the request, on the network, at the API, or while verifying a webhook.

- [Error hierarchy](#error-hierarchy)
- [HTTP status mapping](#http-status-mapping)
- [Request and correlation IDs](#request-and-correlation-ids)
- [Recommended `try/catch` patterns](#recommended-trycatch-patterns)
- [What is safe to retry](#what-is-safe-to-retry)

## Error hierarchy

```text
FacilPayError                         code?
├── FacilPayValidationError           code?            (client-side, no request sent)
├── FacilPayConnectionError           cause?           (network failure, timeout, abort)
├── FacilPayAPIError                  status, requestId?, correlationId?, body?
└── FacilPaySignatureVerificationError                 (webhook signature checks)
```

| Class                                | Thrown when                                                                               | Useful properties                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `FacilPayError`                      | Base class. Also thrown directly for SDK-level failures, e.g. invalid recurring payment state transitions (`code: 'recurring_payment_invalid_state'`). | `message`, `code`                              |
| `FacilPayValidationError`            | Parameters fail client-side validation **before any request is made**: invalid idempotency key (`code: 'invalid_idempotency_key'`), invalid payment amount/currency/metadata/splits, missing Stellar parameters, `fundTestnet` with a live key. | `message`, `code`                              |
| `FacilPayConnectionError`            | The API could not be reached: DNS/network failure, the request exceeded its `timeout`, or it was aborted through an `AbortSignal`. | `message`, `cause` (the original error)        |
| `FacilPayAPIError`                   | The API answered with a non-2xx status.                                                   | `status`, `requestId`, `correlationId`, `body` |
| `FacilPaySignatureVerificationError` | A webhook signature header is missing, malformed, stale, or does not match the secret(s). | `message`                                      |

All error classes are exported from the package root:

```ts
import {
  FacilPayAPIError,
  FacilPayConnectionError,
  FacilPayError,
  FacilPaySignatureVerificationError,
  FacilPayValidationError,
} from '@facilpay/sdk';
```

## HTTP status mapping

When the API responds with a non-2xx status, the SDK throws a `FacilPayAPIError` whose `status` is the HTTP status code and whose `body` is the parsed response body (the API's own `message` is used as the error message when present). Branch on `status` to decide what to do:

| Status | Meaning                                                         | Error class        | Retried automatically?                         |
| ------ | --------------------------------------------------------------- | ------------------ | ---------------------------------------------- |
| 400    | Malformed request / invalid parameters                          | `FacilPayAPIError` | No                                             |
| 401    | Missing, invalid or revoked API key (or missing user JWT)       | `FacilPayAPIError` | No                                             |
| 403    | Key lacks the required scope, IP not allowlisted, geo-blocked   | `FacilPayAPIError` | No                                             |
| 404    | Resource does not exist                                         | `FacilPayAPIError` | No                                             |
| 408    | Request timeout on the server side                              | `FacilPayAPIError` | Yes\*                                          |
| 409    | Resource state conflict (e.g. refunding a refunded payment)     | `FacilPayAPIError` | Only when the body reports a lock timeout\*    |
| 422    | Validation failed, or idempotency key reused with another body  | `FacilPayAPIError` | No                                             |
| 429    | Rate limited (`Retry-After` header is honored)                  | `FacilPayAPIError` | Yes\*                                          |
| 5xx    | Server-side error                                               | `FacilPayAPIError` | Yes\*                                          |
| —      | Network failure, timeout or abort                               | `FacilPayConnectionError` | Network failures and timeouts: yes\*; caller aborts: no |
| —      | Bad parameters caught by the SDK                                | `FacilPayValidationError` | No (nothing was sent)                   |
| —      | Webhook signature mismatch                                      | `FacilPaySignatureVerificationError` | No                           |

\* Automatic retries use exponential backoff with full jitter (capped at 5 seconds) and run up to `maxRetries` times (default `2`). `GET`/`HEAD`/`OPTIONS` requests are always eligible; `POST`/`PUT`/`PATCH`/`DELETE` are only retried when they carry an `Idempotency-Key`. Every `POST` gets an auto-generated key unless you pass one. The error is only thrown once all retries are exhausted.

## Request and correlation IDs

Every `FacilPayAPIError` carries two identifiers you should log and include in support tickets:

- **`requestId`**: the `x-request-id` header returned by the API. It identifies this exact request in FacilPay's logs. Always include it when you contact support.
- **`correlationId`**: the `x-correlation-id` header returned by the API. Pass your own with the `correlationId` request option to tie an SDK call to a trace or job in your own system; the SDK sends it as `X-Correlation-Id`.

```ts
try {
  await facilpay.payments.retrieve('pay_123', { correlationId: 'order-1234' });
} catch (err) {
  if (err instanceof FacilPayAPIError) {
    logger.error('FacilPay request failed', {
      status: err.status,
      requestId: err.requestId,
      correlationId: err.correlationId,
      message: err.message,
    });
  }
  throw err;
}
```

A support ticket should contain the `requestId`, the `status`, the approximate time of the request and the endpoint you called. **Never** paste your API key or webhook secret into a ticket.

## Recommended `try/catch` patterns

Check the most specific classes first and fall back to `FacilPayError`:

```ts
import {
  FacilPayAPIError,
  FacilPayConnectionError,
  FacilPayError,
  FacilPayValidationError,
} from '@facilpay/sdk';

try {
  const payment = await facilpay.payments.create(
    { amount: 10, currency: 'USD' },
    { idempotencyKey: `order-${order.id}` },
  );
} catch (err) {
  if (err instanceof FacilPayValidationError) {
    // Your input is wrong. Fix the parameters; retrying will not help.
    return badRequest(err.message);
  }
  if (err instanceof FacilPayConnectionError) {
    // The SDK already retried. Safe to retry later with the same idempotency key.
    return scheduleRetry(order);
  }
  if (err instanceof FacilPayAPIError) {
    switch (err.status) {
      case 401:
      case 403:
        // Configuration problem: check the API key, scopes and IP allowlist.
        throw err;
      case 404:
        return notFound();
      case 409:
      case 422:
        // State conflict or rejected parameters. Inspect `err.body`.
        return conflict(err.body);
      case 429:
        // Rate limited even after automatic retries: slow down.
        return scheduleRetry(order);
      default:
        if (err.status >= 500) return scheduleRetry(order);
        throw err;
    }
  }
  if (err instanceof FacilPayError) {
    // Any other SDK error, e.g. `code === 'recurring_payment_invalid_state'`.
    throw err;
  }
  throw err; // Not an SDK error.
}
```

When verifying webhooks, reject the request on a signature failure and never process the payload:

```ts
try {
  const event = await facilpay.webhooks.constructEvent(rawBody, signature, secret);
  await handle(event);
  res.status(200).end();
} catch (err) {
  if (err instanceof FacilPaySignatureVerificationError) {
    res.status(400).send('Invalid signature');
    return;
  }
  throw err;
}
```

## What is safe to retry

| Situation                                       | Safe to retry? | Notes                                                                              |
| ----------------------------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| `FacilPayConnectionError` (network / timeout)   | Yes            | Reuse the **same** `idempotencyKey` for writes so a retry never charges twice.     |
| `FacilPayConnectionError` from your own abort   | Your call      | The request may or may not have reached the API; retry with the same key.          |
| `408`, `429`, `5xx`                             | Yes            | Back off first; honor `Retry-After` on `429`.                                      |
| `409` lock timeout                              | Yes            | Retried automatically. Other `409`s are real conflicts: re-read the resource first. |
| `400`, `401`, `403`, `404`, `422`               | No             | The request will fail again until you change it or your configuration.             |
| `FacilPayValidationError`                       | No             | Nothing was sent. Fix the input.                                                   |
| `FacilPaySignatureVerificationError`            | No             | Check the secret and that you pass the raw, unparsed body.                         |

To make retries safe across process restarts, pass your own idempotency key derived from your domain (for example the order ID) instead of relying on the auto-generated one. Keys expire on the server after 24 hours, and reusing a key with a different body returns `422`.
