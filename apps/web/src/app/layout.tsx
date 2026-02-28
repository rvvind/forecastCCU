import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'ForecastCCU',
  description: 'Peak CCU forecasting for live sports events',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <Providers>
          <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-6">
            <Link href="/forecasts" className="text-lg font-bold tracking-tight text-indigo-600">
              ForecastCCU
            </Link>
            <nav className="flex gap-4 text-sm text-gray-600">
              <Link href="/forecasts" className="hover:text-indigo-600 transition-colors">
                Forecasts
              </Link>
              <Link href="/forecasts/new" className="hover:text-indigo-600 transition-colors">
                + New Forecast
              </Link>
            </nav>
          </header>
          <main className="max-w-6xl mx-auto px-6 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
