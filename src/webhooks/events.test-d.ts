import { expectTypeOf } from 'expect-type';
import type { FacilPayEvent, WebhookEventType } from './events';
import { isEventType } from './events';

declare const event: FacilPayEvent;

// Narrowing via switch works without casts.
switch (event.type) {
  case 'refund.issued':
    expectTypeOf(event.data.paymentId).toEqualTypeOf<string>();
    break;
  case 'payment.created':
    expectTypeOf(event.data.id).toEqualTypeOf<string>();
    break;
  case 'dispute.opened':
    expectTypeOf(event.data.id).toEqualTypeOf<string>();
    break;
  case 'transaction.multisig_required':
    expectTypeOf(event.data.id).toEqualTypeOf<string>();
    break;
  case 'test':
    expectTypeOf(event.data.message).toEqualTypeOf<string>();
    break;
}

// Type guard narrows the union.
if (isEventType(event, 'refund.issued')) {
  expectTypeOf(event.data.paymentId).toEqualTypeOf<string>();
}

// WebhookEventType is the union of all supported literals.
expectTypeOf<WebhookEventType>().toEqualTypeOf<
  | 'payment.created'
  | 'payment.completed'
  | 'payment.failed'
  | 'payment.expired'
  | 'payment.split_processed'
  | 'refund.issued'
  | 'dispute.opened'
  | 'transaction.multisig_required'
  | 'transaction.multisig_completed'
  | 'test'
>();
