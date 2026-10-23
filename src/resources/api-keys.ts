import type { HttpClient } from '../core/http';
import type { ResourceRequestOptions } from './request-options';

/**
 * Scope granted to an API key. Mirrors the scopes accepted by the API.
 */
export type ApiKeyScope =
  | 'payments:read'
  | 'payments:write'
  | 'refunds:read'
  | 'refunds:write'
  | 'customers:read'
  | 'customers:write'
  | 'webhooks:read'
  | 'webhooks:write';

/**
 * Environment an API key operates in.
 */
export type ApiKeyEnvironment = 'test' | 'live';

export interface ApiKey {
  id: string;
  name: string;
  environment: ApiKeyEnvironment;
  scopes: ApiKeyScope[];
  allowedIps?: string[];
  /** Only present in the response of `create` and `rotate`. */
  key?: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApiKeyParams {
  name: string;
  environment: ApiKeyEnvironment;
  scopes?: ApiKeyScope[];
  allowedIps?: string[];
}

export interface UpdateApiKeyParams {
  name?: string;
  scopes?: ApiKeyScope[];
  allowedIps?: string[];
}

export interface ApiKeyUsageParams {
  from?: string;
  to?: string;
  interval?: 'hour' | 'day' | 'month';
}

export interface ApiKeyUsage {
  apiKeyId: string;
  totalRequests: number;
  period: { from: string; to: string };
  data: Array<{ timestamp: string; requests: number }>;
}

/**
 * API Keys resource.
 *
 * Auth notes:
 * - `create`, `list`, `retrieve`, `update`, `revoke`, `rotate` and `usage`
 *   manage key material and therefore require a **user JWT** (pass
 *   `accessToken` to the client) rather than an API key.
 * - The plaintext `key` returned by `create` and `rotate` is only ever
 *   returned once and is never logged by the SDK logger.
 */
export class ApiKeysResource {
  constructor(private readonly client: HttpClient) {}

  private unwrap<T>(promise: Promise<HttpResponse<T>>): Promise<T> {
    return promise.then((response) => response.data);
  }

  /**
   * Create a new API key. Requires user JWT auth.
   * The returned `key` is the plaintext secret and is shown only once.
   *
   * `POST /v1/api-keys`
   *
   * @param params - Key name, environment, scopes and optional IP allowlist.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The created key, including the one-time plaintext `key`.
   * @throws {FacilPayAPIError} When the API rejects the request (e.g. `401` without a user JWT, `422` invalid scopes).
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const apiKey = await facilpay.apiKeys.create({
   *   name: 'Checkout server',
   *   environment: 'test',
   *   scopes: ['payments:write'],
   * });
   * console.log(apiKey.key); // store it now, it is never shown again
   * ```
   */
  create(params: CreateApiKeyParams, options?: ResourceRequestOptions): Promise<ApiKey> {
    return this.unwrap(this.client.request<ApiKey>({
      method: 'POST',
      path: '/v1/api-keys',
      body: params,
      ...options,
    }));
  }

  /**
   * List API keys. Requires user JWT auth.
   *
   * `GET /v1/api-keys`
   *
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns Every API key of the account (without plaintext secrets).
   * @throws {FacilPayAPIError} When the API rejects the request (e.g. `401` without a user JWT).
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const keys = await facilpay.apiKeys.list();
   * ```
   */
  list(options?: ResourceRequestOptions): Promise<ApiKey[]> {
    return this.unwrap(this.client.request<ApiKey[]>({
      method: 'GET',
      path: '/v1/api-keys',
      ...options,
    }));
  }

  /**
   * Retrieve a single API key by id. Requires user JWT auth.
   *
   * `GET /v1/api-keys/:id`
   *
   * @param id - API key id.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The API key (without its plaintext secret).
   * @throws {FacilPayAPIError} When the key does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const apiKey = await facilpay.apiKeys.retrieve('key_123');
   * ```
   */
  retrieve(id: string, options?: ResourceRequestOptions): Promise<ApiKey> {
    return this.unwrap(this.client.request<ApiKey>({
      method: 'GET',
      path: `/v1/api-keys/${encodeURIComponent(id)}`,
      ...options,
    }));
  }

  /**
   * Update an API key's name, scopes or IP allowlist. Requires user JWT auth.
   *
   * `PATCH /v1/api-keys/:id`
   *
   * @param id - API key id.
   * @param params - Fields to change.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The updated API key.
   * @throws {FacilPayAPIError} When the key does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * await facilpay.apiKeys.update('key_123', { allowedIps: ['203.0.113.10'] });
   * ```
   */
  update(
    id: string,
    params: UpdateApiKeyParams,
    options?: ResourceRequestOptions,
  ): Promise<ApiKey> {
    return this.client.request<ApiKey>({
      method: 'PATCH',
      path: `/v1/api-keys/${encodeURIComponent(id)}`,
      body: params,
      ...options,
    }));
  }

  /**
   * Revoke an API key. Requires user JWT auth.
   * Requests made with a revoked key fail with `401`.
   *
   * `DELETE /v1/api-keys/:id`
   *
   * @param id - API key id.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The revoked API key, with `revokedAt` set.
   * @throws {FacilPayAPIError} When the key does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * await facilpay.apiKeys.revoke('key_123');
   * ```
   */
  revoke(id: string, options?: ResourceRequestOptions): Promise<ApiKey> {
    return this.unwrap(this.client.request<ApiKey>({
      method: 'DELETE',
      path: `/v1/api-keys/${encodeURIComponent(id)}`,
      ...options,
    }));
  }

  /**
   * Rotate an API key, returning the new plaintext key once.
   * Requires user JWT auth. The plaintext key is never logged.
   *
   * `POST /v1/api-keys/:id/rotate`
   *
   * @param id - API key id.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The API key with its new one-time plaintext `key`.
   * @throws {FacilPayAPIError} When the key does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const { key } = await facilpay.apiKeys.rotate('key_123');
   * ```
   */
  rotate(id: string, options?: ResourceRequestOptions): Promise<ApiKey> {
    return this.unwrap(this.client.request<ApiKey>({
      method: 'POST',
      path: `/v1/api-keys/${encodeURIComponent(id)}/rotate`,
      ...options,
    }));
  }

  /**
   * Fetch usage statistics for an API key. Requires user JWT auth.
   *
   * `GET /v1/api-keys/:id/usage`
   *
   * @param id - API key id.
   * @param params - Optional `from`/`to` range and bucket `interval`.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns Request counts for the key over the requested period.
   * @throws {FacilPayAPIError} When the key does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const usage = await facilpay.apiKeys.usage('key_123', { interval: 'day' });
   * console.log(usage.totalRequests);
   * ```
   */
  usage(
    id: string,
    params?: ApiKeyUsageParams,
    options?: ResourceRequestOptions,
  ): Promise<ApiKeyUsage> {
    return this.client.request<ApiKeyUsage>({
      method: 'GET',
      path: `/v1/api-keys/${encodeURIComponent(id)}/usage`,
      query: params ? { ...params } : undefined,
      ...options,
    }));
  }
}
