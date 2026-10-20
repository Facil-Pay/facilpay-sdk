/**
 * Base error for all FacilPay SDK errors.
 */
export class FacilPayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FacilPayError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the SDK cannot reach the API (network failure, DNS error,
 * or a request that exceeded its configured timeout).
 */
export class FacilPayConnectionError extends FacilPayError {
  /** The underlying cause, when available (e.g. the original AbortError). */
  public readonly cause?: unknown;

  constructor(message = 'Failed to connect to the FacilPay API', cause?: unknown) {
    super(message);
    this.name = 'FacilPayConnectionError';
    this.cause = cause;
  }
}

/**
 * Thrown when the API responds with a non-2xx status code.
 */
export class FacilPayAPIError extends FacilPayError {
  public readonly status: number;
  public readonly requestId?: string;
  public readonly correlationId?: string;
  public readonly body?: unknown;

  constructor(
    message: string,
    options: {
      status: number;
      requestId?: string;
      correlationId?: string;
      body?: unknown;
    },
  ) {
    super(message);
    this.name = 'FacilPayAPIError';
    this.status = options.status;
    this.requestId = options.requestId;
    this.correlationId = options.correlationId;
    this.body = options.body;
  }
}

/**
 * Thrown when client-side validation fails before any request is made
 * (e.g. an invalid idempotency key or missing Stellar parameters).
 */
export class FacilPayValidationError extends FacilPayError {
  /** Machine-readable failure code, when available. */
  public readonly code?: string;

  constructor(message: string, options?: { code?: string }) {
    super(message);
    this.name = 'FacilPayValidationError';
    this.code = options?.code;
  }
}
