'use client';
import { Lock } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { Button } from '@components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

export default function SessionExpiredOverlay() {
  const { sessionExpired, clearExpired } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  if (!sessionExpired) return null;

  const handleSignIn = () => {
    clearExpired();
    router.push(`/login?redirect=${encodeURIComponent(pathname)}`);
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Session expired"
      className="fixed inset-0 z-[9999] flex items-center justify-center"
    >
      <div className="absolute inset-0 backdrop-blur-sm bg-black/30 pointer-events-none" />
      <div className="relative bg-white rounded-xl shadow-2xl p-8 w-full max-w-sm mx-4 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-50">
          <Lock className="h-6 w-6 text-amber-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Session Expired</h2>
        <p className="text-sm text-gray-500 mb-6">
          Your session has expired or was revoked. Please sign in again to continue.
        </p>
        <Button className="w-full" onClick={handleSignIn}>Sign In Again</Button>
      </div>
    </div>
  );
}
