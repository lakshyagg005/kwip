'use client';

import React from 'react';
import Link from 'next/link';

export const Footer = () => {
  return (
    <footer className="bg-slate-950 text-slate-400 py-12 border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-slate-900">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-black text-lg">
              K
            </div>
            <span className="font-extrabold text-xl tracking-tight text-white">KWIP</span>
          </Link>

          <div className="flex items-center gap-6 text-xs font-semibold text-slate-400">
            <Link href="/about" className="hover:text-white transition">About</Link>
            <Link href="/pricing" className="hover:text-white transition">Pricing</Link>
            <Link href="/privacy" className="hover:text-white transition">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition">Terms</Link>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <p>© {new Date().getFullYear()} KWIP. Turn long videos into visuals worth sharing.</p>
          <p>Built with OpenRouter Gemma AI & Next.js</p>
        </div>
      </div>
    </footer>
  );
};
