# Security Policy

## Supported versions

The SDK is pre-1.0. Security fixes are released for the latest minor version only.

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

Once `1.0.0` ships, the latest major version will receive security fixes, and the previous major version will receive critical fixes for 6 months after a new major is released.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions or pull requests.**

Report them privately through [GitHub private vulnerability reporting](https://github.com/Facil-Pay/facilpay-sdk/security/advisories/new) (**Security** tab → **Report a vulnerability**). Only the maintainers can see the report.

If you cannot use GitHub advisories, open a public issue that says only that you have a security report and asks a maintainer for a private contact. Do not include any details of the vulnerability in that issue.

Please include as much of the following as you can:

- The affected SDK version(s) and runtime (Node version, browser, edge runtime).
- The type of issue (e.g. webhook signature bypass, secret leaked to logs, request forgery).
- Steps to reproduce, or a proof-of-concept, using **test-mode** credentials only.
- The impact you believe the issue has.

Vulnerabilities in the FacilPay API, dashboard or Soroban contracts should be reported to the matching repository ([facilpay-api](https://github.com/Facil-Pay/facilpay-api), [facilpay-frontend](https://github.com/Facil-Pay/facilpay-frontend), [facilpay-contracts](https://github.com/Facil-Pay/facilpay-contracts)) the same way. If you are unsure where an issue belongs, report it here.

## Response timeline

| Step                                         | Target                                   |
| -------------------------------------------- | ---------------------------------------- |
| Acknowledge the report                       | Within 3 business days                   |
| Initial assessment and severity              | Within 7 business days                   |
| Fix released for critical / high severity    | Within 30 days of confirmation           |
| Fix released for medium / low severity       | In the next scheduled release            |
| Public disclosure (GitHub security advisory) | After a fix is released, credited to you unless you prefer otherwise |

We will keep you updated while we work on a fix and ask that you do not disclose the issue publicly until a fixed version is available.

## Handling API keys and webhook secrets

FacilPay credentials give full access to your account. Treat them like passwords.

- **Never commit live API keys (`fp_live_…`) or webhook signing secrets (`whsec_…`)** to source control, including examples, tests, issues, pull requests and screenshots. Test keys (`fp_test_…`) should not be committed either.
- Load credentials from environment variables or a secrets manager (e.g. `FACILPAY_API_KEY`, `FACILPAY_WEBHOOK_SECRET`) and keep `.env` files in `.gitignore`. The examples in this repository ship only `.env.example` files.
- Use `fp_live_…` keys **only on your server**. Never expose them in browser bundles, mobile apps or client-side environment variables (e.g. `NEXT_PUBLIC_*`).
- Give each key the smallest set of scopes it needs, and use an IP allowlist for server keys.
- If a key or secret is exposed, **rotate it immediately** (`facilpay.apiKeys.rotate()` / `facilpay.webhooks.rotateSecret()`) and then remove it from your history. Removing a commit does not revoke the key.
- Consider enabling [GitHub secret scanning](https://docs.github.com/en/code-security/secret-scanning) and a pre-commit hook that blocks the `fp_live_` and `whsec_` prefixes.

The SDK redacts `fp_live_…`, `fp_test_…` and `whsec_…` values, `Authorization` / `X-API-Key` headers and email addresses from its debug logs, but your own logging may not. Never log raw credentials.
