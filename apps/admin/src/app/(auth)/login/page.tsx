'use client';
import { Suspense } from 'react';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Hexagon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { useAuth } from '@/contexts/AuthContext';

const schema = z.object({
  email:    z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type Form = z.infer<typeof schema>;

const API_MESSAGES: Record<string, string> = {
  AUTH_001: 'Invalid email or password. Check your credentials and try again.',
  AUTH_004: 'Invalid email or password. Check your credentials and try again.',
  AUTH_002: 'Too many sign-in attempts. Please wait before trying again.',
  AUTH_007: 'Your account has been deactivated. Contact your administrator.',
};

function LoginForm() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const redirect = params.get('redirect') ?? '/dashboard';

  const [showPassword, setShowPassword] = useState(false);
  const [apiError, setApiError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (!loading && user && !user.requiresPasswordChange) router.replace(redirect);
  }, [user, loading, router, redirect]);

  const onSubmit = async ({ email, password }: Form) => {
    setApiError('');
    setSubmitting(true);
    try {
      const { requiresPasswordChange } = await login(email, password);
      if (requiresPasswordChange) router.replace('/change-password');
      else router.replace(redirect);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      setApiError(API_MESSAGES[code] ?? 'Unable to connect. Check your internet connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-3">
          <Hexagon className="h-10 w-10 text-blue-600" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900">Genesis</h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Admin Sign In</h2>

        {apiError && (
          <div role="alert" aria-live="assertive" className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {apiError}
          </div>
        )}

        <form aria-label="Admin sign in" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
            <Input type="email" autoComplete="email" aria-required="true" error={!!errors.email} {...register('email')} />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                aria-required="true"
                error={!!errors.password}
                className="pr-10"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
          </div>

          <Button type="submit" className="w-full" loading={submitting}>Sign In</Button>
        </form>

        <p className="text-center mt-4 text-sm">
          <Link href="/forgot-password" className="text-blue-600 hover:underline">Forgot your password?</Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-sm"><div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-sm text-gray-400">Loading…</div></div>}>
      <LoginForm />
    </Suspense>
  );
}
