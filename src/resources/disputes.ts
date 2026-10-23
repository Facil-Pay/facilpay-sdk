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
 * Options accepted by {@link DisputesResource.uploadEvidence}.
 */
export interface UploadDisputeEvidenceOptions {
  /** File name sent with the upload. Defaults to the `File` name, or `evidence`. */
  filename?: string;
  /** Multipart field name for the file. Defaults to `file`. */
  field?: string;
  /** Extra text fields sent alongside the file (e.g. a description). */
  fields?: Record<string, string>;
}

/**
 * Disputes resource.
 *
 * Customers or merchants can open a dispute on a payment, which emits
 * `dispute.opened`. Disputes can then be listed, retrieved, updated with
 * evidence or status changes, and given uploaded evidence files.
 */
export class DisputesResource {
  constructor(private readonly client: HttpClient) {}

  /**
   * Open a dispute on a payment.
   *
   * `POST /v1/payments/:id/dispute`
   *
   * @param paymentId - Id of the payment being disputed.
   * @param params - Reason, optional amount/currency and initial evidence.
   * @returns The newly opened dispute.
   * @throws {FacilPayAPIError} When the API rejects the request (e.g. `404` unknown payment).
   * @throws {FacilPayConnectionError} When the API cannot be reached.
   *
   * @example
   * ```ts
   * const dispute = await facilpay.disputes.create('pay_123', { reason: 'fraudulent' });
   * ```
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
   *
   * @param params - Optional pagination and `paymentId`/`status` filters.
   * @returns A page of disputes that can be iterated across all pages.
   * @throws {FacilPayAPIError} When the API rejects the request.
   * @throws {FacilPayConnectionError} When the API cannot be reached.
   *
   * @example
   * ```ts
   * for await (const dispute of facilpay.disputes.list({ status: 'EVIDENCE_REQUIRED' })) {
   *   console.log(dispute.id);
   * }
   * ```
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
   *
   * @param id - Dispute id.
   * @returns The dispute.
   * @throws {FacilPayAPIError} When the dispute does not exist (`404`) or the request fails.
   * @throws {FacilPayConnectionError} When the API cannot be reached.
   *
   * @example
   * ```ts
   * const dispute = await facilpay.disputes.retrieve('dsp_123');
   * ```
   */
  retrieve(id: string): Promise<Dispute> {
    return this.client.get<Dispute>(`/v1/disputes/${encodeURIComponent(id)}`);
  }

  /**
   * Update a dispute with evidence or a status change.
   *
   * `PATCH /v1/disputes/:id`
   *
   * @param id - Dispute id.
   * @param params - New status, evidence and/or metadata.
   * @returns The updated dispute.
   * @throws {FacilPayAPIError} When the API rejects the update.
   * @throws {FacilPayConnectionError} When the API cannot be reached.
   *
   * @example
   * ```ts
   * await facilpay.disputes.update('dsp_123', { evidence: { trackingNumber: '1Z999' } });
   * ```
   */
  update(id: string, params: UpdateDisputeDto): Promise<Dispute> {
    return this.client.patch<Dispute>(`/v1/disputes/${encodeURIComponent(id)}`, params);
  }

  /**
   * Upload an evidence file (receipt, screenshot, shipping proof, ...) for a
   * dispute as `multipart/form-data`.
   *
   * Accepts a `Blob`/`File`, or a prebuilt `FormData` that is sent untouched.
   * Works with the global `FormData`/`Blob` in Node 18+ and browsers.
   *
   * `POST /v1/disputes/:id/evidence`
   *
   * @param id - Dispute id.
   * @param file - The evidence file, or a `FormData` body to send as-is.
   * @param options - File name, field name and extra form fields.
   * @returns The updated dispute.
   * @throws {FacilPayAPIError} When the API rejects the upload (e.g. file too large).
   * @throws {FacilPayConnectionError} When the API cannot be reached.
   *
   * @example
   * ```ts
   * const file = new Blob([await readFile('receipt.pdf')], { type: 'application/pdf' });
   * await facilpay.disputes.uploadEvidence('dsp_123', file, { filename: 'receipt.pdf' });
   * ```
   */
  uploadEvidence(
    id: string,
    file: Blob | FormData,
    options: UploadDisputeEvidenceOptions = {},
  ): Promise<Dispute> {
    let form: FormData;
    if (file instanceof FormData) {
      form = file;
    } else {
      form = new FormData();
      for (const [key, value] of Object.entries(options.fields ?? {})) {
        form.append(key, value);
      }
      const filename =
        options.filename ?? (file as Blob & { name?: string }).name ?? 'evidence';
      form.append(options.field ?? 'file', file, filename);
    }
    return this.client.post<Dispute>(
      `/v1/disputes/${encodeURIComponent(id)}/evidence`,
      form,
    );
  }
}
