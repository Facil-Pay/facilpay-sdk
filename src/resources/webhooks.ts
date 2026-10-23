import type { HttpClient } from '../core/http';
import type { PageEnvelope } from '../core/pagination';
import type { ResourceRequestOptions } from './request-options';
import {
  constructEvent,
  type ConstructEventOptions,
  type WebhookPayload,
} from '../webhooks/verify';
import type { FacilPayEvent } from '../webhooks/events';

/**
 * Supported webhook event names.
 *
 * Typing `events` as this union ensures typos fail at compile time.
 */
export type WebhookEvent =
  | 'payment.created'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'payment.refunded'
  | 'payment_link.created'
  | 'payment_link.paid'
  | 'dispute.created'
  | 'dispute.updated'
  | 'dispute.closed'
  | 'recurring_payment.created'
  | 'recurring_payment.charged'
  | 'recurring_payment.failed'
  | 'recurring_payment.cancelled';

/** A registered webhook endpoint. */
export interface WebhookEndpoint {
  id: string;
  url: string;
  events: WebhookEvent[];
  isActive: boolean;
  /**
   * Signing secret (`whsec_…`).
   *
   * Only returned in full on creation and after rotation. Store it immediately —
   * it cannot be retrieved again afterwards.
   */
  secret?: string;
  createdAt: string;
  updatedAt: string;
}

/** Parameters for registering a new webhook endpoint. */
export interface CreateWebhookParams {
  url: string;
  events: WebhookEvent[];
}

/** Parameters for updating an existing webhook endpoint. */
export interface UpdateWebhookParams {
  url?: string;
  events?: WebhookEvent[];
  isActive?: boolean;
}

/** Result of a test delivery to a webhook endpoint. */
export interface WebhookTestResult {
  delivered: boolean;
  statusCode?: number;
  error?: string;
}

/** Result of retrying a webhook delivery. */
export interface WebhookDeliveryRetryResult {
  deliveryId: string;
  status: string;
}

/** A single webhook delivery attempt. */
export interface WebhookDelivery {
  id: string;
  webhookId: string;
  event: WebhookEvent;
  status: string;
  statusCode?: number;
  attempts?: number;
  createdAt: string;
  updatedAt: string;
}

/** Filters accepted by {@link WebhooksResource.listDeliveries}. */
export interface ListWebhookDeliveriesParams {
  page?: number;
  limit?: number;
  status?: string;
  event?: WebhookEvent;
}

/**
 * Webhook endpoints resource.
 *
 * Merchants register HTTPS endpoints that receive signed event deliveries.
 */
export class WebhooksResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Register a new webhook endpoint.
   *
   * The returned `secret` (`whsec_…`) is only returned in full here and after
   * rotation. Store it immediately — it cannot be retrieved again afterwards.
   *
   * `POST /v1/webhooks`
   *
   * @param params - HTTPS URL and subscribed events.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The registered endpoint, including its signing `secret`.
   * @throws {FacilPayAPIError} When the API rejects the request (e.g. `422` invalid URL).
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const endpoint = await facilpay.webhooks.create({
   *   url: 'https://example.com/webhooks/facilpay',
   *   events: ['payment.succeeded'],
   * });
   * ```
   */
  create(params: CreateWebhookParams, options?: ResourceRequestOptions): Promise<WebhookEndpoint> {
    return this.http.request<WebhookEndpoint>({
      method: 'POST',
      path: '/v1/webhooks',
      body: params,
      ...options,
    });
  }

  /**
   * List all registered webhook endpoints.
   *
   * `GET /v1/webhooks`
   *
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The registered endpoints.
   * @throws {FacilPayAPIError} When the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const endpoints = await facilpay.webhooks.list();
   * ```
   */
  list(options?: ResourceRequestOptions): Promise<WebhookEndpoint[]> {
    return this.http.request<WebhookEndpoint[]>({
      method: 'GET',
      path: '/v1/webhooks',
      ...options,
    });
  }

  /**
   * Fetch a single webhook endpoint by id.
   *
   * `GET /v1/webhooks/:id`
   *
   * @param id - Webhook endpoint id.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The webhook endpoint.
   * @throws {FacilPayAPIError} When the webhook endpoint does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const endpoint = await facilpay.webhooks.retrieve('wh_123');
   * ```
   */
  retrieve(id: string, options?: ResourceRequestOptions): Promise<WebhookEndpoint> {
    return this.http.request<WebhookEndpoint>({
      method: 'GET',
      path: `/v1/webhooks/${id}`,
      ...options,
    });
  }

  /**
   * List the delivery attempts of a webhook endpoint (paginated).
   *
   * Use this to find a `deliveryId` for {@link retryDelivery}.
   *
   * `GET /v1/webhooks/:id/deliveries`
   *
   * @param id - Webhook endpoint id.
   * @param params - Optional paging, status and event filters.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns A page of delivery attempts.
   * @throws {FacilPayAPIError} When the webhook endpoint does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const { data } = await facilpay.webhooks.listDeliveries('wh_123', { status: 'failed' });
   * ```
   */
  listDeliveries(
    id: string,
    params?: ListWebhookDeliveriesParams,
    options?: ResourceRequestOptions,
  ): Promise<PageEnvelope<WebhookDelivery>> {
    return this.http.request<PageEnvelope<WebhookDelivery>>({
      method: 'GET',
      path: `/v1/webhooks/${id}/deliveries`,
      query: params,
      ...options,
    });
  }

  /**
   * Update a webhook endpoint's URL, subscribed events, or active state.
   *
   * `PATCH /v1/webhooks/:id`
   *
   * @param id - Webhook endpoint id.
   * @param params - Fields to change.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The updated webhook endpoint.
   * @throws {FacilPayAPIError} When the webhook endpoint does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * await facilpay.webhooks.update('wh_123', { isActive: false });
   * ```
   */
  update(
    id: string,
    params: UpdateWebhookParams,
    options?: ResourceRequestOptions,
  ): Promise<WebhookEndpoint> {
    return this.http.request<WebhookEndpoint>({
      method: 'PATCH',
      path: `/v1/webhooks/${id}`,
      body: params,
      ...options,
    });
  }

  /**
   * Delete a webhook endpoint.
   *
   * `DELETE /v1/webhooks/:id`
   *
   * @param id - Webhook endpoint id.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns Resolves once the endpoint is deleted.
   * @throws {FacilPayAPIError} When the webhook endpoint does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * await facilpay.webhooks.delete('wh_123');
   * ```
   */
  delete(id: string, options?: ResourceRequestOptions): Promise<void> {
    return this.http.request<void>({
      method: 'DELETE',
      path: `/v1/webhooks/${id}`,
      ...options,
    });
  }

  /**
   * Send a test delivery to a webhook endpoint.
   *
   * `POST /v1/webhooks/:id/test`
   *
   * @param id - Webhook endpoint id.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns Whether the test event was delivered and the status code received.
   * @throws {FacilPayAPIError} When the webhook endpoint does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const { delivered } = await facilpay.webhooks.sendTest('wh_123');
   * ```
   */
  sendTest(id: string, options?: ResourceRequestOptions): Promise<WebhookTestResult> {
    return this.http.request<WebhookTestResult>({
      method: 'POST',
      path: `/v1/webhooks/${id}/test`,
      body: {},
      ...options,
    });
  }

  /**
   * Rotate a webhook endpoint's signing secret.
   *
   * The new `secret` (`whsec_…`) is only returned in full here. Store it
   * immediately — it cannot be retrieved again afterwards.
   *
   * `POST /v1/webhooks/:id/rotate-secret`
   *
   * @param id - Webhook endpoint id.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The endpoint with its new signing `secret`.
   * @throws {FacilPayAPIError} When the webhook endpoint does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const { secret } = await facilpay.webhooks.rotateSecret('wh_123');
   * ```
   */
  rotateSecret(id: string, options?: ResourceRequestOptions): Promise<WebhookEndpoint> {
    return this.http.request<WebhookEndpoint>({
      method: 'POST',
      path: `/v1/webhooks/${id}/rotate-secret`,
      body: {},
      ...options,
    });
  }

  /**
   * Retry a previously failed webhook delivery.
   *
   * `POST /v1/webhooks/deliveries/:deliveryId/retry`
   *
   * @param deliveryId - Delivery id, e.g. from {@link listDeliveries}.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The delivery id and its new status.
   * @throws {FacilPayAPIError} When the delivery does not exist (`404`) or the API rejects the retry.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * await facilpay.webhooks.retryDelivery('whd_123');
   * ```
   */
  retryDelivery(
    deliveryId: string,
    options?: ResourceRequestOptions,
  ): Promise<WebhookDeliveryRetryResult> {
    return this.http.request<WebhookDeliveryRetryResult>({
      method: 'POST',
      path: `/v1/webhooks/deliveries/${deliveryId}/retry`,
      body: {},
      ...options,
    });
  }

  /**
   * Verify a delivery signature and return the parsed event.
   *
   * Delegates to {@link constructEvent} from the webhooks module. Makes no request.
   *
   * @param payload - Raw request body, exactly as received.
   * @param signature - Value of the `X-FacilPay-Signature` header.
   * @param secret - Endpoint signing secret(s) (`whsec_…`); pass several during rotation.
   * @param options - Optional verification settings such as timestamp tolerance.
   * @returns The verified, parsed event.
   * @throws {FacilPaySignatureVerificationError} When the signature is missing, malformed, stale or does not match.
   *
   * @example
   * ```ts
   * const event = await facilpay.webhooks.constructEvent(
   *   rawBody,
   *   req.headers['x-facilpay-signature'],
   *   process.env.FACILPAY_WEBHOOK_SECRET!,
   * );
   * ```
   */
  constructEvent<T = FacilPayEvent>(
    payload: WebhookPayload,
    signature: string,
    secret: string | string[],
    options?: ConstructEventOptions,
  ): Promise<T> {
    return constructEvent<T>(payload, signature, secret, options);
  }
}
