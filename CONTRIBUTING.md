# Contributing

Thanks for your interest in contributing to the FacilPay SDK!

## Prerequisites

- **Node.js 18 or newer** (the `engines` field in `package.json` requires
  `>=18`; CI runs on Node.js 20). Check with `node --version`.
- **npm** (ships with Node.js). The repo commits a `package-lock.json`, so use
  npm rather than yarn or pnpm.
- **Docker** with Docker Compose v2, only if you want to run the integration
  tests.

## Getting started

1. Fork and clone the repository:

   ```bash
   git clone https://github.com/<your-username>/facilpay-sdk.git
   cd facilpay-sdk
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the SDK:

   ```bash
   npm run build
   ```

   Build output goes to `dist/`, which is git-ignored. Never commit it.

## Development workflow

- Write source in `src/` using TypeScript.
- Keep public types in `src/types/`.
- Useful scripts:

  | Command                     | What it does                                |
  | --------------------------- | ------------------------------------------- |
  | `npm run build`             | Build ESM + CJS bundles and `.d.ts` files   |
  | `npm run dev`               | Rebuild on file changes                     |
  | `npm test`                  | Run the unit tests once                     |
  | `npm run test:watch`        | Run the unit tests in watch mode            |
  | `npm run test:coverage`     | Run the unit tests with coverage            |
  | `npm run lint`              | Lint with ESLint                            |
  | `npm run format`            | Format with Prettier                        |
  | `npm run typecheck`         | Typecheck the SDK                           |
  | `npm run typecheck:examples`| Typecheck the example apps                  |
  | `npm run publint` / `attw`  | Check the published package layout/types    |

## Running tests

### Unit tests

Unit tests use [Vitest](https://vitest.dev/) and live next to the code they
test (`src/**/*.test.ts`) or in `test/`. They mock `fetch`, so they need no
network or API server.

```bash
npm test                         # all unit tests
npx vitest run src/core/http     # a single file or folder
npm run test:watch               # re-run on change
npm run test:coverage            # with a coverage report in coverage/
```

### Integration tests

The integration suite in `test/integration/` runs the SDK against a real
facilpay-api and PostgreSQL started from
[`test/integration/docker-compose.yml`](test/integration/docker-compose.yml).
It is skipped automatically when `FACILPAY_API_KEY` is not set, so `npm test`
stays hermetic.

To run it locally:

1. Start the stack and wait for it to become healthy (the API listens on
   `http://localhost:4000`):

   ```bash
   docker compose -f test/integration/docker-compose.yml up -d --wait
   ```

   Set `FACILPAY_API_TAG` to test against a specific facilpay-api image tag.

2. Create a test API key (`fp_test_...`) against that API. The helper in
   [`test/integration/setup.ts`](test/integration/setup.ts) shows the exact
   calls: register a user, then `POST /v1/api-keys`. It also exports a Vitest
   `globalSetup` that does steps 1–3 for you.

3. Run the suite with the key:

   ```bash
   FACILPAY_API_KEY=fp_test_... FACILPAY_BASE_URL=http://localhost:4000 \
     npx vitest run test/integration
   ```

4. Tear the stack down when you are done:

   ```bash
   docker compose -f test/integration/docker-compose.yml down -v --remove-orphans
   ```

In CI, integration tests run on pushes to `main`, nightly, and on pull
requests labelled `run-integration`.

### Example typechecks

The apps in `examples/` (`express`, `nextjs`, `node-script`) import the built
SDK, so build first and install each example's dependencies:

```bash
npm run build
npm install --prefix examples/express
npm install --prefix examples/nextjs
npm install --prefix examples/node-script
npm run typecheck:examples
```

## Branches and commits

### Branch naming

Create a branch from an up-to-date `main` using a type prefix and a short,
kebab-case description. Include the issue number when there is one:

```text
feat/<short-description>      feat/42-payment-links-expiry
fix/<short-description>       fix/68-validate-client-options
docs/<short-description>      docs/78-configuration-reference
chore/<short-description>     chore/65-gitignore
test/<short-description>
refactor/<short-description>
```

### Conventional Commits

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<optional scope>): <short summary in the imperative>

<optional body explaining what and why>

<optional footer, e.g. Closes #68>
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`,
`ci`, `build`. Use the resource or module as the scope where it helps, for
example:

```text
feat(payments): add list filters for status and date range
fix(client): validate timeout and baseUrl options
docs: add configuration reference
```

Mark breaking changes with `!` after the type (`feat(client)!: ...`) and a
`BREAKING CHANGE:` footer describing the migration.

## Adding a new resource

Resources wrap one area of the `/v1` API (for example `payments` or
`disputes`). To add one, say `customers`:

1. **Create the resource** at `src/resources/customers.ts`. Export a class
   that takes the `HttpClient` in its constructor and calls `request(...)` with
   versioned paths (`/v1/customers`). Follow an existing resource such as
   [`src/resources/api-keys.ts`](src/resources/api-keys.ts): export the
   resource's param/response types from the same file, accept
   `ResourceRequestOptions` as the last argument of each method, and use the
   aliases in `src/types/` instead of importing `src/types/generated.ts`
   directly.
2. **Write tests** next to it at `src/resources/customers.test.ts`. Mock the
   HTTP client and assert the method, path, query, body and headers each call
   sends (see [`src/resources/api-keys.test.ts`](src/resources/api-keys.test.ts)).
   Cover error and pagination cases where they apply.
3. **Export it** from [`src/resources/index.ts`](src/resources/index.ts)
   (`export * from './customers';`), which is re-exported by `src/index.ts`.
4. **Wire it into the client** in [`src/client.ts`](src/client.ts): add a
   `readonly customers: CustomersResource;` property and create it in the
   constructor with `new CustomersResource(this.http)`.
5. **Document it** in the README: add a section under **Usage** with a short
   example, and add it to the table of contents.

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
- Reference the issue in the PR description (`Closes #123`).
- Update `CONTRIBUTING.md`, the README and `docs/` when you change the public
  API.
- Fill in [the pull request template](.github/PULL_REQUEST_TEMPLATE.md). Before
  requesting review, make sure you can tick every item in its checklist:

  - [ ] My code follows the style guidelines of this project (`npm run lint`,
        `npm run format`)
  - [ ] I have performed a self-review of my own code
  - [ ] I have added tests that prove my fix is effective or that my feature
        works
  - [ ] New and existing unit tests pass locally with my changes (`npm test`)
  - [ ] Lint and typecheck pass locally (`npm run lint`, `npm run typecheck`,
        and `npm run typecheck:examples` if you touched the public API)
  - [ ] I have updated the documentation accordingly
