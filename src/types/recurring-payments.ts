export type RecurringInterval =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

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
  metadata?: Record<string, unknown>;
  startDate?: string;
  trialDays?: number;
}

export interface UpdateRecurringPaymentDto {
  amount?: number;
  currency?: string;
  interval?: RecurringInterval;
  intervalCount?: number;
  description?: string;
  metadata?: Record<string, unknown>;
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
  metadata?: Record<string, unknown>;
  startDate?: string;
  trialDays?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ListRecurringPaymentsParams {
  customerId?: string;
  status?: RecurringPaymentStatus;
  limit?: number;
  offset?: number;
}

export interface ListRecurringPaymentsResponse {
  data: RecurringPayment[];
  total: number;
  limit: number;
  offset: number;
}
