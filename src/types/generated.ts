/**
 * Generated API schema map (checked-in stub).
 *
 * The full map is regenerated from the facilpay-api OpenAPI document via
 * `npm run generate:types` into `./generated.ts`. This stub keeps module
 * resolution and offline builds working; regeneration overwrites it with the
 * complete schema-derived definitions.
 */

interface PaymentSchema {
  id: string;
  [key: string]: any;
}

interface RefundSchema {
  id: string;
  paymentId: string;
  [key: string]: any;
}

interface DisputeSchema {
  id: string;
  paymentId: string;
  [key: string]: any;
}

interface PaginatedResponseSchema {
  total: number;
  page: number;
  limit: number;
  [key: string]: any;
}

export interface components {
  schemas: {
    Payment: PaymentSchema;
    CreatePaymentDto: Record<string, any>;
    UpdatePaymentDto: Record<string, any>;
    PaymentLink: PaymentSchema;
    CreatePaymentLinkDto: Record<string, any>;
    Refund: RefundSchema;
    CreateRefundDto: Record<string, any>;
    Dispute: DisputeSchema;
    WebhookEndpoint: { id: string; [key: string]: any };
    CreateWebhookEndpointDto: Record<string, any>;
    Settlement: { id: string; [key: string]: any };
    Customer: { id: string; [key: string]: any };
    CreateCustomerDto: Record<string, any>;
    PaginatedResponse: PaginatedResponseSchema;
    ApiError: { message: string; [key: string]: any };
  };
}
