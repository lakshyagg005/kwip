'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

export const CTA = () => {
  return (
    <section className="py-20 bg-slate-900 text-white relative overflow-hidden">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-semibold mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Start turning content into visual knowledge</span>
        </div>

        <h2 className="text-3xl sm:text-5xl font-extrabold tracking-tight mb-6 max-w-3xl mx-auto leading-tight">
          Stop saving videos you’ll never finish.
        </h2>

        <p className="text-slate-300 text-base sm:text-lg max-w-2xl mx-auto mb-10 leading-relaxed font-medium">
          Turn the ideas that matter into something you can understand, keep, and share with your audience in minutes.
        </p>

        <Link
          href="/app"
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-8 py-4 rounded-xl text-base transition shadow-xl hover:scale-105"
        >
          <span>Create your first KWIP</span>
          <ArrowRight className="w-5 h-5" />
        </Link>
      </div>
    </section>
  );
};
