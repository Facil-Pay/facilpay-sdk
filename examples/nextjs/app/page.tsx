import { createPayment } from './actions';

export default function HomePage() {
  return (
    <main>
      <h1>FacilPay checkout</h1>
      <p>Create a test payment through the server action.</p>
      <form action={createPayment}>
        <label htmlFor="amount">Amount (USD)</label>{' '}
        <input id="amount" name="amount" type="number" min="0.01" step="0.01" defaultValue="19.99" required />{' '}
        <button type="submit">Create payment</button>
      </form>
    </main>
  );
}