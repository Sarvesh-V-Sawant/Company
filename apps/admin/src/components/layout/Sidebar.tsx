'use client';
import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Clock, CalendarDays, RefreshCcw, DollarSign,
  BarChart3, Bell, ClipboardList, Settings, LogOut, User, Hexagon, Smartphone,
} from 'lucide-react';
import { cn } from '@lib/utils/cn';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebarCounts } from '@/hooks/useSidebarCounts';

interface NavItem { href: string; label: string; icon: React.ElementType; badgeKey?: string }

const NAV_MAIN: NavItem[] = [
  { href: '/dashboard',       label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/employees',       label: 'Employees',       icon: Users,          badgeKey: 'employees' },
  { href: '/attendance',      label: 'Attendance',      icon: Clock },
  { href: '/leave',           label: 'Leave',           icon: CalendarDays,   badgeKey: 'leaves' },
  { href: '/regularization',  label: 'Regularization',  icon: RefreshCcw,     badgeKey: 'regularizations' },
  { href: '/payroll',          label: 'Payroll',          icon: DollarSign },
  { href: '/reports',          label: 'Reports',          icon: BarChart3 },
  { href: '/devices/requests', label: 'Device Requests',  icon: Smartphone, badgeKey: 'pendingDevices' },
];

const NAV_SECONDARY: NavItem[] = [
  { href: '/notifications', label: 'Notifications', icon: Bell,          badgeKey: 'notifications' },
  { href: '/audit-logs',    label: 'Audit Logs',    icon: ClipboardList },
];

type BadgeKey = 'employees' | 'leaves' | 'regularizations' | 'notifications' | 'pendingDevices';

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const counts = useSidebarCounts();

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  const renderBadge = (key?: string) => {
    if (!key) return null;
    const n = counts[key as BadgeKey];
    if (!n) return null;
    return (
      <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-500 px-1.5 text-[10px] font-semibold text-white">
        {n > 99 ? '99+' : n}
      </span>
    );
  };

  return (
    <aside className="fixed left-0 top-0 h-full w-60 flex flex-col bg-[hsl(222,47%,11%)] z-40">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-white/10">
        <Hexagon className="h-7 w-7 text-blue-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white leading-tight truncate">Genesis</p>
          <p className="text-xs text-slate-400 truncate">Admin Portal</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV_MAIN.map(({ href, label, icon: Icon, badgeKey }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              isActive(href)
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-[hsl(217,33%,17%)] hover:text-white',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{label}</span>
            {renderBadge(badgeKey)}
          </Link>
        ))}

        <div className="my-2 border-t border-white/10" />

        {NAV_SECONDARY.map(({ href, label, icon: Icon, badgeKey }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
              isActive(href)
                ? 'bg-blue-600 text-white'
                : 'text-slate-300 hover:bg-[hsl(217,33%,17%)] hover:text-white',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{label}</span>
            {renderBadge(badgeKey)}
          </Link>
        ))}

        <div className="my-2 border-t border-white/10" />

        <Link
          href="/settings"
          className={cn(
            'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
            isActive('/settings')
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-[hsl(217,33%,17%)] hover:text-white',
          )}
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span>Settings</span>
        </Link>
      </nav>

      {/* Profile */}
      <div className="border-t border-white/10 px-3 py-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-xs font-semibold shrink-0">
            {user ? `${user.firstName[0]}${user.lastName[0]}` : '?'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">
              {user ? `${user.firstName} ${user.lastName}` : 'Admin'}
            </p>
            <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            title="Logout"
            className="p-1 text-slate-400 hover:text-white rounded transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
