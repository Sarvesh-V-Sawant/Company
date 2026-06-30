'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Hexagon, ArrowLeft, Eye, EyeOff, CheckCircle, XCircle, Clock } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';

const schema = z
  .object({
    newPassword: z
      .string()
      .min(8, 'Minimum 8 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[0-9]/, 'Must contain a number'),
    confirm: z.string(),
  })
  .refine((d) => d.newPassword === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });
type Form = z.infer<typeof schema>;

type State = 'form' | 'submitting' | 'success' | 'error-invalid' | 'error-expired' | 'error-used' | 'no-token';

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');
  const email = params.get('email');

  const isInvite = !!token && !!email;
  const [state, setState] = useState<State>(isInvite ? 'form' : 'no-token');
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: Form) => {
    if (!token || !email) return;
    setState('submitting');
    try {
      const res = await fetch('/api/v1/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, email, newPassword: data.newPassword }),
      });
      const body = await res.json();
      if (res.ok) {
        setState('success');
        setTimeout(() => router.replace('/login'), 3000);
        return;
      }
      const code = body?.error?.code ?? '';
      if (code === 'AUTH_009') { setState('error-expired'); return; }
      if (code === 'AUTH_008') { setState('error-invalid'); return; }
      setState('error-invalid');
    } catch {
      setState('error-invalid');
    }
  };

  if (state === 'no-token') {
    return (
      <div className="text-center">
        <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-base font-semibold text-gray-900 mb-2">Invalid Link</h2>
        <p className="text-sm text-gray-500 mb-6">This link is missing required parameters.</p>
        <Link href="/forgot-password" className="text-sm text-blue-600 hover:underline">Request a new link</Link>
      </div>
    );
  }

  if (state === 'error-expired') {
    return (
      <div className="text-center">
        <Clock className="h-12 w-12 text-amber-400 mx-auto mb-4" />
        <h2 className="text-base font-semibold text-gray-900 mb-2">Link Expired</h2>
        <p className="text-sm text-gray-500 mb-6">
          This link has expired. Password setup links are valid for 24 hours, reset links for 15 minutes.
        </p>
        <Link href="/forgot-password" className="text-sm text-blue-600 hover:underline">Request a new link</Link>
      </div>
    );
  }

  if (state === 'error-invalid' || state === 'error-used') {
    return (
      <div className="text-center">
        <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-base font-semibold text-gray-900 mb-2">Invalid or Used Link</h2>
        <p className="text-sm text-gray-500 mb-6">
          This link is invalid or has already been used. Each link can only be used once.
        </p>
        <Link href="/forgot-password" className="text-sm text-blue-600 hover:underline">Request a new link</Link>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="text-center">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-base font-semibold text-gray-900 mb-2">Password Set</h2>
        <p className="text-sm text-gray-500 mb-6">Your password has been created. Redirecting to sign in…</p>
        <Link href="/login" className="text-sm text-blue-600 hover:underline">Sign in now</Link>
      </div>
    );
  }

  return (
    <>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">
        {isInvite ? 'Set Your Password' : 'Create New Password'}
      </h2>
      <p className="text-sm text-gray-500 mb-5">
        {isInvite
          ? 'Choose a strong password to activate your Genesis account.'
          : 'Enter a new password for your account.'}
      </p>
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
          <div className="relative">
            <Input
              type={showPwd ? 'text' : 'password'}
              autoComplete="new-password"
              error={!!errors.newPassword}
              className="pr-10"
              {...register('newPassword')}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={showPwd ? 'Hide password' : 'Show password'}
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.newPassword
            ? <p className="mt-1 text-xs text-red-600">{errors.newPassword.message}</p>
            : <p className="mt-1 text-xs text-gray-400">Min 8 chars · uppercase · number</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
          <div className="relative">
            <Input
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              error={!!errors.confirm}
              className="pr-10"
              {...register('confirm')}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={showConfirm ? 'Hide password' : 'Show password'}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirm && <p className="mt-1 text-xs text-red-600">{errors.confirm.message}</p>}
        </div>
        <Button type="submit" className="w-full" loading={state === 'submitting'}>
          {isInvite ? 'Activate Account' : 'Update Password'}
        </Button>
      </form>
      <div className="mt-4 text-center">
        <Link href="/login" className="flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
        </Link>
      </div>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-3"><Hexagon className="h-10 w-10 text-blue-600" /></div>
        <h1 className="text-xl font-semibold text-gray-900">Genesis</h1>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <Suspense fallback={<p className="text-sm text-center text-gray-400">Loading…</p>}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
