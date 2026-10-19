import { afterEach, describe, expect, it, vi } from 'vitest';
import { FacilPayAPIError } from './errors';
import { HttpClient } from './http';

function createFetch(body: unknown = { ok: true }, headers: Record<string, string> = {}) {
    const mockFetch = vi.fn(
        async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> =>
            new Response(JSON.stringify(body), {
                status: 200,
                headers: { 'content-type': 'application/json', ...headers },
            }),
    );
    return mockFetch as unknown as typeof globalThis.fetch & Pick<typeof mockFetch, 'mock'>;
}

describe('HttpClient diagnostics', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it('redacts sensitive headers, secret fields, token prefixes, and email addresses', async () => {
        const logger = { debug: vi.fn() };
        const http = new HttpClient({
            headers: { Authorization: 'arbitrary-auth-value' },
            logger,
            fetch: createFetch({
                secret: 'webhook-secret-value',
                webhookSecret: 'whsec_webhook-value',
                liveToken: 'fp_live_live-value',
                testToken: 'fp_test_test-value',
                customerEmail: 'customer@example.com',
            }),
        });

        await http.request({
            method: 'POST',
            path: '/payments',
            headers: { 'X-API-Key': 'private-api-key' },
            body: {
                secret: 'body-secret-value',
                webhookSecret: 'whsec_body-value',
                liveToken: 'fp_live_body-value',
                testToken: 'fp_test_body-value',
                email: 'buyer@example.org',
            },
        });

        const logged = JSON.stringify(logger.debug.mock.calls[0]?.[0]);
        for (const sensitiveValue of [
            'arbitrary-auth-value',
            'private-api-key',
            'webhook-secret-value',
            'body-secret-value',
            'whsec_webhook-value',
            'whsec_body-value',
            'fp_live_live-value',
            'fp_live_body-value',
            'fp_test_test-value',
            'fp_test_body-value',
            'customer@example.com',
            'buyer@example.org',
        ]) {
            expect(logged).not.toContain(sensitiveValue);
        }
        expect(logged).toContain('[REDACTED_EMAIL]');
        expect(logger.debug).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                path: '/payments',
                status: 200,
                attempt: 1,
            }),
        );
    });

    it('sends a per-request correlation ID and logs the response request ID', async () => {
        const fetch = createFetch({}, { 'x-request-id': 'req_123' });
        const logger = { debug: vi.fn() };
        const http = new HttpClient({ fetch, logger });

        await http.request({ path: '/payments', correlationId: 'trace_456' });

        expect(fetch).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                headers: expect.objectContaining({ 'X-Correlation-Id': 'trace_456' }),
            }),
        );
        expect(logger.debug).toHaveBeenCalledWith(
            expect.objectContaining({ requestId: 'req_123' }),
        );
    });

    it('throws FacilPayAPIError with status, body, and request ID on failure', async () => {
        const logger = { error: vi.fn() };
        const mockFetch = vi.fn(
            async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> =>
                new Response(JSON.stringify({ message: 'failed' }), {
                    status: 400,
                    headers: { 'x-request-id': 'req_failed' },
                }),
        );
        const fetch = mockFetch as unknown as typeof globalThis.fetch & Pick<typeof mockFetch, 'mock'>;
        const http = new HttpClient({ fetch, logger });

        const error = await http.request({ path: '/payments' }).catch((err) => err);

        expect(error).toBeInstanceOf(FacilPayAPIError);
        expect(error.message).toBe('failed');
        expect(error.status).toBe(400);
        expect(error.body).toEqual({ message: 'failed' });
        expect(error.requestId).toBe('req_failed');

        expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({ status: 400, requestId: 'req_failed', attempt: 1 }),
        );
    });

    it('falls back to a status message and captures the correlation ID', async () => {
        const mockFetch = vi.fn(
            async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> =>
                new Response('', {
                    status: 500,
                    headers: { 'x-request-id': 'req_500', 'x-correlation-id': 'corr_1' },
                }),
        );
        const fetch = mockFetch as unknown as typeof globalThis.fetch & Pick<typeof mockFetch, 'mock'>;
        const http = new HttpClient({ fetch });

        const error = await http.request({ path: '/payments' }).catch((err) => err);

        expect(error).toBeInstanceOf(FacilPayAPIError);
        expect(error.message).toBe('Request failed with status 500');
        expect(error.status).toBe(500);
        expect(error.body).toBeUndefined();
        expect(error.requestId).toBe('req_500');
        expect(error.correlationId).toBe('corr_1');
    });

    it('does not log when neither a logger nor the environment shortcut is configured', async () => {
        vi.stubEnv('FACILPAY_LOG', '');
        const debug = vi.spyOn(console, 'debug');
        const info = vi.spyOn(console, 'info');
        const warn = vi.spyOn(console, 'warn');
        const error = vi.spyOn(console, 'error');
        const http = new HttpClient({ fetch: createFetch() });

        await http.request({ path: '/payments' });

        expect(debug).not.toHaveBeenCalled();
        expect(info).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
        expect(error).not.toHaveBeenCalled();
    });

    it('uses console debug logging when FACILPAY_LOG=debug in Node', async () => {
        vi.stubEnv('FACILPAY_LOG', 'debug');
        const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
        const http = new HttpClient({ fetch: createFetch() });

        await http.request({ path: '/payments' });

        expect(debug).toHaveBeenCalledWith(expect.objectContaining({ path: '/payments' }));
    });
});

describe('HttpClient idempotency', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('auto-generates an Idempotency-Key for POST requests when none is passed', async () => {
        const fetch = createFetch();
        const http = new HttpClient({ fetch });

        await http.request({ method: 'POST', path: '/payments', body: { amount: 100 } });

        expect(fetch).toHaveBeenCalledTimes(1);
        const [, init] = fetch.mock.calls[0]!;
        const headers = new Headers(init?.headers as HeadersInit);
        expect(headers.get('Idempotency-Key')).toMatch(/^[A-Za-z0-9-_.]{1,255}$/);
    });

    it('does not send an Idempotency-Key for non-POST requests by default', async () => {
        const fetch = createFetch();
        const http = new HttpClient({ fetch });

        await http.request({ method: 'GET', path: '/payments' });

        const [, init] = fetch.mock.calls[0]!;
        const headers = new Headers(init?.headers as HeadersInit);
        expect(headers.get('Idempotency-Key')).toBeNull();
    });

    it('forwards a valid user-provided key unchanged', async () => {
        const fetch = createFetch();
        const http = new HttpClient({ fetch });

        await http.request({
            method: 'POST',
            path: '/payments',
            body: { amount: 100 },
            idempotencyKey: 'user-key_123.abc',
        });

        const [, init] = fetch.mock.calls[0]!;
        const headers = new Headers(init?.headers as HeadersInit);
        expect(headers.get('Idempotency-Key')).toBe('user-key_123.abc');
    });

    it('rejects an invalid user-provided key before sending', async () => {
        const fetch = createFetch();
        const http = new HttpClient({ fetch });

        await expect(
            http.request({ method: 'POST', path: '/payments', idempotencyKey: 'not valid!' }),
        ).rejects.toThrow(/Idempotency-Key/);
        expect(fetch).not.toHaveBeenCalled();
    });
});