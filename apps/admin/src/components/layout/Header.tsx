'use client';
import Link from 'next/link';
import { Bell, ChevronDown, User, KeyRound, LogOut } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import Breadcrumb, { type BreadcrumbItem } from './Breadcrumb';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebarCounts } from '@/hooks/useSidebarCounts';

interface Props { breadcrumb: BreadcrumbItem[] }

export default function Header({ breadcrumb }: Props) {
  const { user, logout } = useAuth();
  const counts = useSidebarCounts();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <Breadcrumb items={breadcrumb} />
      <div className="flex items-center gap-3">
        <Link href="/notifications" className="relative p-2 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors">
          <Bell className="h-5 w-5" />
          {counts.notifications > 0 && (
            <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white px-1">
              {counts.notifications > 99 ? '99+' : counts.notifications}
            </span>
          )}
        </Link>

        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen(v => !v)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-semibold">
              {user ? `${user.firstName[0]}${user.lastName[0]}` : '?'}
            </div>
            <span className="hidden sm:block">{user ? `${user.firstName} ${user.lastName}` : 'Admin'}</span>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </button>

          {open && (
            <div className="absolute right-0 mt-1 w-48 rounded-lg border border-gray-200 bg-white shadow-lg py-1">
              <Link href="/settings/profile" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setOpen(false)}>
                <User className="h-4 w-4" /> View Profile
              </Link>
              <Link href="/change-password" className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setOpen(false)}>
                <KeyRound className="h-4 w-4" /> Change Password
              </Link>
              <div className="my-1 border-t border-gray-100" />
              <button
                onClick={() => { setOpen(false); void logout(); }}
                className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
