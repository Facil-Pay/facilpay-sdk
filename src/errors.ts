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
 * Thrown when a webhook signature is missing, malformed, or does not match
 * the expected HMAC digest for the provided secret(s).
 */
export class FacilPaySignatureVerificationError extends FacilPayError {
  constructor(message: string) {
    super(message);
    this.name = 'FacilPaySignatureVerificationError';
    Object.setPrototypeOf(this, new.target.prototype);
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
