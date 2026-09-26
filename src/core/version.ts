/**
 * SDK version and runtime detection helpers.
 *
 * Kept dependency-free so it can run in Node 18+, Bun, Deno, edge runtimes
 * and browsers without touching Node-only APIs.
 */

export const VERSION = '0.1.0';

/**
 * Best-effort runtime identifier used in the `User-Agent` /
 * `X-FacilPay-Client` headers, e.g. `facilpay-sdk-js/0.1.0 (node)`.
 */
export function detectRuntime(): string {
  const g = globalThis as Record<string, unknown>;

  // Bun exposes a global `Bun` object.
  if (typeof g.Bun !== 'undefined') {
    return 'bun';
  }

  // Deno exposes a global `Deno` object.
  if (typeof g.Deno !== 'undefined') {
    return 'deno';
  }

  // Node exposes `process.versions.node` (guarded so edge/browser is safe).
  const proc = g.process as { versions?: { node?: string } } | undefined;
  if (proc && proc.versions && typeof proc.versions.node === 'string') {
    return 'node';
  }

  // Cloudflare Workers / Vercel Edge expose `EdgeRuntime`.
  if (typeof g.EdgeRuntime !== 'undefined') {
    return 'edge';
  }

  if (typeof g.window !== 'undefined') {
    return 'browser';
  }

  return 'unknown';
}

/**
 * Builds the client identifier sent on every request.
 */
export function clientUserAgent(version: string = VERSION): string {
  return `facilpay-sdk-js/${version} (${detectRuntime()})`;
}
