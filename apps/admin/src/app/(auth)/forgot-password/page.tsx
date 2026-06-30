'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Hexagon, ArrowLeft, Mail } from 'lucide-react';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';

const schema = z.object({
  email: z.string().email('Enter a valid email address'),
});
type Form = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: Form) => {
    setSubmitting(true);
    try {
      await fetch('/api/v1/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      });
    } catch {
      // swallow — API always returns 200, always show success
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="flex justify-center mb-3"><Hexagon className="h-10 w-10 text-blue-600" /></div>
        <h1 className="text-xl font-semibold text-gray-900">Genesis</h1>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        {submitted ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
              <Mail className="h-6 w-6 text-blue-600" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Check your email</h2>
            <p className="text-sm text-gray-500 mb-6">
              If an account exists for that address, we&apos;ve sent a password reset link. It expires in 15 minutes.
            </p>
            <Link href="/login" className="text-sm text-blue-600 hover:underline">Back to sign in</Link>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Forgot Password</h2>
            <p className="text-sm text-gray-500 mb-5">Enter your email and we&apos;ll send a reset link.</p>
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address</label>
                <Input
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  error={!!errors.email}
                  {...register('email')}
                />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
              </div>
              <Button type="submit" className="w-full" loading={submitting}>Send Reset Link</Button>
            </form>
            <div className="mt-4 text-center">
              <Link href="/login" className="flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-900">
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
