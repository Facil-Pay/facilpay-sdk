import { FacilPayAPIError, FacilPayConnectionError, FacilPayError } from './errors';
import { generateIdempotencyKey, validateIdempotencyKey } from './idempotency';

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
}

/**
 * Per-call options accepted by the {@link HttpClient} convenience helpers
 * (`get`/`post`/`put`/`patch`/`delete`) and by resource request-option bags.
 *
 * Identical to {@link RequestOptions} minus the transport fields the helpers
 * fill in (`method`, `path`, `body`), plus an optional `params` alias that
 * helpers forward as the query string.
 */
export type BaseRequestOptions = Omit<RequestOptions, 'method' | 'path' | 'body'>;

export interface HelperOptions extends BaseRequestOptions {
  /**
   * Query parameters forwarded as the URL query string.
   * Accepts plain param objects (e.g. `{ page: 2 }`) as well as `query`.
   */
  params?: object;
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

export function detectRuntime(): string {
  const g = globalThis as Record<string, unknown>;
  if (typeof g.Bun !== 'undefined') return 'bun';
  if (typeof g.Deno !== 'undefined') return 'deno';
  if (typeof g.EdgeRuntime !== 'undefined') return 'edge';
  if (typeof g.window !== 'undefined' && typeof g.document !== 'undefined') return 'browser';
  if (typeof g.process !== 'undefined') return 'node';
  return 'unknown';
}

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
  return value
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(TOKEN_PATTERN, REDACTED);
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
  const g = globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } };
  if (detectRuntime() !== 'node' || g.process?.env?.FACILPAY_LOG !== 'debug') return undefined;
  return console;
}

/**
 * Resolve the message for a failed response, preferring the API's own
 * `message` field when the body carries one.
 */
function extractErrorMessage(body: unknown, status: number): string {
  if (typeof body === 'string' && body.length > 0) {
    return body;
  }
  if (body !== null && typeof body === 'object') {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }
  return `Request failed with status ${status}`;
}

function responseHeadersToObject(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
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

export class HttpClient {
  readonly baseUrl: string;
  readonly version: string;
  readonly timeout: number;
  private readonly apiKey?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultHeaders: Record<string, string>;
  private readonly logger?: Logger;

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = stripTrailingSlashes(options.baseUrl ?? DEFAULT_BASE_URL);
    this.version = options.version ?? '0.0.0';
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
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
      'User-Agent': `facilpay-sdk-js/${this.version} (${detectRuntime()})`,
      'X-FacilPay-Client': `facilpay-sdk-js/${this.version} (${detectRuntime()})`,
      ...this.defaultHeaders,
      ...extra,
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;
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
      this.logger?.[level]?.(redactForLog(details) as string | object);
    } catch {
      // Logging must never change request behavior.
    }
  }

  /**
   * Convenience helpers used by resources. Each helper performs a `request`
   * with the given method and resolves to the response body directly.
   */
  get<T>(path: string, options?: HelperOptions): Promise<T> {
    return this.requestWithBody<T>(path, 'GET', undefined, options);
  }

  post<T>(path: string, body?: unknown, options?: HelperOptions): Promise<T> {
    return this.requestWithBody<T>(path, 'POST', body, options);
  }

  put<T>(path: string, body?: unknown, options?: HelperOptions): Promise<T> {
    return this.requestWithBody<T>(path, 'PUT', body, options);
  }

  patch<T>(path: string, body?: unknown, options?: HelperOptions): Promise<T> {
    return this.requestWithBody<T>(path, 'PATCH', body, options);
  }

  delete<T>(path: string, options?: HelperOptions): Promise<T> {
    return this.requestWithBody<T>(path, 'DELETE', undefined, options);
  }

  private async requestWithBody<T>(
    path: string,
    method: HttpMethod,
    body: unknown,
    options?: HelperOptions,
  ): Promise<T> {
    const { params, query, ...rest } = options ?? {};
    const response = await this.request<T, unknown>({
      ...rest,
      method,
      path,
      body,
      query: (params as QueryParams | undefined) ?? query,
    });
    return response.data;
  }

  async request<T = unknown, TBody = unknown>(options: RequestOptions<TBody>): Promise<HttpResponse<T>> {
    const {
      method = 'GET',
      path,
      query,
      body,
      headers,
      idempotencyKey,
      correlationId,
      signal,
      responseType = 'json',
      timeout = this.timeout,
    } = options;

    // POST requests carry an Idempotency-Key so retried logical requests
    // reuse the same key. A caller-provided key is validated before sending;
    // otherwise a fresh key is generated once per request.
    let resolvedIdempotencyKey = idempotencyKey;
    if (method === 'POST') {
      resolvedIdempotencyKey = resolvedIdempotencyKey
        ? validateIdempotencyKey(resolvedIdempotencyKey)
        : generateIdempotencyKey();
    }

    const url = buildUrl(this.baseUrl, path, query);
    const requestHeaders = this.buildHeaders(headers, resolvedIdempotencyKey, correlationId);
    const startedAt = Date.now();
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeout);

    const onExternalAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onExternalAbort, { once: true });
    }

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
        throw new FacilPayAPIError(extractErrorMessage(responseBody, response.status), {
          status: response.status,
          body: responseBody,
          requestId,
          correlationId,
        });
      }

      this.logRequest('debug', {
        method,
        path,
        query,
        status: responseStatus,
        durationMs: Date.now() - startedAt,
        attempt: 1,
        requestId,
        request: { headers: requestHeaders, body },
        response: { headers: responseHeaders, body: responseBody },
      });
      const data = responseBody as T;
      return { data, status: response.status, headers: response.headers, requestId, correlationId };
    } catch (error) {
      this.logRequest('error', {
        method,
        path,
        query,
        status: responseStatus,
        durationMs: Date.now() - startedAt,
        attempt: 1,
        requestId,
        request: { headers: requestHeaders, body },
        response: { headers: responseHeaders, body: responseBody },
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof FacilPayError) throw error;
      if (timedOut) {
        throw new FacilPayConnectionError(`Request timed out after ${timeout}ms`, error);
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new FacilPayConnectionError('Request was aborted', error);
      }
      throw new FacilPayConnectionError('Network request failed', error);
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onExternalAbort);
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
}
