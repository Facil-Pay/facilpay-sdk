import { FacilPayConnectionError, FacilPayError } from './errors';

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
  signal?: AbortSignal;
  responseType?: ResponseType;
  timeout?: number;
}

export interface HttpClientOptions {
  baseUrl?: string;
  apiKey?: string;
  version?: string;
  timeout?: number;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
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

  constructor(options: HttpClientOptions = {}) {
    this.baseUrl = stripTrailingSlashes(options.baseUrl ?? DEFAULT_BASE_URL);
    this.version = options.version ?? '0.0.0';
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = { ...options.headers };
  }

  private buildHeaders(extra?: Record<string, string>, idempotencyKey?: string): Record<string, string> {
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
    return headers;
  }

  async request<T = unknown, TBody = unknown>(options: RequestOptions<TBody>): Promise<HttpResponse<T>> {
    const {
      method = 'GET',
      path,
      query,
      body,
      headers,
      idempotencyKey,
      signal,
      responseType = 'json',
      timeout = this.timeout,
    } = options;

    const url = buildUrl(this.baseUrl, path, query);
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

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers: this.buildHeaders(headers, idempotencyKey),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });

      const requestId = response.headers.get('x-request-id') ?? undefined;
      const correlationId = response.headers.get('x-correlation-id') ?? undefined;

      if (!response.ok) {
        const errorBody = await this.parseBody(response, responseType);
        throw new FacilPayError(
          `Request failed with status ${response.status}`,
          response.status,
          errorBody,
          requestId,
          correlationId,
        );
      }

      const data = (await this.parseBody(response, responseType)) as T;
      return { data, status: response.status, headers: response.headers, requestId, correlationId };
    } catch (error) {
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
