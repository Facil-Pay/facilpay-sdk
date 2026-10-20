import type { HttpClient } from '../core/http';
import { paginate, type PageEnvelope, type PagePromise } from '../core/pagination';
import type { PaginationParams } from '../types';

/**
 * Status of a dispute as returned by the FacilPay API.
 */
export type DisputeStatus =
  'OPENED' | 'UNDER_REVIEW' | 'EVIDENCE_REQUIRED' | 'WON' | 'LOST' | 'CLOSED';

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
  constructor(private readonly client: HttpClient) {}

  /**
   * Open a dispute on a payment.
   *
   * `POST /v1/payments/:id/dispute`
   */
  create(paymentId: string, params: CreateDisputeDto): Promise<Dispute> {
    return this.client.post<Dispute>(
      `/v1/payments/${encodeURIComponent(paymentId)}/dispute`,
      params,
    );
  }

  /**
   * List disputes.
   *
   * Returns a page that is also an `AsyncIterable`: `await` it for the first
   * page, or use `for await` to iterate every dispute across all pages.
   *
   * `GET /v1/disputes`
   */
  list(params?: ListDisputesParams): PagePromise<Dispute> {
    const limit = (params as { limit?: number } | undefined)?.limit ?? 20;
    return paginate<Dispute>((page) =>
      this.client.get<PageEnvelope<Dispute>>('/v1/disputes', {
        params: { ...params, page, limit },
      }),
    );
  }

  /**
   * Retrieve a dispute by id.
   *
   * `GET /v1/disputes/:id`
   */
  retrieve(id: string): Promise<Dispute> {
    return this.client.get<Dispute>(`/v1/disputes/${encodeURIComponent(id)}`);
  }

  /**
   * Update a dispute with evidence or a status change.
   *
   * `PATCH /v1/disputes/:id`
   */
  update(id: string, params: UpdateDisputeDto): Promise<Dispute> {
    return this.client.patch<Dispute>(`/v1/disputes/${encodeURIComponent(id)}`, params);
  }
}
