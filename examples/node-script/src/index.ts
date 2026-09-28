import 'dotenv/config';
import { FacilPay } from '@facilpay/sdk';

const apiKey = process.env.FACILPAY_API_KEY;
if (!apiKey?.startsWith('fp_test_')) {
  throw new Error('Set FACILPAY_API_KEY to an fp_test_ key in examples/node-script/.env.');
}

const facilpay = new FacilPay({
  apiKey,
  baseUrl: process.env.FACILPAY_BASE_URL ?? 'http://localhost:4000',
});

for await (const payment of facilpay.payments.list({ limit: 25 })) {
  console.log(`${payment.id}\t${payment.status}\t${payment.amount} ${payment.currency}`);
}