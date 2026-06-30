import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Page Not Found — Genesis' };

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-sm text-center space-y-4">
        <p className="text-6xl font-bold text-gray-100 select-none">404</p>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Page Not Found</h1>
          <p className="text-sm text-gray-500 mt-1">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 text-white px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            ← Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
