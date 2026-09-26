import type { HttpClient } from '../client';

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

  /**
   * Create a new API key. Requires user JWT auth.
   * The returned `key` is the plaintext secret and is shown only once.
   */
  create(params: CreateApiKeyParams): Promise<ApiKey> {
    return this.client.request<ApiKey>({
      method: 'POST',
      path: '/v1/api-keys',
      body: params,
    });
  }

  /** List API keys. Requires user JWT auth. */
  list(): Promise<ApiKey[]> {
    return this.client.request<ApiKey[]>({
      method: 'GET',
      path: '/v1/api-keys',
    });
  }

  /** Retrieve a single API key by id. Requires user JWT auth. */
  retrieve(id: string): Promise<ApiKey> {
    return this.client.request<ApiKey>({
      method: 'GET',
      path: `/v1/api-keys/${encodeURIComponent(id)}`,
    });
  }

  /** Update an API key's metadata. Requires user JWT auth. */
  update(id: string, params: UpdateApiKeyParams): Promise<ApiKey> {
    return this.client.request<ApiKey>({
      method: 'PATCH',
      path: `/v1/api-keys/${encodeURIComponent(id)}`,
      body: params,
    });
  }

  /** Revoke an API key. Requires user JWT auth. */
  revoke(id: string): Promise<ApiKey> {
    return this.client.request<ApiKey>({
      method: 'DELETE',
      path: `/v1/api-keys/${encodeURIComponent(id)}`,
    });
  }

  /**
   * Rotate an API key, returning the new plaintext key once.
   * Requires user JWT auth. The plaintext key is never logged.
   */
  rotate(id: string): Promise<ApiKey> {
    return this.client.request<ApiKey>({
      method: 'POST',
      path: `/v1/api-keys/${encodeURIComponent(id)}/rotate`,
    });
  }

  /** Fetch usage statistics for an API key. Requires user JWT auth. */
  usage(id: string, params?: ApiKeyUsageParams): Promise<ApiKeyUsage> {
    return this.client.request<ApiKeyUsage>({
      method: 'GET',
      path: `/v1/api-keys/${encodeURIComponent(id)}/usage`,
      query: params,
    });
  }
}
