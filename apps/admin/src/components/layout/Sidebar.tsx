'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, Clock, CalendarDays, RefreshCcw, DollarSign,
  BarChart3, Bell, ClipboardList, Settings, LogOut, Hexagon, Smartphone,
  Briefcase, ChevronDown, ChevronUp, Link2, FileText, Truck, CreditCard,
  Mail, BookOpen, Upload, LayoutGrid,
} from 'lucide-react';
import { cn } from '@lib/utils/cn';
import { useAuth } from '@/contexts/AuthContext';
import { useSidebarCounts } from '@/hooks/useSidebarCounts';

type Workspace = 'desk' | 'attendance';

interface NavItem { href: string; label: string; icon: React.ElementType; badgeKey?: string }

const NAV_DESK: NavItem[] = [
  { href: '/desk',                         label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/desk/chains',                  label: 'Chains',           icon: Link2 },
  { href: '/desk/purchase-orders',         label: 'PO Inbox',         icon: FileText },
  { href: '/desk/tax-invoices',            label: 'Tax Invoices',     icon: FileText },
  { href: '/desk/sales-orders',            label: 'Sales Orders',     icon: FileText },
  { href: '/desk/transit',                 label: 'Transit',          icon: Truck },
  { href: '/desk/payments',                label: 'Payments',         icon: CreditCard },
  { href: '/desk/emails',                  label: 'Emails',           icon: Mail },
  { href: '/desk/import',                  label: 'Bulk Import',      icon: Upload },
  { href: '/desk/reports',                 label: 'Reports',          icon: BarChart3 },
];

const NAV_DESK_MASTERS: NavItem[] = [
  { href: '/desk/masters/canteens',          label: 'Canteens',         icon: BookOpen },
  { href: '/desk/masters/manufacturers',     label: 'Manufacturers',    icon: BookOpen },
  { href: '/desk/masters/products',          label: 'Products',         icon: BookOpen },
  { href: '/desk/masters/addresses',         label: 'Addresses',        icon: BookOpen },
  { href: '/desk/masters/price-lists',       label: 'Price Lists',      icon: BookOpen },
  { href: '/desk/masters/commission-rules',  label: 'Commission Rules', icon: BookOpen },
];

const NAV_ATTENDANCE: NavItem[] = [
  { href: '/dashboard',       label: 'Dashboard',       icon: LayoutDashboard },
  { href: '/employees',       label: 'Employees',       icon: Users,          badgeKey: 'employees' },
  { href: '/attendance',      label: 'Attendance',      icon: Clock },
  { href: '/leave',           label: 'Leave',           icon: CalendarDays,   badgeKey: 'leaves' },
  { href: '/regularization',  label: 'Regularization',  icon: RefreshCcw,     badgeKey: 'regularizations' },
  { href: '/payroll',         label: 'Payroll',         icon: DollarSign },
  { href: '/reports',         label: 'Reports',         icon: BarChart3 },
  { href: '/devices/requests',label: 'Device Requests', icon: Smartphone,     badgeKey: 'pendingDevices' },
];

const NAV_ATTENDANCE_SECONDARY: NavItem[] = [
  { href: '/notifications', label: 'Notifications', icon: Bell,         badgeKey: 'notifications' },
  { href: '/audit-logs',    label: 'Audit Logs',    icon: ClipboardList },
];

type BadgeKey = 'employees' | 'leaves' | 'regularizations' | 'notifications' | 'pendingDevices';

const ATTENDANCE_ADMIN_ROLES = ['admin', 'super_admin'];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const counts = useSidebarCounts();

  const isAttendanceAdmin = ATTENDANCE_ADMIN_ROLES.includes(user?.role ?? '');
  const isOnDeskPath = pathname.startsWith('/desk');

  const [workspace, setWorkspace] = useState<Workspace>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('genesis:workspace') as Workspace | null;
      if (saved === 'attendance' && isAttendanceAdmin) return 'attendance';
    }
    return isOnDeskPath || !isAttendanceAdmin ? 'desk' : 'attendance';
  });

  const [mastersOpen, setMastersOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('genesis:workspace', workspace);
    }
  }, [workspace]);

  // Auto-switch workspace based on path
  useEffect(() => {
    if (isOnDeskPath && workspace !== 'desk') setWorkspace('desk');
  }, [isOnDeskPath, workspace]);

  const isActive = (href: string) =>
    href === '/dashboard' || href === '/desk'
      ? pathname === href
      : pathname.startsWith(href);

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

  const renderLink = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
        isActive(item.href)
          ? 'bg-blue-600 text-white'
          : 'text-slate-300 hover:bg-[hsl(217,33%,17%)] hover:text-white',
      )}
    >
      <item.icon className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {renderBadge(item.badgeKey)}
    </Link>
  );

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

      {/* Workspace switcher — only for attendance-admin roles */}
      {isAttendanceAdmin && (
        <div className="px-3 pt-3 pb-1">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 px-1 mb-1">Workspace</p>
          <div className="flex rounded-md overflow-hidden border border-white/10">
            <button
              onClick={() => setWorkspace('desk')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors',
                workspace === 'desk'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/5',
              )}
            >
              <Briefcase className="h-3 w-3" />
              Work Desk
            </button>
            <button
              onClick={() => setWorkspace('attendance')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors',
                workspace === 'attendance'
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/5',
              )}
            >
              <LayoutGrid className="h-3 w-3" />
              HR / Att.
            </button>
          </div>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {workspace === 'desk' ? (
          <>
            {NAV_DESK.map(renderLink)}

            <div className="my-1 border-t border-white/10" />

            {/* Masters collapsible */}
            <button
              onClick={() => setMastersOpen((o) => !o)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:bg-[hsl(217,33%,17%)] hover:text-white transition-colors"
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate text-left">Masters</span>
              {mastersOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {mastersOpen && (
              <div className="pl-3 space-y-0.5">
                {NAV_DESK_MASTERS.map(renderLink)}
              </div>
            )}
          </>
        ) : (
          <>
            {NAV_ATTENDANCE.map(renderLink)}

            <div className="my-2 border-t border-white/10" />

            {NAV_ATTENDANCE_SECONDARY.map(renderLink)}

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
          </>
        )}
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
