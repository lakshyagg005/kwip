'use client';

import React from 'react';
import { Link2, Cpu, Share2 } from 'lucide-react';

export const HowItWorks = () => {
  return (
    <section id="how-it-works" className="py-20 bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-2">
            Simple 3-Step Workflow
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            From 30-minute video to 1-page visual in minutes
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* STEP 1 */}
          <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 relative hover:border-amber-400 transition group">
            <div className="w-12 h-12 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-xl mb-6 shadow-md">
              1
            </div>
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xl mb-3">
              <Link2 className="w-5 h-5 text-amber-500" />
              <h3>Paste Link</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Paste any supported YouTube URL up to 30 minutes — podcasts, founder interviews, lectures, tutorials, or documentaries.
            </p>
          </div>

          {/* STEP 2 */}
          <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 relative hover:border-amber-400 transition group">
            <div className="w-12 h-12 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-xl mb-6 shadow-md">
              2
            </div>
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xl mb-3">
              <Cpu className="w-5 h-5 text-amber-500" />
              <h3>Understand</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              KWIP retrieves the transcript, removes noise and repetition, and extracts key ideas, frameworks, metrics, and quotes.
            </p>
          </div>

          {/* STEP 3 */}
          <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 relative hover:border-amber-400 transition group">
            <div className="w-12 h-12 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-black text-xl mb-6 shadow-md">
              3
            </div>
            <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xl mb-3">
              <Share2 className="w-5 h-5 text-amber-500" />
              <h3>Share & Export</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Download your visual brief, social media carousel slides, or professional PDF summary ready to publish on LinkedIn or X.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
