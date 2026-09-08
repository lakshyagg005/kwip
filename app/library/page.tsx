'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { HeaderNav } from '@/components/dashboard/HeaderNav';
import { getSavedBriefs, deleteBrief } from '@/lib/storage';
import { createClient } from '@/lib/supabase/client';
import { KwipAnalysisResult } from '@/types/kwip';
import { YoutubeIcon } from '@/components/ui/YoutubeIcon';
import { Trash2, ExternalLink, Share2, PlusCircle, FileText, Loader2 } from 'lucide-react';

export default function LibraryPage() {
  const supabase = createClient();
  const [briefs, setBriefs] = useState<KwipAnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadBriefs() {
      try {
        const res = await fetch('/api/analyses');
        if (res.ok) {
          const json = await res.json();
          if (active && json.success && Array.isArray(json.data)) {
            setBriefs(json.data);
          }
        }
      } catch (err) {
        console.error('Failed to fetch user library:', err);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadBriefs();
    return () => {
      active = false;
    };
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/analyses/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to delete brief:', err);
    }
    setBriefs((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      <HeaderNav />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight">Your Visual Library</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Access and export your previously generated visual briefs and carousels.
            </p>
          </div>

          <Link
            href="/app"
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs transition shadow"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create New KWIP</span>
          </Link>
        </div>

        {loading ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <Loader2 className="w-8 h-8 text-amber-500 animate-spin mx-auto" />
            <p className="text-xs font-bold text-slate-500">Loading your knowledge library...</p>
          </div>
        ) : briefs.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-lg">No briefs in your library yet</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Paste a YouTube link in the generator to create your first visual brief!
            </p>
            <Link
              href="/app"
              className="inline-flex items-center gap-2 bg-amber-500 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs"
            >
              <span>Go to Generator</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {briefs.map((b) => (
              <div
                key={b.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-md flex flex-col justify-between"
              >
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                    <span className="font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                      {b.contentType || 'Video Analysis'}
                    </span>
                    <span>{new Date(b.createdAt).toLocaleDateString()}</span>
                  </div>

                  <h3 className="font-bold text-base line-clamp-2 text-slate-900 dark:text-slate-100">
                    {b.title}
                  </h3>

                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {b.hook}
                  </p>

                  <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 truncate">
                    <YoutubeIcon className="w-3.5 h-3.5 text-red-500 shrink-0" />
                    <span className="truncate">{b.source.channelTitle}</span>
                  </div>
                </div>

                <div className="p-4 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-xs font-semibold">
                  <Link
                    href={`/brief/${b.id}`}
                    className="flex items-center gap-1 text-slate-700 dark:text-slate-300 hover:text-amber-600 font-bold"
                  >
                    <span>View Brief</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>

                  <button
                    onClick={() => handleDelete(b.id)}
                    className="p-1.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                    title="Delete Brief"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
