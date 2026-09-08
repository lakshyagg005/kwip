'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export const FAQ = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: 'What is KWIP?',
      a: 'KWIP is a visual knowledge engine that turns long-form YouTube videos into structured one-page visual briefs, 1080x1350 social media carousels, and printable PDF summaries.',
    },
    {
      q: 'What YouTube videos can KWIP analyze?',
      a: 'KWIP works with any public YouTube video that has available English captions or auto-generated transcripts (educational lectures, podcasts, tutorials, founder interviews, business breakdowns, documentaries).',
    },
    {
      q: 'What video length does KWIP currently support?',
      a: 'KWIP currently supports YouTube videos up to 30 minutes in duration. Videos over 30 minutes are stopped prior to transcript fetching and analysis.',
    },
    {
      q: 'How accurate are KWIP summaries, and can AI make mistakes?',
      a: 'KWIP synthesizes summaries based on available video transcripts and enforces strict grounding rules for metrics and quotes. However, like all AI tools, outputs can occasionally contain inaccuracies. We encourage users to verify critical facts against the original source video.',
    },
    {
      q: 'What happens if a YouTube video has no transcript or captions?',
      a: 'KWIP requires YouTube transcript or caption data to analyze content. If a video lacks captions or has disabled transcripts, KWIP displays a clear human-readable notification so you can try another video.',
    },
    {
      q: 'Can I export PNGs, Carousels, and PDFs?',
      a: 'Yes. Every generated asset can be downloaded directly in high resolution — PNGs for Visual Briefs, individual/all slide PNGs for 1080x1350 Carousels (LinkedIn/X/Instagram), and downloadable PDFs.',
    },
    {
      q: 'Is my content private?',
      a: 'By default, generated briefs are stored locally in your browser session. You can choose to generate shareable public links (`/brief/[id]`) or keep your assets private.',
    },
  ];

  return (
    <section className="py-20 bg-slate-50 dark:bg-slate-900/40 border-t border-slate-200/60 dark:border-slate-800">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-2">
            Frequently Asked Questions
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
            Everything you need to know about KWIP
          </h2>
        </div>

        <div className="space-y-4">
          {faqs.map((item, idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm"
            >
              <button
                onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                className="w-full p-5 text-left flex items-center justify-between font-bold text-slate-900 dark:text-slate-100 text-base"
              >
                <span>{item.q}</span>
                {openIndex === idx ? (
                  <ChevronUp className="w-5 h-5 text-amber-500 shrink-0" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
                )}
              </button>

              {openIndex === idx && (
                <div className="px-5 pb-5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
