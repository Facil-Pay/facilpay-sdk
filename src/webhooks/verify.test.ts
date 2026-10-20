import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { verifySignature, constructEvent } from './verify';
import { FacilPaySignatureVerificationError } from '../errors';

const SECRET = 'whsec_test_secret_123';
const OLD_SECRET = 'whsec_old_secret_456';
const PAYLOAD = JSON.stringify({ id: 'evt_123', type: 'payment.succeeded' });

function hmacHex(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

describe('webhook signature verification', () => {
  beforeEach(() => {
    // verify.ts resolves node:crypto through a global require probe; ensure the
    // synchronous Node code path is available under vitest's ESM transform.
    vi.stubGlobal('require', createRequire(import.meta.url));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('accepts a valid signature (Node crypto path)', () => {
    expect(verifySignature(PAYLOAD, hmacHex(PAYLOAD, SECRET), SECRET)).toBe(true);
  });

  it('accepts a valid signature and returns the parsed event (WebCrypto path)', async () => {
    const event = await constructEvent<{ id: string }>(
      PAYLOAD,
      hmacHex(PAYLOAD, SECRET),
      SECRET,
    );
    expect(event).toEqual(JSON.parse(PAYLOAD));
  });

  it('rejects a tampered payload', () => {
    const header = hmacHex(PAYLOAD, SECRET);
    const tampered = PAYLOAD.replace('succeeded', 'failed');
    expect(() => verifySignature(tampered, header, SECRET)).toThrow(
      FacilPaySignatureVerificationError,
    );
    expect(constructEvent(tampered, header, SECRET)).rejects.toThrow(
      FacilPaySignatureVerificationError,
    );
  });

  it('rejects a wrong secret', () => {
    const header = hmacHex(PAYLOAD, SECRET);
    expect(() => verifySignature(PAYLOAD, header, 'whsec_wrong')).toThrow(
      FacilPaySignatureVerificationError,
    );
    expect(constructEvent(PAYLOAD, header, 'whsec_wrong')).rejects.toThrow(
      FacilPaySignatureVerificationError,
    );
  });

  it('rejects a missing signature header', () => {
    expect(() => verifySignature(PAYLOAD, '', SECRET)).toThrow(
      FacilPaySignatureVerificationError,
    );
    expect(constructEvent(PAYLOAD, '', SECRET)).rejects.toThrow(
      FacilPaySignatureVerificationError,
    );
  });

  it('rejects an expired timestamp', () => {
    const now = Math.floor(Date.now() / 1000);
    const header = `t=${now - 600},v1=${hmacHex(PAYLOAD, SECRET)}`;
    expect(() => verifySignature(PAYLOAD, header, SECRET, { tolerance: 300 })).toThrow(
      FacilPaySignatureVerificationError,
    );
    expect(
      constructEvent(PAYLOAD, header, SECRET, { tolerance: 300 }),
    ).rejects.toThrow(FacilPaySignatureVerificationError);
  });

  it('accepts a fresh timestamp within tolerance', () => {
    const now = Math.floor(Date.now() / 1000);
    const header = `t=${now},v1=${hmacHex(PAYLOAD, SECRET)}`;
    expect(verifySignature(PAYLOAD, header, SECRET, { tolerance: 300 })).toBe(true);
  });

  it('supports multiple secrets for rotation', () => {
    const header = hmacHex(PAYLOAD, OLD_SECRET);
    expect(verifySignature(PAYLOAD, header, [SECRET, OLD_SECRET])).toBe(true);
    expect(
      constructEvent(PAYLOAD, header, [SECRET, OLD_SECRET]),
    ).resolves.toEqual(JSON.parse(PAYLOAD));
  });

  it('compares signatures in constant time (single-bit change fails)', () => {
    const valid = hmacHex(PAYLOAD, SECRET);
    const flipped = valid.slice(0, -1) + (valid.endsWith('0') ? '1' : '0');
    expect(() => verifySignature(PAYLOAD, flipped, SECRET)).toThrow(
      FacilPaySignatureVerificationError,
    );
  });

  it('evaluates every candidate when several signatures are provided', () => {
    const zeros = '00'.repeat(32);
    const header = `v1=${zeros},v1=${hmacHex(PAYLOAD, SECRET)}`;
    expect(verifySignature(PAYLOAD, header, SECRET)).toBe(true);
    expect(() => verifySignature(PAYLOAD, `v1=${zeros}`, SECRET)).toThrow(
      FacilPaySignatureVerificationError,
    );
  });
});
