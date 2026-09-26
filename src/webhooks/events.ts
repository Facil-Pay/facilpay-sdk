import type { Payment } from '../resources/payments';
import type { Refund } from '../resources/refunds';
import type { Dispute } from '../resources/disputes';
import type { MultisigTransaction } from '../resources/transactions';

/**
 * The delivery envelope sent by facilpay-api for every webhook delivery.
 *
 * Field names verified against a real delivery captured from facilpay-api:
 * {
 *   "id": "evt_01H...",
 *   "type": "payment.completed",
 *   "timestamp": "2024-05-01T12:34:56.789Z",
 *   "data": { ... }
 * }
 */
export interface WebhookEnvelope<TType extends string, TData> {
  /** Unique id of the delivery, e.g. `evt_01H...`. */
  id: string;
  /** Event type discriminator. */
  type: TType;
  /** ISO-8601 timestamp of when the event occurred. */
  timestamp: string;
  /** Event-specific payload. */
  data: TData;
}

/** All supported webhook event type literals. */
export type WebhookEventType =
  | 'payment.created'
  | 'payment.completed'
  | 'payment.failed'
  | 'payment.expired'
  | 'payment.split_processed'
  | 'refund.issued'
  | 'dispute.opened'
  | 'transaction.multisig_required'
  | 'transaction.multisig_completed'
  | 'test';

/** Synthetic event used by facilpay-api to validate an endpoint. */
export interface TestEventData {
  message: string;
}

export type PaymentCreatedEvent = WebhookEnvelope<'payment.created', Payment>;
export type PaymentCompletedEvent = WebhookEnvelope<'payment.completed', Payment>;
export type PaymentFailedEvent = WebhookEnvelope<'payment.failed', Payment>;
export type PaymentExpiredEvent = WebhookEnvelope<'payment.expired', Payment>;
export type PaymentSplitProcessedEvent = WebhookEnvelope<'payment.split_processed', Payment>;
export type RefundIssuedEvent = WebhookEnvelope<'refund.issued', Refund>;
export type DisputeOpenedEvent = WebhookEnvelope<'dispute.opened', Dispute>;
export type TransactionMultisigRequiredEvent = WebhookEnvelope<
  'transaction.multisig_required',
  MultisigTransaction
>;
export type TransactionMultisigCompletedEvent = WebhookEnvelope<
  'transaction.multisig_completed',
  MultisigTransaction
>;
export type TestEvent = WebhookEnvelope<'test', TestEventData>;

/**
 * Discriminated union of every webhook event, keyed on `type`.
 *
 * `switch (event.type)` narrows `event.data` automatically.
 */
export type FacilPayEvent =
  | PaymentCreatedEvent
  | PaymentCompletedEvent
  | PaymentFailedEvent
  | PaymentExpiredEvent
  | PaymentSplitProcessedEvent
  | RefundIssuedEvent
  | DisputeOpenedEvent
  | TransactionMultisigRequiredEvent
  | TransactionMultisigCompletedEvent
  | TestEvent;

/**
 * Type guard narrowing a {@link FacilPayEvent} to a specific event type.
 *
 * ```ts
 * if (isEventType(event, 'refund.issued')) {
 *   event.data.paymentId; // narrowed
 * }
 * ```
 */
export function isEventType<TType extends WebhookEventType>(
  event: FacilPayEvent,
  type: TType,
): event is Extract<FacilPayEvent, { type: TType }> {
  return event.type === type;
}
