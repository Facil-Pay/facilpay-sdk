import type { ReactNode } from 'react';

export const metadata = {
  title: 'FacilPay Next.js Example',
  description: 'Test payment creation and webhook verification.',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui', maxWidth: 680, margin: '4rem auto', padding: '0 1rem' }}>
        {children}
      </body>
    </html>
  );
}