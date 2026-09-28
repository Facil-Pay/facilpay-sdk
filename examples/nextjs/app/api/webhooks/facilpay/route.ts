import { Webhooks, type FacilPayEvent } from '@facilpay/sdk';

export const runtime = 'nodejs';

export async function POST(req: Request): Promise<Response> {
  const secret = process.env.FACILPAY_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: 'Webhook secret is not configured.' }, { status: 500 });
  }

  const signature = req.headers.get('x-facilpay-signature');
  if (!signature) {
    return Response.json({ error: 'Missing webhook signature.' }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: FacilPayEvent;
  try {
    event = await Webhooks.constructEvent<FacilPayEvent>(rawBody, signature, secret);
  } catch {
    return Response.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }

  if (event.type === 'payment.completed') {
    console.log('Payment completed:', event.data.id);
  }
  return Response.json({ received: true });
}