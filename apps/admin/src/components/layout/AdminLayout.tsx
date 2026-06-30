'use client';
import { type ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import { type BreadcrumbItem } from './Breadcrumb';

interface Props {
  children: ReactNode;
  breadcrumb: BreadcrumbItem[];
}

export default function AdminLayout({ children, breadcrumb }: Props) {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 ml-60">
        <Header breadcrumb={breadcrumb} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
