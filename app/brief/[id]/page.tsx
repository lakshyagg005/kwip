'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { VisualBrief } from '@/components/brief/VisualBrief';
import { CarouselRender } from '@/components/carousel/CarouselRender';
import { PdfRender } from '@/components/pdf/PdfRender';
import { KwipAnalysisResult, OutputFormat } from '@/types/kwip';
import { downloadElementAsPng } from '@/lib/export';
import {
  ArrowRight,
  Sparkles,
  Home,
  FileText,
  Layers,
  Download,
  Share2,
  Check,
} from 'lucide-react';

export default function PublicBriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [brief, setBrief] = useState<KwipAnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OutputFormat>('brief');
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (id) {
      fetch(`/api/analyses/${id}`)
        .then((res) => {
          if (!res.ok) {
            setBrief(null);
            return null;
          }
          return res.json();
        })
        .then((json) => {
          if (json && json.success && json.data) {
            setBrief(json.data);
          } else {
            setBrief(null);
          }
        })
        .catch(() => setBrief(null))
        .finally(() => setLoading(false));
    }
  }, [id]);

  const handleCopyShareLink = () => {
    if (!brief) return;
    const shareUrl = `${window.location.origin}/brief/${brief.id}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDownloadPng = async () => {
    if (!brief) return;
    await downloadElementAsPng('visual-brief-single-page-export', `${brief.id}_visual_brief`);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      {/* PUBLIC NAVBAR WITH VIRAL CTA */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-black text-lg shadow">
              K
            </div>
            <span className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-slate-100">
              KWIP
            </span>
          </Link>

          <Link
            href="/app"
            className="flex items-center gap-2 text-xs sm:text-sm font-extrabold bg-amber-500 hover:bg-amber-400 text-slate-950 px-4 py-2.5 rounded-xl transition shadow"
          >
            <span>Create your brief with KWIP</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </header>

      {/* MAIN BRIEF DISPLAY */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {loading ? (
          <div className="text-center py-20 font-bold">Loading brief...</div>
        ) : brief ? (
          <div className="space-y-8">
            {/* ACTION BAR & EXPORT CONTROL */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 text-white border border-slate-800 shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center text-slate-950 font-black text-sm shrink-0">
                  K
                </div>
                <div>
                  <h1 className="font-bold text-sm text-slate-100 line-clamp-1">{brief.title}</h1>
                  <p className="text-[11px] text-slate-400 font-medium truncate">
                    {brief.source?.channelTitle || 'YouTube Video'} • {brief.contentType || 'Video Analysis'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap shrink-0">
                {activeTab === 'brief' && (
                  <button
                    onClick={handleDownloadPng}
                    className="flex items-center gap-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 px-3.5 py-2 rounded-lg transition shadow"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Brief PNG</span>
                  </button>
                )}

                <button
                  onClick={handleCopyShareLink}
                  className="flex items-center gap-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-lg border border-slate-700 transition"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Link Copied!' : 'Share Link'}</span>
                </button>
              </div>
            </div>

            {/* FORMAT SELECTION TABS */}
            <div className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto w-full">
              <button
                onClick={() => setActiveTab('brief')}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-extrabold transition whitespace-nowrap ${
                  activeTab === 'brief'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Visual Brief</span>
              </button>

              <button
                onClick={() => setActiveTab('carousel')}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-extrabold transition whitespace-nowrap ${
                  activeTab === 'carousel'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Carousel</span>
              </button>

              <button
                onClick={() => setActiveTab('pdf')}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-extrabold transition whitespace-nowrap ${
                  activeTab === 'pdf'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>PDF Summary</span>
              </button>
            </div>

            {/* ACTIVE FORMAT PREVIEW CONTAINER */}
            <div>
              {activeTab === 'brief' && <VisualBrief data={brief} id="public-brief-view" />}
              {activeTab === 'carousel' && <CarouselRender data={brief} />}
              {activeTab === 'pdf' && <PdfRender data={brief} />}
            </div>

            {/* BOTTOM VIRAL CTA BAR */}
            <div className="p-8 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-950 text-white text-center space-y-4 shadow-xl border border-slate-800">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Turn long videos into visuals worth sharing</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold">
                Want to transform another YouTube video?
              </h2>
              <p className="text-sm text-slate-300 max-w-xl mx-auto">
                Paste any supported YouTube URL (up to 30 minutes) and get a 1-page visual brief, LinkedIn/X carousel, and PDF summary in minutes.
              </p>
              <div>
                <Link
                  href="/app"
                  className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-6 py-3.5 rounded-xl text-sm transition shadow-lg"
                >
                  <span>Create your own brief now</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto p-8 rounded-2xl bg-white dark:bg-slate-900 text-center space-y-4 border border-slate-200 dark:border-slate-800">
            <h3 className="font-bold text-lg">Brief Not Found or Access Denied</h3>
            <p className="text-sm text-slate-500">
              This visual brief may have expired, been deleted, or belongs to another user account.
            </p>
            <Link
              href="/app"
              className="inline-flex items-center gap-2 bg-amber-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs"
            >
              <Home className="w-4 h-4" />
              <span>Go to KWIP Generator</span>
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
