import type { FacilPayClient } from '../client';
import type { Paginated, PaginationParams } from '../types';

/**
 * Status of a dispute as returned by the FacilPay API.
 */
export type DisputeStatus =
  | 'OPENED'
  | 'UNDER_REVIEW'
  | 'EVIDENCE_REQUIRED'
  | 'WON'
  | 'LOST'
  | 'CLOSED';

/**
 * A dispute opened on a payment.
 */
export interface Dispute {
  id: string;
  paymentId: string;
  status: DisputeStatus;
  reason?: string;
  amount?: number;
  currency?: string;
  evidence?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * Parameters accepted when opening a dispute on a payment.
 */
export interface CreateDisputeDto {
  reason: string;
  amount?: number;
  currency?: string;
  evidence?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Parameters accepted when updating a dispute (evidence or status changes).
 */
export interface UpdateDisputeDto {
  status?: DisputeStatus;
  evidence?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Parameters accepted when listing disputes.
 */
export interface ListDisputesParams extends PaginationParams {
  paymentId?: string;
  status?: DisputeStatus;
}

/**
 * Disputes resource.
 *
 * Customers or merchants can open a dispute on a payment, which emits
 * `dispute.opened`. Disputes can then be listed, retrieved and updated with
 * evidence or status changes.
 */
export class DisputesResource {
  constructor(private readonly client: FacilPayClient) {}

  /**
   * Open a dispute on a payment.
   *
   * `POST /v1/payments/:id/dispute`
   */
  create(paymentId: string, params: CreateDisputeDto): Promise<Dispute> {
    return this.client.request<Dispute>({
      method: 'POST',
      path: `/v1/payments/${encodeURIComponent(paymentId)}/dispute`,
      body: params,
    });
  }

  /**
   * List disputes.
   *
   * `GET /v1/disputes`
   */
  list(params?: ListDisputesParams): Promise<Paginated<Dispute>> {
    return this.client.request<Paginated<Dispute>>({
      method: 'GET',
      path: '/v1/disputes',
      query: params,
    });
  }

  /**
   * Retrieve a dispute by id.
   *
   * `GET /v1/disputes/:id`
   */
  retrieve(id: string): Promise<Dispute> {
    return this.client.request<Dispute>({
      method: 'GET',
      path: `/v1/disputes/${encodeURIComponent(id)}`,
    });
  }

  /**
   * Update a dispute with evidence or a status change.
   *
   * `PATCH /v1/disputes/:id`
   */
  update(id: string, params: UpdateDisputeDto): Promise<Dispute> {
    return this.client.request<Dispute>({
      method: 'PATCH',
      path: `/v1/disputes/${encodeURIComponent(id)}`,
      body: params,
    });
  }
}
