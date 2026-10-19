import type { HttpClient } from "../core/http";
import { paginate, type PagePromise } from "../core/pagination";

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

  create(params: CreatePaymentLinkParams): Promise<PaymentLink> {
    return this.http.post<PaymentLink>("/v1/payment-links", {
      ...params,
      expiresAt: serializeExpiresAt(params.expiresAt),
    });
  }

  /**
   * List payment links. Returns a page that is also an `AsyncIterable`:
   * `await` it for the first page, or use `for await` to iterate every
   * payment link across all pages.
   */
  list(params: ListPaymentLinksParams = {}): PagePromise<PaymentLink> {
    return this.http.getPage<PaymentLink>("/v1/payment-links", params);
  }

  retrieve(token: string): Promise<PaymentLink> {
    return this.http.get<PaymentLink>(`/v1/payment-links/${token}`);
  }

  update(id: string, params: UpdatePaymentLinkParams): Promise<PaymentLink> {
    return this.http.patch<PaymentLink>(`/v1/payment-links/${id}`, {
      ...params,
      expiresAt: serializeExpiresAt(params.expiresAt),
    });
  }

  deactivate(id: string): Promise<PaymentLink> {
    return this.http.delete<PaymentLink>(`/v1/payment-links/${id}`);
  }

  redeem(token: string, params: RedeemPaymentLinkParams = {}): Promise<PaymentLink> {
    return this.http.post<PaymentLink>(`/v1/payment-links/${token}/redeem`, params);
  }

  getQrCode(token: string): Promise<QrCodeResponse> {
    return this.http.get<QrCodeResponse>(`/v1/payment-links/${token}/qr`);
  }

  checkoutUrl(token: string): string {
    return `${this.checkoutBaseUrl.replace(/\/$/, "")}/pay/${token}`;
  }
}
