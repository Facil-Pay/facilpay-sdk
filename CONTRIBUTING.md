# Contributing

Thanks for your interest in contributing to the FacilPay SDK!

## Getting started

1. Fork and clone the repository.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the SDK:

   ```bash
   npm run build
   ```

## Development workflow

- Write source in `src/` using TypeScript.
- Keep public types in `src/types/`.
- Run the test suite before opening a pull request:

  ```bash
  npm test
  ```

## Regenerating API types

The SDK's request/response types are generated from the facilpay-api OpenAPI
(Swagger) document so the SDK and the API stay in sync. The generated file is
committed at `src/types/generated.ts`.

### 1. Obtain the OpenAPI document

facilpay-api exposes its OpenAPI JSON at `/docs-json` when the server is
running. Either point the generator at a running instance or at a saved copy of
the document:

```bash
# From a running facilpay-api instance
curl http://localhost:3000/docs-json -o openapi.json
```

### 2. Generate the types

```bash
npm run generate:types
```

This runs `openapi-typescript` against `openapi.json` and writes the result to
`src/types/generated.ts`. Commit the regenerated file together with any code
that consumes the changed types.

### 3. Use the ergonomic aliases

Do not import from `src/types/generated.ts` directly in resource code. Instead,
use the hand-written aliases exported from `src/types/index.ts` (for example
`Payment`, `PaymentStatus`, `PaymentLink`, `Refund`, `Dispute`,
`WebhookEndpoint`, `Settlement`). These aliases keep call sites readable while
still tracking the generated schema.

### 4. Keep the generated file up to date

CI regenerates the types and fails if the committed `src/types/generated.ts` is
out of date. If CI fails on this check, run `npm run generate:types` locally and
commit the result.

## Pull requests

- Keep changes focused and scoped to a single issue.
- Update `CONTRIBUTING.md` and the README when you change the public API.
- Make sure `npm run build` and `npm test` pass before requesting review.
