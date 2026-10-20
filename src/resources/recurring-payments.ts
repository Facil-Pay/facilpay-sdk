import type { HttpClient } from '../core/http';
import { paginate, type PagePromise } from '../core/pagination';
import { FacilPayError } from '../errors';
import type { ResourceRequestOptions } from './request-options';

export type RecurringInterval = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type RecurringPaymentStatus = 'active' | 'paused' | 'cancelled' | 'completed';

export interface CreateRecurringPaymentDto {
  customerId: string;
  amount: number;
  currency: string;
  interval: RecurringInterval;
  intervalCount?: number;
  description?: string;
  metadata?: Record<string, string>;
  startDate?: string;
  trialDays?: number;
}

export interface UpdateRecurringPaymentDto {
  amount?: number;
  description?: string;
  metadata?: Record<string, string>;
}

export interface ListRecurringPaymentsParams {
  customerId?: string;
  status?: RecurringPaymentStatus;
  limit?: number;
  offset?: number;
}

export interface RecurringPayment {
  id: string;
  customerId: string;
  amount: number;
  currency: string;
  interval: RecurringInterval;
  intervalCount: number;
  status: RecurringPaymentStatus;
  description?: string;
  metadata?: Record<string, string>;
  startDate?: string;
  trialDays?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListRecurringPaymentsResponse {
  data: RecurringPayment[];
  total: number;
  limit: number;
  offset: number;
}

const STATE_TRANSITION_MESSAGES: Record<string, string> = {
  'resume:cancelled': 'Cannot resume a cancelled recurring payment.',
  'resume:completed': 'Cannot resume a completed recurring payment.',
  'pause:cancelled': 'Cannot pause a cancelled recurring payment.',
  'pause:completed': 'Cannot pause a completed recurring payment.',
  'cancel:cancelled': 'Recurring payment is already cancelled.',
};

function mapStateTransitionError(action: 'pause' | 'resume' | 'cancel', error: unknown): never {
  const status = (error as { status?: number })?.status;
  const message = (error as { message?: string })?.message ?? '';
  if (status === 409 || /state|transition|status/i.test(message)) {
    const key = `${action}:${(error as { currentStatus?: string })?.currentStatus ?? ''}`;
    const mapped = STATE_TRANSITION_MESSAGES[key];
    throw new FacilPayError(
      mapped ?? message ?? `Cannot ${action} recurring payment in its current state.`,
      { code: 'recurring_payment_invalid_state' },
    );
  }
  throw error;
}

export class RecurringPaymentsResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Create a recurring payment (subscription) for a customer.
   *
   * `POST /v1/recurring-payments`
   *
   * @param params - Customer, amount, currency, interval and optional trial/start date.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The created recurring payment.
   * @throws {FacilPayAPIError} When the API rejects the request (e.g. `422` invalid interval).
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const subscription = await facilpay.recurringPayments.create({
   *   customerId: 'cus_123',
   *   amount: 9.99,
   *   currency: 'USD',
   *   interval: 'monthly',
   * });
   * ```
   */
  create(params: CreateRecurringPaymentDto, options?: ResourceRequestOptions): Promise<RecurringPayment> {
    return this.client.request<RecurringPayment>({
      method: 'POST',
      path: '/v1/recurring-payments',
      body: params,
      ...options,
    });
  }

  /**
   * List recurring payments. Returns a page that is also an `AsyncIterable`:
   * `await` it for the first page, or use `for await` to iterate every
   * recurring payment across all pages.
   *
   * `GET /v1/recurring-payments`
   *
   * @param params - Optional `customerId`/`status` filters and page size (`limit`).
   * @returns A page of recurring payments that can be iterated across all pages.
   * @throws {FacilPayAPIError} When the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * for await (const subscription of facilpay.recurringPayments.list({ status: 'active' })) {
   *   console.log(subscription.id);
   * }
   * ```
   */
  list(params?: ListRecurringPaymentsParams): PagePromise<RecurringPayment> {
    const limit = params?.limit ?? 20;
    // The API is offset-based; translate the 1-based page into an offset and
    // adapt the envelope to the page shape consumed by `paginate`.
    return paginate<RecurringPayment>(async (page) => {
      const response = await this.client.get<ListRecurringPaymentsResponse>(
        '/v1/recurring-payments',
        { params: { ...params, limit, offset: (page - 1) * limit } },
      );
      return { data: response.data, total: response.total, page, limit };
    });
  }

  /**
   * Retrieve a recurring payment by id.
   *
   * `GET /v1/recurring-payments/:id`
   *
   * @param id - Recurring payment id.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The recurring payment.
   * @throws {FacilPayAPIError} When the recurring payment does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * const subscription = await facilpay.recurringPayments.retrieve('rp_123');
   * ```
   */
  retrieve(id: string, options?: ResourceRequestOptions): Promise<RecurringPayment> {
    return this.client.request<RecurringPayment>({
      method: 'GET',
      path: `/v1/recurring-payments/${id}`,
      ...options,
    });
  }

  /**
   * Update the amount, description or metadata of a recurring payment.
   *
   * `PATCH /v1/recurring-payments/:id`
   *
   * @param id - Recurring payment id.
   * @param params - Fields to change.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The updated recurring payment.
   * @throws {FacilPayAPIError} When the recurring payment does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * await facilpay.recurringPayments.update('rp_123', { amount: 12.99 });
   * ```
   */
  update(
    id: string,
    params: UpdateRecurringPaymentDto,
    options?: ResourceRequestOptions,
  ): Promise<RecurringPayment> {
    return this.client.request<RecurringPayment>({
      method: 'PATCH',
      path: `/v1/recurring-payments/${id}`,
      body: params,
      ...options,
    });
  }

  /**
   * Pause an active recurring payment. No charges are made while paused.
   *
   * `POST /v1/recurring-payments/:id/pause`
   *
   * @param id - Recurring payment id.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The paused recurring payment.
   * @throws {FacilPayError} With code `recurring_payment_invalid_state` when the current status does not allow this transition.
   * @throws {FacilPayAPIError} When the recurring payment does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * await facilpay.recurringPayments.pause('rp_123');
   * ```
   */
  pause(id: string, options?: ResourceRequestOptions): Promise<RecurringPayment> {
    return this.transition(id, 'pause', options);
  }

  /**
   * Resume a paused recurring payment.
   *
   * `POST /v1/recurring-payments/:id/resume`
   *
   * @param id - Recurring payment id.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The resumed recurring payment.
   * @throws {FacilPayError} With code `recurring_payment_invalid_state` when the current status does not allow this transition.
   * @throws {FacilPayAPIError} When the recurring payment does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * await facilpay.recurringPayments.resume('rp_123');
   * ```
   */
  resume(id: string, options?: ResourceRequestOptions): Promise<RecurringPayment> {
    return this.transition(id, 'resume', options);
  }

  /**
   * Cancel a recurring payment. Cancelled recurring payments cannot be resumed.
   *
   * `POST /v1/recurring-payments/:id/cancel`
   *
   * @param id - Recurring payment id.
   * @param options - Per-request options (headers, idempotency key, signal, timeout, ...).
   * @returns The cancelled recurring payment.
   * @throws {FacilPayError} With code `recurring_payment_invalid_state` when the current status does not allow this transition.
   * @throws {FacilPayAPIError} When the recurring payment does not exist (`404`) or the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached or the request times out.
   *
   * @example
   * ```ts
   * await facilpay.recurringPayments.cancel('rp_123');
   * ```
   */
  cancel(id: string, options?: ResourceRequestOptions): Promise<RecurringPayment> {
    return this.transition(id, 'cancel', options);
  }

  private async transition(
    id: string,
    action: 'pause' | 'resume' | 'cancel',
    options?: ResourceRequestOptions,
  ): Promise<RecurringPayment> {
    try {
      return await this.client.post<RecurringPayment>(`/v1/recurring-payments/${id}/${action}`);
    } catch (error) {
      return mapStateTransitionError(action, error);
    }
  }
}
