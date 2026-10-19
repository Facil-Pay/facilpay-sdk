import { describe, expect, it } from 'vitest';
import {
  FacilPayAPIError,
  FacilPayConnectionError,
  FacilPayError,
  FacilPaySignatureVerificationError,
  FacilPayValidationError,
} from './core/errors';
import { FacilPayError as LegacyFacilPayError } from './errors';
import { FacilPayError as PublicFacilPayError } from './index';

describe('error consolidation', () => {
  it('exposes a single FacilPayError identity from every entry point', () => {
    expect(LegacyFacilPayError).toBe(PublicFacilPayError);
    expect(FacilPayError).toBe(PublicFacilPayError);
  });

  it('every SDK error subclass is instanceof the publicly exported FacilPayError', () => {
    const instances: unknown[] = [
      new FacilPayAPIError('api error', { status: 500 }),
      new FacilPayConnectionError(),
      new FacilPayValidationError('invalid'),
      new FacilPaySignatureVerificationError('bad signature'),
    ];
    for (const instance of instances) {
      expect(instance).toBeInstanceOf(PublicFacilPayError);
    }
  });
});
