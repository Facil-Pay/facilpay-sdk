import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { FacilPay } from '../../src/index';

/**
 * Integration tests against a real facilpay-api + PostgreSQL instance.
 *
 * These tests are only executed when the integration environment is
 * available. `npm run test:integration` boots the Docker Compose stack
 * (see test/integration/docker-compose.yml), runs migrations and the
 * setup script, which exports FACILPAY_API_KEY / FACILPAY_BASE_URL.
 *
 * When those variables are absent (e.g. plain `npm test`) the suite is
 * skipped so unit runs stay hermetic.
 */

const BASE_URL = process.env.FACILPAY_BASE_URL ?? 'http://localhost:4000';
const API_KEY = process.env.FACILPAY_API_KEY;
const WEBHOOK_SECRET = process.env.FACILPAY_WEBHOOK_SECRET;

const describeIntegration = API_KEY ? describe : describe.skip;

interface WebhookDelivery {
  body: string;
  signature: string;
}

function startReceiver(): Promise<{ server: Server; url: string; next: () => Promise<WebhookDelivery> }> {
  return new Promise((resolve) => {
    let pending: ((d: WebhookDelivery) => void) | null = null;
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c) => chunks.push(c as Buffer));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const signature = String(req.headers['facilpay-signature'] ?? req.headers['x-facilpay-signature'] ?? '');
        if (pending) {
          const cb = pending;
          pending = null;
          cb({ body, signature });
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end('{"received":true}');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        server,
        url: `http://127.0.0.1:${port}/webhook`,
        next: () =>
          new Promise<WebhookDelivery>((res) => {
            pending = res;
          }),
      });
    });
  });
}

describeIntegration('facilpay-api integration', () => {
  const client = new FacilPay({ apiKey: API_KEY as string, baseUrl: BASE_URL });

  it('runs the payment lifecycle: create -> retrieve -> list -> cancel', async () => {
    const created = await client.payments.create({
      amount: 1500,
      currency: 'USD',
      description: 'integration payment',
    });
    expect(created.id).toBeTruthy();
    expect(created.status).toBeDefined();

    const retrieved = await client.payments.retrieve(created.id);
    expect(retrieved.id).toBe(created.id);

    const list = await client.payments.list({ limit: 10 });
    const ids = (list.data ?? []).map((p) => p.id);
    expect(ids).toContain(created.id);

    const canceled = await client.payments.cancel(created.id);
    expect(canceled.id).toBe(created.id);
    expect(canceled.status).toBe('canceled');
  });

  it('creates and redeems a payment link', async () => {
    const link = await client.paymentLinks.create({
      amount: 2500,
      currency: 'USD',
      description: 'integration link',
    });
    expect(link.id).toBeTruthy();
    expect(link.url).toBeTruthy();

    const redeemed = await client.paymentLinks.redeem(link.id);
    expect(redeemed.id).toBe(link.id);
    expect(redeemed.status).toBeDefined();
  });

  it('registers a webhook, sends a test delivery and verifies the signature', async () => {
    const receiver = await startReceiver();
    try {
      const endpoint = await client.webhooks.create({
        url: receiver.url,
        events: ['payment.created'],
      });
      expect(endpoint.id).toBeTruthy();

      const delivery = receiver.next();
      await client.webhooks.sendTest(endpoint.id);
      const received = await delivery;

      expect(received.body).toBeTruthy();
      expect(received.signature).toBeTruthy();

      const event = client.webhooks.constructEvent(
        received.body,
        received.signature,
        WEBHOOK_SECRET ?? endpoint.secret ?? '',
      );
      expect(event).toBeTruthy();
      expect(event.type).toBeDefined();
    } finally {
      await new Promise<void>((res) => receiver.server.close(() => res()));
    }
  });
});
