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

/** 401: missing or invalid credentials. */
export class FacilPayAuthenticationError extends FacilPayAPIError {
  constructor(message: string, options: ApiErrorOptions) {
    super(message, options);
    this.name = 'FacilPayAuthenticationError';
  }
}

/** 403: authenticated but not allowed to perform the operation. */
export class FacilPayPermissionError extends FacilPayAPIError {
  constructor(message: string, options: ApiErrorOptions) {
    super(message, options);
    this.name = 'FacilPayPermissionError';
  }
}

/** 404: the requested resource does not exist. */
export class FacilPayNotFoundError extends FacilPayAPIError {
  constructor(message: string, options: ApiErrorOptions) {
    super(message, options);
    this.name = 'FacilPayNotFoundError';
  }
}

/** 409: request conflict (e.g. idempotency-key reuse with different params). */
export class FacilPayConflictError extends FacilPayAPIError {
  constructor(message: string, options: ApiErrorOptions) {
    super(message, options);
    this.name = 'FacilPayConflictError';
  }
}

/** 400/422: the request was invalid, with optional field-level errors. */
export class FacilPayInvalidRequestError extends FacilPayAPIError {
  public readonly fieldErrors?: unknown;

  constructor(message: string, options: ApiErrorOptions & { fieldErrors?: unknown }) {
    super(message, options);
    this.name = 'FacilPayInvalidRequestError';
    this.fieldErrors = options.fieldErrors;
  }
}

/** 429: rate limited. Retry after `retryAfter` seconds when provided. */
export class FacilPayRateLimitError extends FacilPayAPIError {
  public readonly retryAfter?: number;

  constructor(message: string, options: ApiErrorOptions & { retryAfter?: number }) {
    super(message, options);
    this.name = 'FacilPayRateLimitError';
    this.retryAfter = options.retryAfter;
  }
}

/** 5xx: the API failed to fulfil a valid request. */
export class FacilPayServerError extends FacilPayAPIError {
  constructor(message: string, options: ApiErrorOptions) {
    super(message, options);
    this.name = 'FacilPayServerError';
  }
}

export interface ApiErrorOptions {
  status: number;
  requestId?: string;
  correlationId?: string;
  body?: unknown;
}

export interface CreateApiErrorOptions {
  requestId?: string;
  correlationId?: string;
  body?: unknown;
  retryAfter?: number;
  message?: string;
}

function defaultMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const message = record['message'] ?? record['error'];
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return `Request failed with status ${status}`;
}

function fieldErrorsFromBody(body: unknown): unknown {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if ('errors' in record) return record['errors'];
    if ('fieldErrors' in record) return record['fieldErrors'];
  }
  return undefined;
}

/**
 * Picks the FacilPayAPIError subclass for an HTTP status code.
 */
export function createApiError(status: number, options: CreateApiErrorOptions = {}): FacilPayAPIError {
  const { requestId, correlationId, body, retryAfter } = options;
  const message = options.message ?? defaultMessage(status, body);
  const base = { status, requestId, correlationId, body };
  if (status === 401) return new FacilPayAuthenticationError(message, base);
  if (status === 403) return new FacilPayPermissionError(message, base);
  if (status === 404) return new FacilPayNotFoundError(message, base);
  if (status === 409) return new FacilPayConflictError(message, base);
  if (status === 400 || status === 422) {
    return new FacilPayInvalidRequestError(message, { ...base, fieldErrors: fieldErrorsFromBody(body) });
  }
  if (status === 429) return new FacilPayRateLimitError(message, { ...base, retryAfter });
  if (status >= 500 && status < 600) return new FacilPayServerError(message, base);
  return new FacilPayAPIError(message, base);
}
