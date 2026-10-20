# Configuration reference

Every option accepted by the `FacilPay` constructor (`FacilPayOptions`). All
options are optional; the only thing the SDK needs is an API key, which can come
from `apiKey` or the `FACILPAY_API_KEY` environment variable.

```ts
import { FacilPay } from '@facilpay/sdk';

const facilpay = new FacilPay({
  apiKey: 'fp_test_...',
  baseUrl: 'https://api.facilpay.io',
  timeout: 30_000,
  maxRetries: 2,
  headers: { 'X-Correlation-Id': 'checkout-service' },
  logger: console,
});
```

## Options

| Option            | Type                     | Default                                  | Example                                     |
| ----------------- | ------------------------ | ---------------------------------------- | ------------------------------------------- |
| `apiKey`          | `string`                 | `process.env.FACILPAY_API_KEY`           | `'fp_test_abc123'`                          |
| `baseUrl`         | `string`                 | `'https://api.facilpay.io'`              | `'http://localhost:3000'`                   |
| `version`         | `string`                 | SDK version (e.g. `'0.1.0'`)             | `'0.1.0'`                                   |
| `timeout`         | `number` (ms)            | `30000`                                  | `10_000`                                    |
| `maxRetries`      | `number`                 | `2`                                      | `0` (disable retries)                       |
| `fetch`           | `typeof fetch`           | `globalThis.fetch`                       | `proxyFetch`                                |
| `headers`         | `Record<string, string>` | `{}`                                     | `{ 'X-Correlation-Id': 'checkout' }`        |
| `logger`          | `Logger`                 | `console` when `FACILPAY_LOG=debug`, else none | `console`                             |
| `checkoutBaseUrl` | `string`                 | `''` (relative links)                    | `'https://pay.facilpay.io'`                 |

### `apiKey`

Your secret key. It must start with `fp_test_` (testnet) or `fp_live_`
(mainnet); the prefix sets `facilpay.environment` and `facilpay.isTestMode`.
The key is sent as `Authorization: ApiKey <key>` and is never exposed through
`toString()`, `toJSON()` or `util.inspect`.

If `apiKey` is omitted or an empty string, the SDK reads
`process.env.FACILPAY_API_KEY`. If neither is set, the constructor throws a
`FacilPayError`.

### `baseUrl`

The API origin. `/v1` is added to request paths automatically and trailing
slashes are stripped. It must be an absolute `http://` or `https://` URL; a
value such as `api.facilpay.io` or `localhost:3000` throws a `FacilPayError`.

### `version`

The SDK version reported in the `User-Agent` and `X-FacilPay-Client` headers
(`facilpay-sdk-js/<version> (<runtime>)`). You rarely need to change it.

### `timeout`

Per-request timeout in milliseconds. It can be overridden for a single call
with the `timeout` request option. It must be a positive, finite number;
`0`, negative values and `NaN` throw a `FacilPayError`.

### `maxRetries`

Maximum automatic retries for a failed request. Retries use exponential
backoff with jitter and respect `Retry-After`. They apply to network errors,
timeouts, `408`, `429`, `5xx` and `409` lock-timeout conflicts.
Non-idempotent requests (`POST`/`PUT`/`PATCH`/`DELETE`) are only retried when
an `Idempotency-Key` is present. Set `0` to disable retries. It can be
overridden per call with the `maxRetries` request option. It must be a
non-negative integer.

### `fetch`

The `fetch` implementation used for every request. Defaults to the runtime's
global `fetch` (Node.js 18+, Bun, Deno, edge runtimes and browsers). If the
runtime has no global `fetch` and none is passed, the constructor throws a
`FacilPayError` explaining how to provide one.

### `headers`

Extra headers sent with every request. Per-request `headers` are merged on top.
The `Authorization` header is always set by the SDK from the API key.

### `logger`

An object with optional `debug`, `info`, `warn` and `error` methods (for
example `console`, `pino` or `winston`). It receives request and response
details. API keys, webhook secrets, emails and sensitive headers are redacted
before they reach the logger.

### `checkoutBaseUrl`

The base URL for hosted payment-link checkout pages, used by
`facilpay.paymentLinks.checkoutUrl()`. Defaults to `''`, which produces
relative links.

## Environment variables

| Variable           | Effect                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `FACILPAY_API_KEY` | Used as the API key when `apiKey` is not passed. Read from `process.env`.                    |
| `FACILPAY_LOG`     | Set to `debug` to log requests and responses to `console` in Node.js when no `logger` is set. |

```bash
FACILPAY_API_KEY=fp_test_abc123 FACILPAY_LOG=debug node server.js
```

```ts
// Picks up FACILPAY_API_KEY from the environment
const facilpay = new FacilPay();
```

Both variables are only read where `process.env` exists. In edge runtimes and
browsers, pass `apiKey` (and `logger`) explicitly.

## Custom `fetch` for proxies

Pass any fetch-compatible function to route traffic through a proxy, add
instrumentation, or use a polyfill. For example, with
[`undici`](https://github.com/nodejs/undici)'s `ProxyAgent` in Node.js:

```ts
import { FacilPay } from '@facilpay/sdk';
import { fetch as undiciFetch, ProxyAgent } from 'undici';

const dispatcher = new ProxyAgent(process.env.HTTPS_PROXY!);

const facilpay = new FacilPay({
  apiKey: process.env.FACILPAY_API_KEY,
  fetch: ((input, init) => undiciFetch(input, { ...init, dispatcher })) as typeof fetch,
});
```

Wrapping the global `fetch` works the same way:

```ts
const facilpay = new FacilPay({
  fetch: async (input, init) => {
    const started = Date.now();
    const response = await fetch(input, init);
    console.log(`${init?.method ?? 'GET'} ${String(input)} ${response.status} ${Date.now() - started}ms`);
    return response;
  },
});
```

## Edge runtimes

The SDK only depends on `fetch`, so it runs in Cloudflare Workers, Vercel Edge
Functions, Deno Deploy and Bun without extra setup. Edge runtimes usually do
not expose `process.env`, so pass the key explicitly.

Cloudflare Workers:

```ts
import { FacilPay } from '@facilpay/sdk';

export default {
  async fetch(request: Request, env: { FACILPAY_API_KEY: string }): Promise<Response> {
    const facilpay = new FacilPay({ apiKey: env.FACILPAY_API_KEY });
    const payment = await facilpay.payments.create({ amount: 10, currency: 'USD' });
    return Response.json({ id: payment.id });
  },
};
```

Next.js route handler on the Edge runtime:

```ts
import { FacilPay } from '@facilpay/sdk';

export const runtime = 'edge';

const facilpay = new FacilPay({ apiKey: process.env.FACILPAY_API_KEY });

export async function POST(): Promise<Response> {
  const payment = await facilpay.payments.create({ amount: 10, currency: 'USD' });
  return Response.json({ id: payment.id });
}
```

Keep secret `fp_live_` keys on the server. The SDK logs a warning if a live key
is used in a browser.

## Validation errors

The constructor checks its options and throws a `FacilPayError` straight away
instead of failing on the first request:

| Problem                                              | Message starts with                    |
| ---------------------------------------------------- | -------------------------------------- |
| No `apiKey` and no `FACILPAY_API_KEY`                | `Missing API key.`                     |
| Key without an `fp_test_` / `fp_live_` prefix        | `Invalid API key.`                     |
| `timeout` not a positive finite number               | ``Invalid `timeout` option``           |
| `maxRetries` not a non-negative integer              | ``Invalid `maxRetries` option``        |
| `baseUrl` not an absolute `http(s)` URL              | ``Invalid `baseUrl` option``           |
| `fetch` passed but not a function                    | ``Invalid `fetch` option``             |
| No global `fetch` and no `fetch` option              | ``No `fetch` implementation found.``   |
