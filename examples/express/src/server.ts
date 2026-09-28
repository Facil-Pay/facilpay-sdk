import 'dotenv/config';
import express from 'express';
import { FacilPay, Webhooks, type FacilPayEvent } from '@facilpay/sdk';

const apiKey = process.env.FACILPAY_API_KEY;
if (!apiKey?.startsWith('fp_test_')) {
  throw new Error('Set FACILPAY_API_KEY to an fp_test_ key in examples/express/.env.');
}

const webhookSecret = process.env.FACILPAY_WEBHOOK_SECRET;
if (!webhookSecret) {
  throw new Error('Set FACILPAY_WEBHOOK_SECRET in examples/express/.env.');
}

const facilpay = new FacilPay({
  apiKey,
  baseUrl: process.env.FACILPAY_BASE_URL ?? 'http://localhost:4000',
});
const app = express();

app.post('/webhooks/facilpay', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.get('X-FacilPay-Signature');
  if (!signature || !Buffer.isBuffer(req.body)) {
    res.sendStatus(400);
    return;
  }

  let event: FacilPayEvent;
  try {
    event = await Webhooks.constructEvent<FacilPayEvent>(req.body, signature, webhookSecret);
  } catch {
    res.sendStatus(401);
    return;
  }

  if (event.type === 'payment.completed') {
    console.log('Payment completed:', event.data.id);
  }
  res.sendStatus(200);
});

app.get('/', async (_req, res) => {
  try {
    const payment = await facilpay.payments.create({
      amount: 19.99,
      currency: 'USD',
      description: 'Express QR checkout example',
    });
    const qr = await facilpay.payments.getQrCode(payment.id, { format: 'png' });
    const image = typeof qr === 'string'
      ? qr
      : `data:image/png;base64,${Buffer.from(qr).toString('base64')}`;

    res.type('html').send(`<!doctype html>
<html lang="en">
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>FacilPay Express Checkout</title>
  <body style="font: 16px system-ui; max-width: 32rem; margin: 4rem auto; text-align: center;">
    <h1>Scan to pay $19.99</h1>
    <img src="${image}" alt="Payment QR code" width="280" height="280">
    <p>Payment ${payment.id} · ${payment.status}</p>
    <p>Refresh this page to create another test payment.</p>
  </body>
</html>`);
  } catch (error) {
    console.error('Could not create checkout:', error);
    res.status(500).send('Unable to create a payment. Check the server logs and API configuration.');
  }
});

app.use(express.json());

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`Express example listening at http://localhost:${port}`));