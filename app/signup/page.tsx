'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ArrowRight, AlertCircle, Sparkles } from 'lucide-react';
import { GoogleIcon } from '@/components/ui/GoogleIcon';

function SignupFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const nextPath = searchParams.get('next') || '/app';
  const targetUrl = searchParams.get('url') || '';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDuplicateEmail, setIsDuplicateEmail] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    const cleanName = fullName.trim();

    if (!cleanName || !cleanEmail || !password) {
      setError('Please fill in all required fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    setError(null);
    setIsDuplicateEmail(false);

    const redirectPath = targetUrl
      ? `${nextPath}?url=${encodeURIComponent(targetUrl)}`
      : nextPath;

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanName,
        },
      },
    });

    if (signUpError) {
      const isAlreadyRegistered =
        signUpError.message?.toLowerCase().includes('already registered') ||
        signUpError.message?.toLowerCase().includes('already exists') ||
        signUpError.status === 422;

      if (isAlreadyRegistered) {
        setIsDuplicateEmail(true);
        setError('An account with this email already exists. Sign in instead.');
      } else {
        setError(signUpError.message || 'Failed to create account. Please try again.');
      }
      setLoading(false);
      return;
    }

    // 1. If session is returned directly, redirect immediately
    if (data?.session) {
      router.push(redirectPath);
      return;
    }

    // 2. If user is created but session is null, immediately perform signInWithPassword
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (signInError) {
      console.warn('Auto sign-in notice:', signInError);
    }

    // Immediately redirect user to destination
    router.push(redirectPath);
  };

  const handleGoogleSignup = async () => {
    setLoading(true);
    setError(null);

    const redirectPath = targetUrl
      ? `${nextPath}?url=${encodeURIComponent(targetUrl)}`
      : nextPath;
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectPath)}`;

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
      },
    });

    if (oauthError) {
      setError(oauthError.message || 'Failed to initialize Google signup.');
      setLoading(false);
    }
  };

  const loginLink = `/login${targetUrl ? `?next=${encodeURIComponent(nextPath)}&url=${encodeURIComponent(targetUrl)}` : ''}`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center space-y-3">
        <Link href="/" className="inline-flex items-center gap-2 group">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white font-black text-xl shadow-md group-hover:scale-105 transition">
            K
          </div>
          <span className="font-extrabold text-2xl tracking-tight text-slate-900 dark:text-slate-100">
            KWIP
          </span>
        </Link>

        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
          Create your KWIP account
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Start converting long videos into sharing-worthy visual briefs
        </p>

        {targetUrl && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-2 text-left">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
            <span>Create your free account to immediately analyze your YouTube video.</span>
          </div>
        )}
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white dark:bg-slate-900 py-8 px-6 shadow-xl rounded-2xl border border-slate-200 dark:border-slate-800 sm:px-10 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-xs font-semibold text-red-600 dark:text-red-300 space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
              {isDuplicateEmail && (
                <div className="pt-1">
                  <Link
                    href={loginLink}
                    className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400 underline hover:opacity-80"
                  >
                    <span>Sign in with this email →</span>
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* GOOGLE OAUTH BUTTON */}
          <button
            type="button"
            onClick={handleGoogleSignup}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 font-bold py-3 rounded-xl text-sm transition shadow-sm disabled:opacity-50"
          >
            <GoogleIcon className="w-5 h-5" />
            <span>Continue with Google</span>
          </button>

          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
            <span className="bg-white dark:bg-slate-900 px-3 text-xs text-slate-400 font-bold uppercase">
              Or with email
            </span>
            <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Alex Morgan"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Password (min. 8 characters)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Confirm Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold py-3.5 rounded-xl text-sm transition shadow-md disabled:opacity-50"
            >
              <span>{loading ? 'Creating account...' : 'Create account'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="text-center pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-500">
              Already have an account?{' '}
              <Link href={loginLink} className="font-bold text-amber-600 hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center font-bold">Loading Signup...</div>}>
      <SignupFormContent />
    </Suspense>
  );
}
