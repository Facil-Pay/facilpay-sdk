export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const { payment } = await searchParams;

  return (
    <main>
      <h1>Test payment created</h1>
      <p>Payment ID: {payment ?? 'Unavailable'}</p>
      <a href="/">Create another payment</a>
    </main>
  );
}