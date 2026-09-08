'use client';

import React, { useState, useEffect } from 'react';
import { HeaderNav } from '@/components/dashboard/HeaderNav';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { User as UserIcon, Shield, CreditCard, LogOut, KeyRound, Check, AlertCircle, Sparkles } from 'lucide-react';

export default function SettingsPage() {
  const supabase = createClient();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ full_name?: string; email?: string; plan?: string } | null>(null);
  const [fullName, setFullName] = useState('');
  const [usageCount, setUsageCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      if (currentUser) {
        setUser(currentUser);
        supabase
          .from('profiles')
          .select('*')
          .eq('id', currentUser.id)
          .single()
          .then(({ data }) => {
            if (data) {
              setProfile(data);
              setFullName(data.full_name || currentUser.user_metadata?.full_name || '');
            }
          });

        fetch('/api/user/quota')
          .then((res) => res.json())
          .then((data) => {
            if (data && data.success && typeof data.usageCount === 'number') {
              setUsageCount(data.usageCount);
            }
          })
          .catch((err) => console.warn('Failed to fetch user quota:', err));
      }
    });
  }, [supabase]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setMessage(null);

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', user.id);

    if (error) {
      setMessage('Failed to update profile.');
    } else {
      setMessage('Profile updated successfully!');
    }
    setLoading(false);
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      setMessage('Failed to send reset email.');
    } else {
      setMessage('Password reset email sent to your inbox.');
    }
    setLoading(false);
  };

  const handleSignOut = async () => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.clear();
      } catch {}
    }
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const planName = profile?.plan === 'pro' ? 'Pro' : 'Free';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      <HeaderNav />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-1">
            Account Preferences
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight">Account Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage your user profile, subscription plan, security credentials, and account settings.
          </p>
        </div>

        {message && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs font-semibold text-amber-900 dark:text-amber-300 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {/* PROFILE SECTION */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Profile Details</h2>
              <p className="text-xs text-slate-500">Update your name and primary contact email</p>
            </div>
          </div>

          <form onSubmit={handleUpdateProfile} className="space-y-4 max-w-md">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Email Address
              </label>
              <input
                type="email"
                disabled
                value={user?.email || ''}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-sm font-medium opacity-70 cursor-not-allowed"
              />
              <p className="text-[11px] text-slate-400 mt-1">Managed via Supabase Auth</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs transition shadow"
            >
              Save Profile
            </button>
          </form>
        </div>

        {/* SUBSCRIPTION PLAN & USAGE SECTION */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/40 text-purple-600 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Subscription Plan & Usage</h2>
              <p className="text-xs text-slate-500">Your active plan and monthly analysis limits</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Active Plan</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-slate-900 dark:text-slate-100">{planName} Plan</span>
                <span
                  className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${
                    planName === 'Pro'
                      ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
                  }`}
                >
                  {planName === 'Pro' ? '$15 / month' : '$0 / month'}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wider">Monthly Analysis Quota</span>
              <div className="text-xl font-extrabold">
                {planName === 'Pro' ? (
                  <span className="text-emerald-600 dark:text-emerald-400">Unlimited Analyses</span>
                ) : (
                  <span>{usageCount} of 2 Used This Month</span>
                )}
              </div>
            </div>
          </div>

          {planName === 'Free' && (
            <div className="pt-2">
              <a
                href="/pricing"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-extrabold px-6 py-3 rounded-xl text-xs shadow hover:opacity-90 transition"
              >
                <Sparkles className="w-4 h-4" />
                <span>Upgrade to KWIP Pro — $15/month</span>
              </a>
            </div>
          )}
        </div>

        {/* SECURITY & ACCOUNT ACTIONS */}
        <div className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Security & Password</h2>
              <p className="text-xs text-slate-500">Request password reset or terminate active session</p>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={handlePasswordReset}
              disabled={loading}
              className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold px-4 py-2.5 rounded-xl text-xs transition"
            >
              <KeyRound className="w-4 h-4" />
              <span>Send Password Reset Email</span>
            </button>

            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/40 text-red-600 font-bold px-4 py-2.5 rounded-xl text-xs transition"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
