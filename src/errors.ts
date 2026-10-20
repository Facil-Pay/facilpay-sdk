/**
 * Backwards-compatible re-export of the canonical error module.
 *
 * All SDK errors live in `./core/errors`; this module re-exports them so
 * existing imports keep working and `instanceof FacilPayError` behaves
 * identically no matter which path consumers import from.
 */
export {
  FacilPayAPIError,
  FacilPayConnectionError,
  FacilPayError,
  FacilPaySignatureVerificationError,
  FacilPayValidationError,
} from './core/errors';
