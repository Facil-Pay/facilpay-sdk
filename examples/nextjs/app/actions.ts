'use server';

import { FacilPay } from '@facilpay/sdk';
import { redirect } from 'next/navigation';

export async function createPayment(formData: FormData): Promise<void> {
  const apiKey = process.env.FACILPAY_API_KEY;
  if (!apiKey?.startsWith('fp_test_')) {
    throw new Error('Configure FACILPAY_API_KEY with an fp_test_ key.');
  }

  const rawAmount = Number(formData.get('amount'));
  if (!Number.isFinite(rawAmount) || rawAmount < 0.01) {
    throw new Error('Enter an amount of at least 0.01.');
  }

  const facilpay = new FacilPay({
    apiKey,
    baseUrl: process.env.FACILPAY_BASE_URL ?? 'http://localhost:4000',
  });
  const payment = await facilpay.payments.create({
    amount: rawAmount,
    currency: 'USD',
    description: 'Next.js App Router example',
  });

  redirect(`/checkout?payment=${encodeURIComponent(payment.id)}`);
}