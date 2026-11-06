import type { ReactNode } from 'react';

export const metadata = { title: 'Sultan: 1453', description: 'An Ottoman strategy game on a 3D map, narrated by Claude.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400;0,700;1,400&family=Alegreya+SC:wght@500;700&family=Alegreya+Sans:wght@400;500;700&display=swap"
        />
      </head>
      <body style={{ margin: 0, background: '#0e131c', height: '100vh', overflow: 'hidden' }}>{children}</body>
    </html>
  );
}
