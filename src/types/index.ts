/**
 * Shared API types for the FacilPay SDK.
 *
 * The low-level request/response shapes are generated from the facilpay-api
 * OpenAPI (Swagger) document into `./generated.ts` via `npm run generate:types`.
 * This module re-exports those generated types and exposes hand-written,
 * ergonomic aliases that the SDK's resource methods consume.
 *
 * Regeneration workflow is documented in CONTRIBUTING.md.
 */

import type { components } from './generated';

type Schemas = components['schemas'];

/**
 * Payment lifecycle status.
 *
 * Kept as an explicit string-literal union so the SDK and API cannot drift on
 * enum values. Must stay in sync with the `PaymentStatus` enum in facilpay-api.
 */
export type PaymentStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

/** A payment as returned by the API. */
export type Payment = Schemas['Payment'];

/** Payload accepted when creating a payment. */
export type CreatePayment = Schemas['CreatePaymentDto'];

/** Payload accepted when updating a payment. */
export type UpdatePayment = Schemas['UpdatePaymentDto'];

/** A shareable payment link. */
export type PaymentLink = Schemas['PaymentLink'];

/** Payload accepted when creating a payment link. */
export type CreatePaymentLink = Schemas['CreatePaymentLinkDto'];

/** A refund issued against a payment. */
export type Refund = Schemas['Refund'];

/** Payload accepted when creating a refund. */
export type CreateRefund = Schemas['CreateRefundDto'];

/** A dispute raised against a payment. */
export type Dispute = Schemas['Dispute'];

/** A registered webhook endpoint. */
export type WebhookEndpoint = Schemas['WebhookEndpoint'];

/** Payload accepted when creating a webhook endpoint. */
export type CreateWebhookEndpoint = Schemas['CreateWebhookEndpointDto'];

/** A settlement batch paid out to a merchant. */
export type Settlement = Schemas['Settlement'];

/** A customer record. */
export type Customer = Schemas['Customer'];

/** Payload accepted when creating a customer. */
export type CreateCustomer = Schemas['CreateCustomerDto'];

/** A paginated list response wrapper. */
export type Paginated<T> = Schemas['PaginatedResponse'] & { data: T[] };

/** Standard error envelope returned by the API. */
export type ApiError = Schemas['ApiError'];

/** Re-export the raw generated schema map for advanced consumers. */
export type { Schemas };
