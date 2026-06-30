'use client';
import { useRouter } from 'next/navigation';
import { ShieldX } from 'lucide-react';
import { Button } from '@components/ui/button';
import { apiFetch } from '@lib/utils/api-client';

export default function UnauthorizedPage() {
  const router = useRouter();

  const handleSignOut = async () => {
    try { await apiFetch('/api/v1/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <ShieldX className="h-6 w-6 text-red-600" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Access Denied</h1>
          <p className="text-sm text-gray-500 mt-1">
            You don&apos;t have permission to access this page. This portal is for Genesis Admins and HR Staff only.
          </p>
        </div>
        <div className="space-y-2 pt-2">
          <a
            href="mailto:admin@genesis.com"
            className="inline-flex w-full items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Contact your administrator
          </a>
          <Button className="w-full" onClick={handleSignOut}>
            Sign in with another account
          </Button>
        </div>
      </div>
    </div>
  );
}
