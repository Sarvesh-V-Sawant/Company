'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import LoadingSpinner from '@components/shared/LoadingSpinner';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) { router.replace('/login'); return; }
    if (user.requiresPasswordChange) { router.replace('/change-password'); return; }
  }, [user, loading, router]);

  if (loading) return <LoadingSpinner />;
  if (!user) return null;

  return <>{children}</>;
}
