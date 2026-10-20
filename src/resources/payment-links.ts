import type { HttpClient } from '../client';

export type PaymentLinkSortBy = 'createdAt' | 'amount' | 'views' | 'completions' | 'updatedAt';

export type SortOrder = 'asc' | 'desc';

export interface PaymentLink {
  id: string;
  token: string;
  amount: number;
  currency: string;
  description?: string;
  expiresAt?: string;
  views: number;
  completions: number;
  active: boolean;
  /** Hosted checkout URL for this payment link. */
  url?: string;
  /** Current state of the payment link. */
  status?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentLinkParams {
  amount: number;
  currency: string;
  description?: string;
  expiresAt?: Date | string;
}

export interface ListPaymentLinksParams {
  page?: number;
  limit?: number;
  sortBy?: PaymentLinkSortBy;
  sortOrder?: SortOrder;
}

export interface UpdatePaymentLinkParams {
  amount?: number;
  currency?: string;
  description?: string;
  expiresAt?: Date | string;
}

export interface RedeemPaymentLinkParams {
  [key: string]: unknown;
}

export interface ListPaymentLinksResponse {
  data: PaymentLink[];
  page: number;
  limit: number;
  total: number;
}

export interface QrCodeResponse {
  token: string;
  url: string;
}

function serializeExpiresAt(value: Date | string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value instanceof Date ? value.toISOString() : value;
}

export class PaymentLinksResource {
  constructor(
    private readonly http: HttpClient,
    private readonly checkoutBaseUrl: string = "",
  ) {}

  /**
   * Create a shareable payment link. `expiresAt` accepts a `Date` or an ISO 8601 string.
   *
   * `POST /v1/payment-links`
   *
   * @param params - Amount, currency, optional description and expiry.
   * @returns The created payment link.
   * @throws {FacilPayAPIError} When the API rejects the request (e.g. `422` invalid amount or currency).
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const link = await facilpay.paymentLinks.create({
   *   amount: 25,
   *   currency: 'USD',
   *   expiresAt: new Date(Date.now() + 86_400_000),
   * });
   * ```
   */
  create(params: CreatePaymentLinkParams): Promise<PaymentLink> {
    return this.http.post<PaymentLink>('/v1/payment-links', {
      ...params,
      expiresAt: serializeExpiresAt(params.expiresAt),
    }, options);
  }

  /**
   * List payment links, with optional paging and sorting.
   *
   * `GET /v1/payment-links`
   *
   * @param params - Optional `page`, `limit`, `sortBy` and `sortOrder`.
   * @returns A page of payment links with paging totals.
   * @throws {FacilPayAPIError} When the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const { data, total } = await facilpay.paymentLinks.list({ sortBy: 'createdAt', sortOrder: 'desc' });
   * ```
   */
  list(params: ListPaymentLinksParams = {}): Promise<ListPaymentLinksResponse> {
    return this.http.get<ListPaymentLinksResponse>('/v1/payment-links', {
      query: params,
      ...options,
    });
  }

  /**
   * Retrieve a payment link by its token.
   *
   * `GET /v1/payment-links/:token`
   *
   * @param token - Payment link token.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The payment link.
   * @throws {FacilPayAPIError} When the payment link does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const link = await facilpay.paymentLinks.retrieve('plk_tok_123');
   * ```
   */
  retrieve(token: string, options?: ResourceRequestOptions): Promise<PaymentLink> {
    return this.http.request<PaymentLink>({
      method: 'GET',
      path: `/v1/payment-links/${token}`,
      ...options,
    });
  }

  /**
   * Update the amount, currency, description or expiry of a payment link.
   *
   * `PATCH /v1/payment-links/:id`
   *
   * @param id - Payment link id.
   * @param params - Fields to change.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The updated payment link.
   * @throws {FacilPayAPIError} When the payment link does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * await facilpay.paymentLinks.update('plk_123', { description: 'Spring sale' });
   * ```
   */
  update(
    id: string,
    params: UpdatePaymentLinkParams,
    options?: ResourceRequestOptions,
  ): Promise<PaymentLink> {
    return this.http.request<PaymentLink>({
      method: 'PATCH',
      path: `/v1/payment-links/${id}`,
      body: {
        ...params,
        expiresAt: serializeExpiresAt(params.expiresAt),
      },
      ...options,
    });
  }

  /**
   * Deactivate a payment link so it can no longer be paid.
   *
   * `DELETE /v1/payment-links/:id`
   *
   * @param id - Payment link id.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The deactivated payment link (`active: false`).
   * @throws {FacilPayAPIError} When the payment link does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * await facilpay.paymentLinks.deactivate('plk_123');
   * ```
   */
  deactivate(id: string, options?: ResourceRequestOptions): Promise<PaymentLink> {
    return this.http.request<PaymentLink>({
      method: 'DELETE',
      path: `/v1/payment-links/${id}`,
      ...options,
    });
  }

  /**
   * Redeem a payment link, starting a payment for it.
   *
   * `POST /v1/payment-links/:token/redeem`
   *
   * @param token - Payment link token.
   * @param params - Optional payer details forwarded to the API.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The redeemed payment link.
   * @throws {FacilPayAPIError} When the link does not exist (`404`), is inactive or expired.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * await facilpay.paymentLinks.redeem('plk_tok_123', { payerEmail: 'buyer@example.com' });
   * ```
   */
  redeem(
    token: string,
    params: RedeemPaymentLinkParams = {},
    options?: ResourceRequestOptions,
  ): Promise<PaymentLink> {
    return this.http.request<PaymentLink>({
      method: 'POST',
      path: `/v1/payment-links/${token}/redeem`,
      body: params,
      ...options,
    });
  }

  /**
   * Retrieve the QR code for a payment link.
   *
   * `GET /v1/payment-links/:token/qr`
   *
   * @param token - Payment link token.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The token and the URL encoded in the QR code.
   * @throws {FacilPayAPIError} When the payment link does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const { url } = await facilpay.paymentLinks.getQrCode('plk_tok_123');
   * ```
   */
  getQrCode(token: string, options?: ResourceRequestOptions): Promise<QrCodeResponse> {
    return this.http.request<QrCodeResponse>({
      method: 'GET',
      path: `/v1/payment-links/${token}/qr`,
      ...options,
    });
  }

  /**
   * Build the hosted checkout URL for a payment link. Makes no request.
   *
   * @param token - Payment link token.
   * @returns The hosted checkout URL (`<checkoutBaseUrl>/pay/<token>`).
   * @throws Never; this method only builds a string.
   *
   * @example
   * ```ts
   * const url = facilpay.paymentLinks.checkoutUrl('plk_tok_123');
   * ```
   */
  checkoutUrl(token: string): string {
    return `${this.checkoutBaseUrl.replace(/\/$/, '')}/pay/${token}`;
  }
}
