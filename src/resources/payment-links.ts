import type { HttpClient } from '../core/http';
import type { ResourceRequestOptions } from './request-options';

export type PaymentLinkSortBy =
  | "createdAt"
  | "amount"
  | "views"
  | "completions"
  | "updatedAt";

export type SortOrder = "asc" | "desc";

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
    private readonly checkoutBaseUrl: string,
  ) {}

  create(params: CreatePaymentLinkParams, options?: ResourceRequestOptions): Promise<PaymentLink> {
    return this.http.request<PaymentLink>({
      method: 'POST',
      path: '/v1/payment-links',
      body: {
        ...params,
        expiresAt: serializeExpiresAt(params.expiresAt),
      },
      ...options,
    });
  }

  list(
    params: ListPaymentLinksParams = {},
    options?: ResourceRequestOptions,
  ): Promise<ListPaymentLinksResponse> {
    return this.http.request<ListPaymentLinksResponse>({
      method: 'GET',
      path: '/v1/payment-links',
      query: params,
      ...options,
    });
  }

  retrieve(token: string, options?: ResourceRequestOptions): Promise<PaymentLink> {
    return this.http.request<PaymentLink>({
      method: 'GET',
      path: `/v1/payment-links/${token}`,
      ...options,
    });
  }

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

  deactivate(id: string, options?: ResourceRequestOptions): Promise<PaymentLink> {
    return this.http.request<PaymentLink>({
      method: 'DELETE',
      path: `/v1/payment-links/${id}`,
      ...options,
    });
  }

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

  getQrCode(token: string, options?: ResourceRequestOptions): Promise<QrCodeResponse> {
    return this.http.request<QrCodeResponse>({
      method: 'GET',
      path: `/v1/payment-links/${token}/qr`,
      ...options,
    });
  }

  checkoutUrl(token: string): string {
    return `${this.checkoutBaseUrl.replace(/\/$/, "")}/pay/${token}`;
  }
}
