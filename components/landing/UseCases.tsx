'use client';

import React from 'react';
import { GraduationCap, Rocket, Code, Palette, Share2, Search } from 'lucide-react';

export const UseCases = () => {
  const useCases = [
    {
      icon: <Rocket className="w-6 h-6 text-amber-500" />,
      title: 'Founders & Execs',
      desc: 'Digest long founder interviews, business breakdowns, and macro analysis in 2 minutes.',
    },
    {
      icon: <Share2 className="w-6 h-6 text-purple-500" />,
      title: 'Creators & Marketers',
      desc: 'Turn podcast nuggets into high-engagement LinkedIn & X carousel posts instantly.',
    },
    {
      icon: <Code className="w-6 h-6 text-blue-500" />,
      title: 'Developers & Engineers',
      desc: 'Extract key concepts, command steps, and tool recommendations from programming tutorials.',
    },
    {
      icon: <GraduationCap className="w-6 h-6 text-emerald-500" />,
      title: 'Students & Researchers',
      desc: 'Turn dense academic lectures and educational YouTube series into structured study briefs.',
    },
    {
      icon: <Palette className="w-6 h-6 text-rose-500" />,
      title: 'Designers & Strategists',
      desc: 'Capture mental models, UX principles, and design frameworks visually.',
    },
    {
      icon: <Search className="w-6 h-6 text-indigo-500" />,
      title: 'Lifelong Learners',
      desc: 'Never let saved "Watch Later" videos go to waste — turn them into an actionable visual knowledge base.',
    },
  ];

  return (
    <section className="py-20 bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-2">
            Target Audience
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Built for people who learn from long-form content
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {useCases.map((uc, i) => (
            <div
              key={i}
              className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-amber-400 transition"
            >
              <div className="p-3 rounded-xl bg-white dark:bg-slate-800 shadow-sm w-fit mb-4">
                {uc.icon}
              </div>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-lg mb-2">{uc.title}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{uc.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
