import type { Metadata } from 'next';
import { Roboto } from 'next/font/google';
import './globals.css';
import { NavBar } from '@/components/NavBar';

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-roboto',
});

export const metadata: Metadata = {
  title: 'App Insights Explorer',
  description: 'Azure Application Insights monitoring dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${roboto.variable} min-h-screen bg-background antialiased font-[var(--font-roboto),sans-serif]`}>
        <NavBar />
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}
