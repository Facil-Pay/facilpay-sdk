/**
 * Payment-related types for the FacilPay SDK.
 *
 * These mirror the API's `CreatePaymentDto` and payment response shapes so the
 * `Payments` resource can be strongly typed end to end.
 */

/** A single split of a payment between recipients. */
export interface PaymentSplit {
  /** Recipient identifier (e.g. merchant or account id). */
  recipientId: string;
  /** Percentage of the payment routed to this recipient. All splits must sum to 100. */
  percentage: number;
}

/**
 * Parameters accepted by `facilpay.payments.create`.
 *
 * Mirrors the API `CreatePaymentDto`.
 */
export interface CreatePaymentDto {
  /** Amount to charge. Must be greater than or equal to 0.01. */
  amount: number;
  /** ISO 4217 currency code. Must be exactly 3 characters. */
  currency: string;
  /** Optional human-readable description. At most 500 characters. */
  description?: string;
  /** Optional URL the API calls once the payment settles. */
  callbackUrl?: string;
  /** Optional merchant identifier. */
  merchantId?: string;
  /** Optional merchant contact email. */
  merchantEmail?: string;
  /** Optional payer email. */
  payerEmail?: string;
  /**
   * Optional key/value metadata. At most 20 entries, each value a string of at
   * most 500 characters.
   */
  metadata?: Record<string, string>;
  /** Optional expiry, in seconds, after which the payment can no longer be paid. */
  expiresIn?: number;
  /** Optional payment link identifier this payment originates from. */
  paymentLinkId?: string;
  /** Optional splits. Percentages must sum to 100. */
  splits?: PaymentSplit[];
}

/** Lifecycle status of a payment. */
export type PaymentStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled"
  | "expired";

/** A payment as returned by the API. */
export interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  description?: string;
  callbackUrl?: string;
  merchantId?: string;
  merchantEmail?: string;
  payerEmail?: string;
  metadata?: Record<string, string>;
  expiresIn?: number;
  paymentLinkId?: string;
  splits?: PaymentSplit[];
  createdAt: string;
  updatedAt: string;
}

/** Filters accepted by `facilpay.payments.list`. */
export interface ListPaymentsParams {
  status?: PaymentStatus;
  /** ISO 8601 lower bound (inclusive) on the creation date. */
  from?: string;
  /** ISO 8601 upper bound (inclusive) on the creation date. */
  to?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}
