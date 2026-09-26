/**
 * Typed error hierarchy for the FacilPay SDK.
 *
 * The FacilPay API (NestJS) returns errors in the shape:
 *
 *   { statusCode: number, message: string | string[], error?: string }
 *
 * These classes turn that payload into typed errors so callers can use
 * `instanceof` checks instead of inspecting status codes.
 */

export interface FacilPayErrorOptions {
  status?: number;
  code?: string;
  requestId?: string;
  raw?: unknown;
  headers?: Record<string, string>;
  details?: string[];
  retryAfter?: number;
  cause?: unknown;
}

/**
 * Base class for every error thrown by the SDK.
 */
export class FacilPayError extends Error {
  /** HTTP status code, when the error originated from an API response. */
  public readonly status?: number;
  /** Machine-readable error code (e.g. NestJS `error` field). */
  public readonly code?: string;
  /** Value of the `x-request-id` response header, when present. */
  public readonly requestId?: string;
  /** The raw response body (or original error) that produced this error. */
  public readonly raw?: unknown;
  /** Response headers, lower-cased. */
  public readonly headers?: Record<string, string>;
  /** Validation messages, when the API returned an array `message`. */
  public readonly details?: string[];

  constructor(message: string, options: FacilPayErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.raw = options.raw;
    this.headers = options.headers;
    this.details = options.details;

    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }

    // Preserve the prototype chain so `instanceof` works after transpilation
    // to ES5/CJS (where extending built-ins otherwise breaks the chain).
    Object.setPrototypeOf(this, new.target.prototype);

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, new.target);
    }
  }
}

/** 400 / 422 — request payload failed validation. */
export class FacilPayValidationError extends FacilPayError {}

/** 401 — missing or invalid API key. */
export class FacilPayAuthenticationError extends FacilPayError {}

/** 403 — the API key is valid but lacks permission for this resource. */
export class FacilPayPermissionError extends FacilPayError {}

/** 404 — the requested resource does not exist. */
export class FacilPayNotFoundError extends FacilPayError {}

/** 409 — the request conflicts with the current state of the resource. */
export class FacilPayConflictError extends FacilPayError {}

/** 429 — rate limited. `retryAfter` is in seconds, when the API provided it. */
export class FacilPayRateLimitError extends FacilPayError {
  public readonly retryAfter?: number;

  constructor(message: string, options: FacilPayErrorOptions = {}) {
    super(message, options);
    this.retryAfter = options.retryAfter;
  }
}

/** 5xx — the API failed to process an otherwise valid request. */
export class FacilPayAPIError extends FacilPayError {}

/** Network failure, DNS error, aborted request or timeout. */
export class FacilPayConnectionError extends FacilPayError {}

/** Webhook signature verification failed. */
export class FacilPaySignatureVerificationError extends FacilPayError {}

/**
 * Parse a `Retry-After` header value into seconds.
 *
 * Accepts either a number of seconds (`"120"`) or an HTTP date
 * (`"Wed, 21 Oct 2015 07:28:00 GMT"`). Returns `undefined` when the value
 * is missing or unparseable.
 */
export function parseRetryAfter(value?: string | null): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.floor(seconds));
  }

  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.max(0, Math.ceil((date - Date.now()) / 1000));
  }

  return undefined;
}

/**
 * Normalize a NestJS error body into a message string and optional details.
 *
 * `message` may be a string or an array of validation messages; arrays are
 * joined into the message and also exposed as `details`.
 */
export function normalizeMessage(message: unknown): {
  message: string;
  details?: string[];
} {
  if (Array.isArray(message)) {
    const details = message.map((item) => String(item));
    return { message: details.join(', '), details };
  }

  if (typeof message === 'string' && message.length > 0) {
    return { message };
  }

  return { message: 'Unknown FacilPay API error' };
}

/**
 * Map an HTTP status code to the matching error class.
 */
export function errorClassForStatus(
  status: number,
): typeof FacilPayError {
  switch (status) {
    case 400:
    case 422:
      return FacilPayValidationError;
    case 401:
      return FacilPayAuthenticationError;
    case 403:
      return FacilPayPermissionError;
    case 404:
      return FacilPayNotFoundError;
    case 409:
      return FacilPayConflictError;
    case 429:
      return FacilPayRateLimitError;
    default:
      return status >= 500 ? FacilPayAPIError : FacilPayError;
  }
}

/**
 * Build a typed error from an HTTP response.
 */
export function createErrorFromResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): FacilPayError {
  const normalizedHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalizedHeaders[key.toLowerCase()] = value;
  }

  const payload = (body ?? {}) as {
    message?: unknown;
    error?: unknown;
    code?: unknown;
  };

  const { message, details } = normalizeMessage(payload.message);
  const code =
    typeof payload.error === 'string'
      ? payload.error
      : typeof payload.code === 'string'
        ? payload.code
        : undefined;

  const ErrorClass = errorClassForStatus(status);

  return new ErrorClass(message, {
    status,
    code,
    requestId: normalizedHeaders['x-request-id'],
    raw: body,
    headers: normalizedHeaders,
    details,
    retryAfter: parseRetryAfter(normalizedHeaders['retry-after']),
  });
}
