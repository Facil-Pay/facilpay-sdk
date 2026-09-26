import { FacilPayValidationError } from '../core/errors';
import { resolveIdempotencyKey } from '../core/idempotency';
import type { HttpClient, RequestOptions } from '../core/http';
import type {
  BulkPaymentRequest,
  BulkPaymentResponse,
  CreatePaymentRequest,
  Payment,
} from '../types';

export interface PaymentRequestOptions extends RequestOptions {
  /**
   * Optional idempotency key. When omitted a key is generated automatically
   * and reused across automatic retries of the same call.
   */
  idempotencyKey?: string;
}

export class PaymentsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a payment.
   *
   * An `Idempotency-Key` header is always sent: the caller may supply one via
   * `options.idempotencyKey`, otherwise a key is generated automatically. The
   * same key is reused across automatic retries of this call.
   */
  async create(
    body: CreatePaymentRequest,
    options: PaymentRequestOptions = {},
  ): Promise<Payment> {
    const idempotencyKey = resolveIdempotencyKey(options.idempotencyKey);

    const payment = await this.http.post<Payment>('/v1/payments', body, {
      ...options,
      headers: {
        ...options.headers,
        'Idempotency-Key': idempotencyKey,
      },
    });

    return {
      ...payment,
      idempotencyKey: payment.idempotencyKey ?? idempotencyKey,
    };
  }

  /**
   * Bulk creation ignores the `Idempotency-Key` header, so no key is attached.
   */
  async bulkCreate(
    body: BulkPaymentRequest,
    options: RequestOptions = {},
  ): Promise<BulkPaymentResponse> {
    return this.http.post<BulkPaymentResponse>('/v1/payments/bulk', body, options);
  }

  async retrieve(id: string, options: RequestOptions = {}): Promise<Payment> {
    return this.http.get<Payment>(`/v1/payments/${id}`, options);
  }

  async list(
    params: Record<string, unknown> = {},
    options: RequestOptions = {},
  ): Promise<Payment[]> {
    return this.http.get<Payment[]>('/v1/payments', { ...options, params });
  }
}

export function assertValidIdempotencyKey(key: string): void {
  resolveIdempotencyKey(key);
}

export { FacilPayValidationError };
