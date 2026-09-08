'use client';

import React, { useState } from 'react';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import { Check, Sparkles, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function PricingPage() {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleUpgradePro = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const json = await res.json();
      if (!res.ok) {
        if (json.code === 'UNAUTHENTICATED') {
          window.location.href = '/login?next=/pricing';
          return;
        }
        setErrorMsg(json.error || 'Failed to start Stripe checkout session.');
        setLoading(false);
        return;
      }

      if (json.url) {
        window.location.href = json.url;
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error redirecting to Checkout.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-12">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block">
            Simple Transparent Pricing
          </span>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
            Start Free. Upgrade for <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">unlimited power.</span>
          </h1>
          <p className="text-slate-600 dark:text-slate-400 text-sm sm:text-base font-medium">
            Turn long videos into shareable visual briefs, carousels, and vector PDFs.
          </p>

          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-xs font-semibold text-red-600 dark:text-red-300 flex items-center justify-center gap-2 max-w-md mx-auto">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* FREE PLAN */}
          <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-6 flex flex-col justify-between shadow-md">
            <div>
              <h2 className="text-xl font-bold mb-1">Free Starter</h2>
              <p className="text-xs text-slate-500 mb-6">Explore KWIP with monthly visual briefs</p>
              <div className="text-4xl font-black mb-6">
                $0 <span className="text-xs font-normal text-slate-500">/ month</span>
              </div>

              <ul className="space-y-3 text-xs text-slate-700 dark:text-slate-300 font-medium">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>2 YouTube analyses every month</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Visual Brief PNG Export</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>6–7 Slide Social Carousel</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Downloadable PDF Summaries</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Personal Visual Library</span>
                </li>
              </ul>
            </div>

            <Link
              href="/signup"
              className="w-full text-center py-3.5 rounded-xl font-extrabold bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs transition hover:opacity-90 shadow"
            >
              Get Started Free
            </Link>
          </div>

          {/* PRO PLAN */}
          <div className="p-8 rounded-2xl bg-slate-900 text-white border border-amber-500/50 space-y-6 flex flex-col justify-between relative overflow-hidden shadow-2xl">
            <div className="absolute top-4 right-4 bg-amber-500 text-slate-950 font-black text-[10px] uppercase px-2.5 py-0.5 rounded shadow">
              RECOMMENDED
            </div>

            <div>
              <h2 className="text-xl font-bold mb-1">KWIP Pro</h2>
              <p className="text-xs text-slate-400 mb-6">Unlimited video distillation for creators & professionals</p>
              <div className="text-4xl font-black mb-6">
                $15 <span className="text-xs font-normal text-slate-400">/ month</span>
              </div>

              <ul className="space-y-3 text-xs text-slate-300 font-medium">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Unlimited YouTube Analyses</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Visual Briefs, Carousels & PDFs</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>All 5 Custom Template Styles</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Full Knowledge Library Access</span>
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Priority AI Processing Engine</span>
                </li>
              </ul>
            </div>

            <button
              onClick={handleUpgradePro}
              disabled={loading}
              className="w-full text-center py-3.5 rounded-xl font-extrabold bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs transition shadow-lg flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>{loading ? 'Opening Checkout...' : 'Upgrade to Pro — $15/month'}</span>
            </button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
