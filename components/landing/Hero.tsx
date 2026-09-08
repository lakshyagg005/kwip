'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { YoutubeIcon } from '@/components/ui/YoutubeIcon';
import { ArrowRight, Sparkles, FileText, Layers, Download, CheckCircle2, Play, Info } from 'lucide-react';
import { isValidYoutubeUrl } from '@/lib/youtube';

import { createClient } from '@/lib/supabase/client';

export const Hero = () => {
  const router = useRouter();
  const [urlInput, setUrlInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) {
      setErrorMsg('Please enter a YouTube link.');
      return;
    }
    if (!isValidYoutubeUrl(urlInput)) {
      setErrorMsg('Please enter a valid YouTube URL (e.g. youtube.com/watch?v=... or youtu.be/...)');
      return;
    }
    setErrorMsg('');

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const target = urlInput.trim();

    if (!user) {
      router.push(`/login?next=/app&url=${encodeURIComponent(target)}`);
    } else {
      router.push(`/app?url=${encodeURIComponent(target)}`);
    }
  };

  const handleExampleClick = (sampleUrl: string) => {
    setUrlInput(sampleUrl);
    setErrorMsg('');
  };

  return (
    <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden bg-gradient-to-b from-amber-50/40 via-white to-white dark:from-slate-950 dark:via-slate-950 dark:to-slate-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
        {/* TOP BADGE */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-100/80 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-300 text-xs font-semibold mb-6 animate-pulse">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>Watch less. Understand more. Share what you learned.</span>
        </div>

        {/* HEADLINE */}
        <h1 className="text-3xl sm:text-5xl lg:text-7xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight leading-[1.15] sm:leading-[1.1] mb-4 sm:mb-6 max-w-4xl mx-auto px-1">
          Turn long videos into <span className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 bg-clip-text text-transparent">visuals worth sharing.</span>
        </h1>

        {/* SUBHEAD */}
        <p className="text-sm sm:text-lg lg:text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed font-medium px-2">
          KWIP turns informative YouTube videos into beautiful visual briefs, carousels, and PDFs in minutes.
        </p>

        {/* FUNCTIONAL INPUT FORM */}
        <div className="max-w-2xl mx-auto mb-6 px-1">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 p-2 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 focus-within:ring-2 focus-within:ring-amber-500 transition">
            <div className="flex items-center gap-2.5 px-3 min-w-0 flex-1">
              <YoutubeIcon className="w-5 h-5 sm:w-6 sm:h-6 text-red-500 shrink-0" />
              <input
                type="text"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  if (errorMsg) setErrorMsg('');
                }}
                placeholder="Paste YouTube link (e.g. youtube.com/watch?v=...)"
                className="w-full py-2.5 sm:py-3 bg-transparent text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none truncate"
              />
            </div>

            <button
              type="submit"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-950 font-extrabold px-5 py-3 rounded-xl transition shadow-md whitespace-nowrap text-xs sm:text-sm shrink-0"
            >
              <span>Create Brief</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* INFORMATIONAL DURATION NOTE */}
          <div className="flex items-center justify-center sm:justify-start gap-1.5 text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 mt-2.5 px-2">
            <Info className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
            <span>Currently, KWIP supports YouTube videos up to 30 minutes.</span>
          </div>

          {errorMsg && (
            <p className="text-xs font-semibold text-red-500 mt-2 text-left px-2">
              {errorMsg}
            </p>
          )}

          {/* EXAMPLE LINKS */}
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-4 text-xs text-slate-500 flex-wrap">
            <span className="font-semibold text-slate-600 dark:text-slate-400 text-[11px] sm:text-xs">Try an example:</span>
            <button
              onClick={() => handleExampleClick('https://www.youtube.com/watch?v=dQw4w9WgXcQ')}
              className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition text-[11px] sm:text-xs"
            >
              Podcast
            </button>
            <button
              onClick={() => handleExampleClick('https://www.youtube.com/watch?v=L_LUpnjgPso')}
              className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition text-[11px] sm:text-xs"
            >
              Educational
            </button>
            <button
              onClick={() => handleExampleClick('https://www.youtube.com/watch?v=9bZkp7q19f0')}
              className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition text-[11px] sm:text-xs"
            >
              Business
            </button>
            <button
              onClick={() => handleExampleClick('https://www.youtube.com/watch?v=kjBOesZCoqc')}
              className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition text-[11px] sm:text-xs"
            >
              Technology
            </button>
          </div>
        </div>

        {/* TRANSFORMATION PIPELINE PREVIEW DIAGRAM */}
        <div className="mt-12 sm:mt-16 pt-6 sm:pt-8 border-t border-slate-200/60 dark:border-slate-800/60 max-w-4xl mx-auto w-full overflow-hidden">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-6 sm:mb-8">
            How YouTube Content Transforms with KWIP
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 items-center">
            {/* INPUT CARD */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md flex flex-col items-center text-center">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center mb-3">
                <YoutubeIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">INPUT</span>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">Long-Form YouTube Video</h3>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-1">Podcasts, lectures, interviews (up to 30 mins)</p>
            </div>

            {/* AI PROCESSOR CARD */}
            <div className="p-4 sm:p-5 rounded-2xl bg-amber-500 text-slate-950 border border-amber-400 shadow-lg flex flex-col items-center text-center transform md:-translate-y-2">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-slate-950 text-amber-400 flex items-center justify-center mb-3">
                <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider text-slate-900 mb-1">KWIP ENGINE</span>
              <h3 className="font-extrabold text-xs sm:text-sm">Transcript Intelligence</h3>
              <p className="text-[11px] sm:text-xs text-slate-900/80 font-medium mt-1">Chunking, concept extraction, layout design</p>
            </div>

            {/* OUTPUT CARDS */}
            <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md flex flex-col items-center text-center">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                  <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                  <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
              </div>
              <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">VISUAL OUTPUTS</span>
              <h3 className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">Briefs, Carousels & PDFs</h3>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-1">Deterministic, editable, shareable assets</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
