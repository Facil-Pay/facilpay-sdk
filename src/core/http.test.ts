import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from './http';

function createFetch(body: unknown = { ok: true }, headers: Record<string, string> = {}) {
    return vi.fn(async () =>
        new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json', ...headers },
        }),
    ) as unknown as typeof fetch;
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

    it('logs failed responses with their status and request ID', async () => {
        const logger = { error: vi.fn() };
        const fetch = vi.fn(async () =>
            new Response(JSON.stringify({ message: 'failed' }), {
                status: 400,
                headers: { 'x-request-id': 'req_failed' },
            }),
        ) as unknown as typeof fetch;
        const http = new HttpClient({ fetch, logger });

        await expect(http.request({ path: '/payments' })).rejects.toThrow('Request failed');

        expect(logger.error).toHaveBeenCalledWith(
            expect.objectContaining({ status: 400, requestId: 'req_failed', attempt: 1 }),
        );
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