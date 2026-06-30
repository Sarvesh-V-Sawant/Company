export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      {children}
      <p className="mt-8 text-xs text-gray-400">© {new Date().getFullYear()} Genesis</p>
    </div>
  );
}
