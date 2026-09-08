import React from 'react';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          At KWIP, we respect your privacy. We process YouTube video URLs and public transcripts strictly to generate your requested visual assets.
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          We do not sell user data or store private credentials. Generated briefs stored locally on your device remain under your control.
        </p>
      </main>
      <Footer />
    </div>
  );
}
