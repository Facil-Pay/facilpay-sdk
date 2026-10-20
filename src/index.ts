import { FacilPay } from './client';
import {
  FacilPayAPIError,
  FacilPayConnectionError,
  FacilPayError,
  FacilPaySignatureVerificationError,
  FacilPayValidationError,
} from './core/errors';
import { VERSION } from './core/version';

export {
  FacilPay,
  FacilPayAPIError,
  FacilPayConnectionError,
  FacilPayError,
  FacilPaySignatureVerificationError,
  FacilPayValidationError,
  VERSION,
};
export type { FacilPayOptions, Environment } from './client';
export type { Logger } from './core/http';

// Every resource module, including its parameter and response types, so
// consumers can type their own wrappers without deep imports.
export * from './resources';

// Auto-pagination primitives backing the async-iterable list methods.
export { paginate } from './core/pagination';
export type {
  Page,
  PageEnvelope,
  PageFetcher,
  PagePromise,
  ToArrayOptions,
} from './core/pagination';

// Webhook verification helpers and signed event types.
export { Webhooks, constructEvent, generateTestHeader, verifySignature } from './webhooks/verify';
export type { ConstructEventOptions, WebhookPayload } from './webhooks/verify';
export { isEventType } from './webhooks/events';
export type {
  DisputeOpenedEvent,
  FacilPayEvent,
  PaymentCompletedEvent,
  PaymentCreatedEvent,
  PaymentExpiredEvent,
  PaymentFailedEvent,
  PaymentSplitProcessedEvent,
  RefundIssuedEvent,
  TestEvent,
  TestEventData,
  TransactionMultisigCompletedEvent,
  TransactionMultisigRequiredEvent,
  WebhookEnvelope,
  WebhookEventType,
} from './webhooks/events';

// Soroban contract bindings live behind the separate `@facilpay/sdk/contracts`
// entry point so REST-only consumers never pull in `@stellar/stellar-sdk`.
// The contracts entry point is resolved via the package `exports` map and is
// intentionally NOT re-exported here.

export default FacilPay;
