import type { HttpClient } from '../http/client';

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
   */
  create(params: CreateWebhookParams): Promise<WebhookEndpoint> {
    return this.http.post<WebhookEndpoint>('/v1/webhooks', params);
  }

  /** List all registered webhook endpoints. */
  list(): Promise<WebhookEndpoint[]> {
    return this.http.get<WebhookEndpoint[]>('/v1/webhooks');
  }

  /** Update a webhook endpoint's URL, subscribed events, or active state. */
  update(id: string, params: UpdateWebhookParams): Promise<WebhookEndpoint> {
    return this.http.patch<WebhookEndpoint>(`/v1/webhooks/${id}`, params);
  }

  /** Delete a webhook endpoint. */
  delete(id: string): Promise<void> {
    return this.http.delete<void>(`/v1/webhooks/${id}`);
  }

  /** Send a test delivery to a webhook endpoint. */
  sendTest(id: string): Promise<WebhookTestResult> {
    return this.http.post<WebhookTestResult>(`/v1/webhooks/${id}/test`, {});
  }

  /**
   * Rotate a webhook endpoint's signing secret.
   *
   * The new `secret` (`whsec_…`) is only returned in full here. Store it
   * immediately — it cannot be retrieved again afterwards.
   */
  rotateSecret(id: string): Promise<WebhookEndpoint> {
    return this.http.post<WebhookEndpoint>(`/v1/webhooks/${id}/rotate-secret`, {});
  }

  /** Retry a previously failed webhook delivery. */
  retryDelivery(deliveryId: string): Promise<WebhookDeliveryRetryResult> {
    return this.http.post<WebhookDeliveryRetryResult>(
      `/v1/webhooks/deliveries/${deliveryId}/retry`,
      {},
    );
  }
}
