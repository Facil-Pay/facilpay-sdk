import { FacilPayConnectionError, FacilPayError, createApiError } from './errors';
import { detectRuntime, VERSION, clientUserAgent } from './version';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type ResponseType = 'json' | 'text' | 'arrayBuffer';

export type QueryValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | Array<string | number | boolean | Date | null | undefined>;

export type QueryParams = Record<string, QueryValue>;

export interface RequestOptions<TBody = unknown> {
  method?: HttpMethod;
  path: string;
  query?: QueryParams;
  body?: TBody;
  headers?: Record<string, string>;
  idempotencyKey?: string;
  correlationId?: string;
  signal?: AbortSignal;
  responseType?: ResponseType;
  timeout?: number;
  /**
   * Maximum retries for this request. Overrides the client-level `maxRetries`.
   */
  maxRetries?: number;
}

export interface Logger {
  debug?: (...args: (string | object)[]) => unknown;
  info?: (...args: (string | object)[]) => unknown;
  warn?: (...args: (string | object)[]) => unknown;
  error?: (...args: (string | object)[]) => unknown;
}

export interface HttpClientOptions {
  baseUrl?: string;
  apiKey?: string;
  version?: string;
  timeout?: number;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  logger?: Logger;
  /**
   * Maximum automatic retries for failed requests. Defaults to 2.
   *
   * Retries apply to network errors, timeouts, `408`, `429`, `5xx` and `409`
   * lock-timeout conflicts. Non-idempotent requests (`POST`/`PUT`/`PATCH`/
   * `DELETE`) are only retried when an `Idempotency-Key` is present.
   */
  maxRetries?: number;
}

export interface HttpResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  requestId?: string;
  correlationId?: string;
}

export const DEFAULT_BASE_URL = 'https://api.facilpay.io';
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 250;
const MAX_RETRY_DELAY_MS = 5_000;

function stripTrailingSlashes(url: string): string {
  return url.replace(/\/+$/, '');
}

function serializeQueryValue(value: Exclude<QueryValue, undefined>): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

const REDACTED = '[REDACTED]';
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const TOKEN_PATTERN = /\b(?:whsec_[A-Z0-9_-]+|fp_(?:live|test)_[A-Z0-9_-]+)\b/gi;
const SENSITIVE_KEY_PATTERN = /authorization|x-api-key|secret/i;

function redactString(value: string): string {
  return value.replace(EMAIL_PATTERN, '[REDACTED_EMAIL]').replace(TOKEN_PATTERN, REDACTED);
}

function redactForLog(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEY_PATTERN.test(key)) return REDACTED;
  if (typeof value === 'string') return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactForLog(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        redactForLog(childValue, childKey),
      ]),
    );
  }
  return value;
}

function getEnvironmentLogger(): Logger | undefined {
  const g = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  if (detectRuntime() !== 'node' || g.process?.env?.FACILPAY_LOG !== 'debug') return undefined;
  return console;
}

function responseHeadersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function parseRetryAfter(headers: Headers): number | undefined {
  const raw = headers.get('retry-after');
  if (raw === null) return undefined;
  const seconds = Number(raw);
  return Number.isFinite(seconds) ? seconds : undefined;
}

export function serializeQuery(query?: QueryParams): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === undefined) continue;
        params.append(key, serializeQueryValue(item));
      }
    } else {
      params.append(key, serializeQueryValue(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const base = stripTrailingSlashes(baseUrl);
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}/v1${normalizedPath}${serializeQuery(query)}`;
}

/**
 * Parses a `Retry-After` header value (delay seconds or an HTTP-date) into a
 * millisecond delay. Returns `undefined` when the value is missing/invalid.
 */
export function parseRetryAfterMs(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  const time = Date.parse(trimmed);
  if (!Number.isNaN(time)) {
    return Math.max(0, time - Date.now());
  }
  return undefined;
}

/**
 * Computes the delay before the next attempt: exponential backoff with full
 * jitter, capped at `MAX_RETRY_DELAY_MS`. A server-provided `Retry-After`
 * delay is honored (capped) instead of the computed backoff.
 */
export function getRetryDelayMs(failedAttempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) {
    return Math.min(Math.max(0, retryAfterMs), MAX_RETRY_DELAY_MS);
  }
  const cap = Math.min(MAX_RETRY_DELAY_MS, INITIAL_RETRY_DELAY_MS * 2 ** (failedAttempt - 1));
  return Math.random() * cap;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function isLockTimeoutBody(body: unknown): boolean {
  if (typeof body === 'string') return /lock|timeout/i.test(body);
  if (body && typeof body === 'object') {
    return Object.values(body).some((value) => isLockTimeoutBody(value));
  }
  return false;
}

/**
 * Whether a failed response status is worth retrying. `409` is only retried
 * when the body signals a lock timeout, so genuine conflicts fail fast.
 */
export function isRetryableStatus(status: number, body?: unknown): boolean {
  if (status === 408 || status === 429) return true;
  if (status >= 500 && status <= 599) return true;
  if (status === 409) return isLockTimeoutBody(body);
  return false;
}

export class HttpClient {
  readonly baseUrl: string;
  readonly version: string;
  readonly timeout: number;
  readonly maxRetries: number;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;
  private readonly logger?: Logger;

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = stripTrailingSlashes(options.baseUrl ?? DEFAULT_BASE_URL);
    this.version = options.version ?? VERSION;
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = { ...options.headers };
    this.logger = options.logger ?? getEnvironmentLogger();
  }

  private buildHeaders(
    extra?: Record<string, string>,
    idempotencyKey?: string,
    correlationId?: string,
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': clientUserAgent(this.version),
      'X-FacilPay-Client': clientUserAgent(this.version),
      ...this.defaultHeaders,
      ...extra,
    };
    if (this.apiKey) headers.Authorization = `ApiKey ${this.apiKey}`;
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    if (correlationId) {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === 'x-correlation-id') delete headers[key];
      }
      headers['X-Correlation-Id'] = correlationId;
    }
    return headers;
  }

  private logRequest(level: 'debug' | 'error', details: Record<string, unknown>): void {
    try {
      this.logger?.[level]?.(redactForLog(details));
    } catch {
      // Logging must never change request behavior.
    }
  }

  async request<T = unknown, TBody = unknown>(
    options: RequestOptions<TBody>,
  ): Promise<HttpResponse<T>> {
    const {
      method = 'GET',
      path,
      query,
      body,
      headers,
      idempotencyKey: providedIdempotencyKey,
      correlationId,
      signal,
      responseType = 'json',
      timeout = this.timeout,
      maxRetries = this.maxRetries,
    } = options;

    // Resolve the idempotency key once per logical request so that retries of
    // this call reuse the same key. POST requests get an auto-generated key
    // when the caller did not provide one; caller-provided keys are always
    // validated before anything is sent.
    let idempotencyKey: string | undefined;
    if (providedIdempotencyKey !== undefined) {
      idempotencyKey = validateIdempotencyKey(providedIdempotencyKey);
    } else if (method === 'POST') {
      idempotencyKey = generateIdempotencyKey();
    }

    const url = buildUrl(this.baseUrl, path, query);
    const requestHeaders = this.buildHeaders(headers, idempotencyKey, correlationId);
    const canRetryRequest = this.isRetryableRequest(method, requestHeaders, idempotencyKey);
    const startedAt = Date.now();

    let responseStatus: number | undefined;
    let requestId: string | undefined;
    let responseHeaders: Record<string, string> | undefined;
    let responseBody: unknown;

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: requestHeaders,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      responseStatus = response.status;
      responseHeaders = responseHeadersToObject(response.headers);
      requestId = response.headers.get('x-request-id') ?? undefined;
      const correlationId = response.headers.get('x-correlation-id') ?? undefined;
      responseBody = await this.parseBody(response, responseType);

      if (!response.ok) {
        throw createApiError(response.status, {
          body: responseBody,
          requestId,
          correlationId,
          retryAfter: parseRetryAfter(response.headers),
        });
      }
      const cleanupAttempt = (): void => {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onExternalAbort);
      };

      let responseStatus: number | undefined;
      let requestId: string | undefined;
      let responseHeaders: Record<string, string> | undefined;
      let responseBody: unknown;

      try {
        const response = await this.fetchImpl(url, {
          method,
          headers: requestHeaders,
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        });

        responseStatus = response.status;
        responseHeaders = responseHeadersToObject(response.headers);
        requestId = response.headers.get('x-request-id') ?? undefined;
        const responseCorrelationId = response.headers.get('x-correlation-id') ?? undefined;
        responseBody = await this.parseBody(response, responseType);

        if (!response.ok) {
          if (
            attempt <= maxRetries &&
            canRetryRequest &&
            isRetryableStatus(response.status, responseBody)
          ) {
            const retryAfterMs = parseRetryAfterMs(response.headers.get('retry-after'));
            const delayMs = getRetryDelayMs(attempt, retryAfterMs);
            cleanupAttempt();
            await sleep(delayMs, signal);
            continue;
          }
          throw new FacilPayError(
            `Request failed with status ${response.status}`,
            response.status,
            responseBody,
            requestId,
            responseCorrelationId,
          );
        }

        this.logRequest('debug', {
          method,
          path,
          query,
          status: responseStatus,
          durationMs: Date.now() - startedAt,
          attempt,
          requestId,
          request: { headers: requestHeaders, body },
          response: { headers: responseHeaders, body: responseBody },
        });
        const data = responseBody as T;
        cleanupAttempt();
        return { data, status: response.status, headers: response.headers, requestId, correlationId: responseCorrelationId };
      } catch (error) {
        if (error instanceof FacilPayError) {
          this.logRequest('error', {
            method,
            path,
            query,
            status: responseStatus,
            durationMs: Date.now() - startedAt,
            attempt,
            requestId,
            request: { headers: requestHeaders, body },
            response: { headers: responseHeaders, body: responseBody },
            error: error.message,
          });
          cleanupAttempt();
          throw error;
        }
        const abortedByCaller =
          signal?.aborted === true ||
          (error instanceof Error && error.name === 'AbortError' && !timedOut);
        if (!abortedByCaller && attempt <= maxRetries && canRetryRequest) {
          // Network error or client-side timeout: safe to retry with backoff.
          const delayMs = getRetryDelayMs(attempt);
          cleanupAttempt();
          await sleep(delayMs, signal);
          continue;
        }
        this.logRequest('error', {
          method,
          path,
          query,
          status: responseStatus,
          durationMs: Date.now() - startedAt,
          attempt,
          requestId,
          request: { headers: requestHeaders, body },
          response: { headers: responseHeaders, body: responseBody },
          error: error instanceof Error ? error.message : String(error),
        });
        cleanupAttempt();
        if (timedOut) {
          throw new FacilPayConnectionError(`Request timed out after ${timeout}ms`, error);
        }
        if (error instanceof Error && error.name === 'AbortError') {
          throw new FacilPayConnectionError('Request was aborted', error);
        }
        throw new FacilPayConnectionError('Network request failed', error);
      }
    }
  }

  private async parseBody(response: Response, responseType: ResponseType): Promise<unknown> {
    if (responseType === 'arrayBuffer') return response.arrayBuffer();
    if (responseType === 'text') return response.text();
    const text = await response.text();
    if (!text) return undefined;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /**
   * Convenience options for the `get`/`post`/`patch`/`put`/`delete` helpers.
   * Accepts `params` as an alias of `query` for resource modules.
   */
  private unwrapOptions(
    options: Omit<RequestOptions, 'method' | 'path' | 'body' | 'query'> & {
      query?: QueryParams;
      params?: object;
    },
  ): Omit<RequestOptions, 'method' | 'path' | 'body'> {
    const { params, query, ...rest } = options;
    return { ...rest, query: { ...(params as QueryParams | undefined), ...query } };
  }

  /** `GET` helper that resolves with the unwrapped response body. */
  async get<T>(
    path: string,
    options: Omit<RequestOptions, 'method' | 'path' | 'body' | 'query'> & {
      query?: QueryParams;
      params?: object;
    } = {},
  ): Promise<T> {
    const response = await this.request<T>({ ...this.unwrapOptions(options), method: 'GET', path });
    return response.data;
  }

  /** `POST` helper that resolves with the unwrapped response body. */
  async post<T, TBody = unknown>(
    path: string,
    body?: TBody,
    options: Omit<RequestOptions, 'method' | 'path' | 'body' | 'query'> & {
      query?: QueryParams;
      params?: object;
    } = {},
  ): Promise<T> {
    const response = await this.request<T, TBody>({
      ...this.unwrapOptions(options),
      method: 'POST',
      path,
      body,
    });
    return response.data;
  }

  /** `PUT` helper that resolves with the unwrapped response body. */
  async put<T, TBody = unknown>(
    path: string,
    body?: TBody,
    options: Omit<RequestOptions, 'method' | 'path' | 'body' | 'query'> & {
      query?: QueryParams;
      params?: object;
    } = {},
  ): Promise<T> {
    const response = await this.request<T, TBody>({
      ...this.unwrapOptions(options),
      method: 'PUT',
      path,
      body,
    });
    return response.data;
  }

  /** `PATCH` helper that resolves with the unwrapped response body. */
  async patch<T, TBody = unknown>(
    path: string,
    body?: TBody,
    options: Omit<RequestOptions, 'method' | 'path' | 'body' | 'query'> & {
      query?: QueryParams;
      params?: object;
    } = {},
  ): Promise<T> {
    const response = await this.request<T, TBody>({
      ...this.unwrapOptions(options),
      method: 'PATCH',
      path,
      body,
    });
    return response.data;
  }

  /** `DELETE` helper that resolves with the unwrapped response body. */
  async delete<T>(
    path: string,
    options: Omit<RequestOptions, 'method' | 'path' | 'body' | 'query'> & {
      query?: QueryParams;
      params?: object;
    } = {},
  ): Promise<T> {
    const response = await this.request<T>({ ...this.unwrapOptions(options), method: 'DELETE', path });
    return response.data;
  }

  /**
   * `GET` helper for page-based list endpoints. Returns a `PagePromise` that
   * resolves to the first page and iterates every page with `for await`.
   */
  getPage<T, TParams extends { page?: number; limit?: number } = { page?: number; limit?: number }>(
    path: string,
    params?: TParams,
    options: Omit<RequestOptions, 'method' | 'path' | 'body' | 'query'> & {
      query?: QueryParams;
      params?: object;
    } = {},
  ): PagePromise<T> {
    const { page: _initialPage, limit = 20, ...restParams } = (params ?? {}) as {
      page?: number;
      limit?: number;
    } & Record<string, unknown>;
    void _initialPage;
    const base = this.unwrapOptions(options);
    return paginate<T>((page) =>
      this.get<PageEnvelope<T>>(path, {
        ...base,
        query: { ...base.query, ...(restParams as QueryParams), page, limit },
      }),
    );
  }
}
