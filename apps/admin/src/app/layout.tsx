import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/contexts/AuthContext';
import SessionExpiredOverlay from '@components/layout/SessionExpiredOverlay';
import './globals.css';

export const metadata: Metadata = {
  title: 'Genesis — Admin',
  description: 'Genesis HR Management Platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
          <SessionExpiredOverlay />
        </AuthProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </body>
    </html>
  );
}
