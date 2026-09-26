export {
  FacilPayError,
  FacilPayValidationError,
  FacilPayAuthenticationError,
  FacilPayPermissionError,
  FacilPayNotFoundError,
  FacilPayConflictError,
  FacilPayRateLimitError,
  FacilPayAPIError,
  FacilPayConnectionError,
  FacilPaySignatureVerificationError,
  createErrorFromResponse,
  errorClassForStatus,
  parseRetryAfter,
} from './core/errors';

export type {
  FacilPayErrorOptions,
  FacilPayErrorBody,
} from './core/errors';
