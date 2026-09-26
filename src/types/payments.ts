/**
 * Payment-related types shared across the SDK.
 *
 * These mirror the DTOs exposed by the FacilPay API payments module.
 */

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  reference?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePaymentParams {
  amount: number;
  currency: string;
  reference?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface ListPaymentsParams {
  limit?: number;
  offset?: number;
  status?: string;
  from?: string;
  to?: string;
}

/**
 * Parameters accepted by `POST /v1/payments/:id/refund`.
 *
 * Omitting `amount` refunds the full remaining balance and moves the payment
 * to `REFUNDED`. Passing an `amount` issues a partial refund and moves the
 * payment to `PARTIALLY_REFUNDED`. When provided, `amount` must be greater
 * than `0`.
 */
export interface RefundPaymentParams {
  amount?: number;
  reason?: string;
}

/**
 * Alias for {@link RefundPaymentParams}, mirroring the API's
 * `RefundPaymentDto`.
 */
export type RefundPaymentDto = RefundPaymentParams;

/**
 * A refund issued against a payment.
 *
 * Returned by `payments.refund()`. A successful refund also emits the
 * `refund.issued` webhook.
 */
export interface Refund {
  id: string;
  paymentId: string;
  amount: number;
  currency: string;
  status: string;
  reason?: string;
  createdAt: string;
}

/**
 * A single item submitted to the bulk create endpoint.
 */
export interface BulkCreatePaymentItem extends CreatePaymentParams {}

/**
 * A successfully created payment within a bulk create response.
 */
export interface BulkCreatePaymentSuccess {
  index: number;
  payment: Payment;
}

/**
 * A failed item within a bulk create response.
 */
export interface BulkCreatePaymentFailure {
  index: number;
  error: string;
  code?: string;
}

/**
 * Per-item result returned by `POST /v1/payments/bulk`.
 *
 * Bulk creation does **not** support idempotency keys; partial failures are
 * surfaced here rather than thrown for the whole batch.
 */
export interface BulkCreatePaymentsResponseDto {
  successes: BulkCreatePaymentSuccess[];
  failures: BulkCreatePaymentFailure[];
}

/**
 * Parameters accepted by the CSV export endpoint.
 */
export interface ExportPaymentsParams extends ListPaymentsParams {}

/**
 * A single entry in a payment timeline.
 */
export interface PaymentTimelineEntry {
  id: string;
  type: string;
  status?: string;
  message?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Response returned by `GET /v1/payments/:id/timeline`.
 */
export interface PaymentTimelineDto {
  paymentId: string;
  entries: PaymentTimelineEntry[];
}

/**
 * Invoice associated with a payment.
 */
export interface PaymentInvoice {
  id: string;
  paymentId: string;
  number: string;
  url?: string;
  token?: string;
  issuedAt: string;
  dueAt?: string;
  total: number;
  currency: string;
}

/**
 * Supported QR code output formats.
 */
export type PaymentQrFormat = 'png' | 'svg' | 'data_url';

export interface GetPaymentQrCodeParams {
  format?: PaymentQrFormat;
}

/**
 * QR code result. When the API responds with an image content type the raw
 * bytes are returned, otherwise a data URL string is returned.
 */
export type PaymentQrCode = string | ArrayBuffer;
