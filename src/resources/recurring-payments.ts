import type { HttpClient } from '../client';
import { FacilPayError } from '../errors';

export type RecurringInterval = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type RecurringPaymentStatus =
  | 'active'
  | 'paused'
  | 'cancelled'
  | 'completed';

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

function mapStateTransitionError(
  action: 'pause' | 'resume' | 'cancel',
  error: unknown,
): never {
  const status = (error as { status?: number })?.status;
  const message = (error as { message?: string })?.message ?? '';
  if (status === 409 || /state|transition|status/i.test(message)) {
    const key = `${action}:${(error as { currentStatus?: string })?.currentStatus ?? ''}`;
    const mapped = STATE_TRANSITION_MESSAGES[key];
    throw new FacilPayError(
      mapped ?? message ?? `Cannot ${action} recurring payment in its current state.`,
      { code: 'recurring_payment_invalid_state', cause: error },
    );
  }
  throw error;
}

export class RecurringPaymentsResource {
  constructor(private readonly client: HttpClient) {}

  create(params: CreateRecurringPaymentDto): Promise<RecurringPayment> {
    return this.client.post<RecurringPayment>('/v1/recurring-payments', params);
  }

  list(params?: ListRecurringPaymentsParams): Promise<ListRecurringPaymentsResponse> {
    return this.client.get<ListRecurringPaymentsResponse>('/v1/recurring-payments', {
      params,
    });
  }

  retrieve(id: string): Promise<RecurringPayment> {
    return this.client.get<RecurringPayment>(`/v1/recurring-payments/${id}`);
  }

  update(id: string, params: UpdateRecurringPaymentDto): Promise<RecurringPayment> {
    return this.client.patch<RecurringPayment>(`/v1/recurring-payments/${id}`, params);
  }

  pause(id: string): Promise<RecurringPayment> {
    return this.transition(id, 'pause');
  }

  resume(id: string): Promise<RecurringPayment> {
    return this.transition(id, 'resume');
  }

  cancel(id: string): Promise<RecurringPayment> {
    return this.transition(id, 'cancel');
  }

  private async transition(
    id: string,
    action: 'pause' | 'resume' | 'cancel',
  ): Promise<RecurringPayment> {
    try {
      return await this.client.post<RecurringPayment>(
        `/v1/recurring-payments/${id}/${action}`,
      );
    } catch (error) {
      return mapStateTransitionError(action, error);
    }
  }
}
