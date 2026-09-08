import React from 'react';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';

export const metadata = {
  title: 'KWIP — About Us',
  description: 'Learn about the vision behind KWIP.',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      <Navbar />
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-6">
        <h1 className="text-3xl font-extrabold tracking-tight">About KWIP</h1>
        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
          KWIP was built on a simple premise: people consume hours of brilliant YouTube content every day, but rarely have time to review, summarize, or share what they learned.
        </p>
        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
          Unlike generic AI summarizers that produce plain text bullet points, KWIP transforms YouTube transcripts into structured visual knowledge assets — Visual Briefs, Social Carousels, and PDFs — designed for maximum clarity and shareability.
        </p>
      </main>
      <Footer />
    </div>
  );
}
