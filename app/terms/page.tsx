import React from 'react';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-6">
        <h1 className="text-3xl font-extrabold tracking-tight">Terms of Service</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          By using KWIP, you agree to comply with all applicable terms regarding YouTube content usage and intellectual property. Generated visual assets include source attributions to original YouTube creators.
        </p>
      </main>
      <Footer />
    </div>
  );
}
