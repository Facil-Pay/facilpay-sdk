import { describe, expect, it } from 'vitest';
import { FacilPayError, FacilPayValidationError } from './errors';
import { generateIdempotencyKey, validateIdempotencyKey } from './idempotency';

describe('validateIdempotencyKey', () => {
  it('returns the key when it is valid', () => {
    expect(validateIdempotencyKey('abc-123_XYZ.9')).toBe('abc-123_XYZ.9');
  });

  it('throws FacilPayValidationError with a code for an invalid key', () => {
    try {
      validateIdempotencyKey('not valid!');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(FacilPayValidationError);
      expect(error).toBeInstanceOf(FacilPayError);
      expect((error as FacilPayValidationError).code).toBe('invalid_idempotency_key');
    }
  });

  it('throws for an empty key', () => {
    expect(() => validateIdempotencyKey('')).toThrow(FacilPayValidationError);
  });
});

describe('generateIdempotencyKey', () => {
  it('generates a key that passes validation', () => {
    expect(validateIdempotencyKey(generateIdempotencyKey())).toBeTruthy();
  });
});
