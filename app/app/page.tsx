'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { HeaderNav } from '@/components/dashboard/HeaderNav';
import { ProgressState } from '@/components/dashboard/ProgressState';
import { VisualBrief } from '@/components/brief/VisualBrief';
import { CarouselRender } from '@/components/carousel/CarouselRender';
import { PdfRender } from '@/components/pdf/PdfRender';
import { KwipAnalysisResult, TemplateStyle, OutputFormat } from '@/types/kwip';
import { isValidYoutubeUrl } from '@/lib/youtube';
import { saveBrief } from '@/lib/storage';
import { downloadElementAsPng } from '@/lib/export';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { YoutubeIcon } from '@/components/ui/YoutubeIcon';
import {
  ArrowRight,
  FileText,
  Layers,
  Download,
  Share2,
  AlertTriangle,
  RefreshCw,
  Check,
  Sparkles,
  Zap,
  Lock,
  Info,
} from 'lucide-react';

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = createClient();

  const initialUrl = searchParams.get('url') || '';

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<{ full_name?: string; plan?: string } | null>(null);
  const [usageCount, setUsageCount] = useState<number>(0);
  const [youtubeUrl, setYoutubeUrl] = useState(initialUrl);
  const [style, setStyle] = useState<TemplateStyle>('editorial');
  const [selectedFormats, setSelectedFormats] = useState<OutputFormat[]>(['brief', 'carousel', 'pdf']);
  const [isLoading, setIsLoading] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<{ message: string; code?: string } | null>(null);
  const [resultData, setResultData] = useState<KwipAnalysisResult | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<OutputFormat>('brief');
  const [copiedLink, setCopiedLink] = useState(false);

  // Stable references to prevent duplicate requests across re-renders and React Strict Mode
  const activeRequestIdRef = useRef<string | null>(null);
  const autoAnalyzedUrlRef = useRef<string | null>(null);

  // 1. Authenticate user & load profile/usage
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      if (!currentUser) {
        const loginTarget = initialUrl
          ? `/login?next=/app&url=${encodeURIComponent(initialUrl)}`
          : '/login?next=/app';
        router.push(loginTarget);
        return;
      }

      setUser(currentUser);

      // Load profile
      supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single()
        .then(({ data }) => {
          if (data) setProfile(data);
        });

      // Load authoritative monthly usage count from server
      fetch('/api/user/quota')
        .then((res) => res.json())
        .then((data) => {
          if (data && data.success && typeof data.usageCount === 'number') {
            setUsageCount(data.usageCount);
          }
        })
        .catch((err) => console.warn('Failed to fetch quota:', err));

      // Check default saved template preference
      const savedTemplate = localStorage.getItem('kwip_default_template') as TemplateStyle;
      if (savedTemplate) {
        setStyle(savedTemplate);
      }
    });
  }, [supabase, router, initialUrl]);

  const handleAnalyze = useCallback(async (urlToProcess: string) => {
    const trimmedUrl = urlToProcess.trim();
    if (!trimmedUrl) {
      setErrorInfo({ message: 'Please enter a valid YouTube URL.', code: 'INVALID_YOUTUBE_URL' });
      return;
    }

    if (!isValidYoutubeUrl(trimmedUrl)) {
      setErrorInfo({
        message: 'That doesn\'t look like a valid YouTube link (e.g. youtube.com/watch?v=... or youtu.be/...)',
        code: 'INVALID_YOUTUBE_URL',
      });
      return;
    }

    // PREVENT DUPLICATE REQUESTS IF AN ANALYSIS IS ALREADY IN PROGRESS
    if (activeRequestIdRef.current !== null) {
      console.warn('[Analyze API] Request already in progress, ignoring duplicate trigger.');
      return;
    }

    const newRequestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    activeRequestIdRef.current = newRequestId;
    setActiveRequestId(newRequestId);

    setIsLoading(true);
    setErrorInfo(null);
    setResultData(null);

    const controller = new AbortController();
    const timeoutMs = 300000; // 5 minutes safe frontend timeout
    const timeoutId = setTimeout(() => {
      try {
        controller.abort(new Error('TIMEOUT'));
      } catch {
        controller.abort();
      }
    }, timeoutMs);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          url: trimmedUrl,
          style,
          formats: selectedFormats,
        }),
      });

      clearTimeout(timeoutId);
      const json = await res.json();

      if (!res.ok || !json.success) {
        setErrorInfo({
          message: json.error || 'Failed to process YouTube video.',
          code: json.code,
        });
        activeRequestIdRef.current = null;
        setIsLoading(false);

        // Refresh usage count from server
        fetch('/api/user/quota')
          .then((res) => res.json())
          .then((data) => {
            if (data && data.success && typeof data.usageCount === 'number') {
              setUsageCount(data.usageCount);
            }
          })
          .catch(() => {});
        return;
      }

      setResultData(json.data);
      if (user) {
        saveBrief(json.data, user.id);
      }
      activeRequestIdRef.current = null;
      setIsLoading(false);

      // Update usage count from server response
      if (typeof json.usageCount === 'number') {
        setUsageCount(json.usageCount);
      } else {
        fetch('/api/user/quota')
          .then((res) => res.json())
          .then((data) => {
            if (data && data.success && typeof data.usageCount === 'number') {
              setUsageCount(data.usageCount);
            }
          })
          .catch(() => {});
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.warn('[Analyze API Frontend Catch]:', err?.message || err);

      const isAbort =
        err?.name === 'AbortError' ||
        err?.message?.includes('aborted') ||
        err?.message === 'TIMEOUT' ||
        controller.signal.aborted;

      const userFriendlyMessage = isAbort
        ? 'Analysis is taking longer than expected. Please try again or test a shorter video segment.'
        : err?.message || 'Network error occurred. Please check your connection and try again.';

      setErrorInfo({
        message: userFriendlyMessage,
        code: isAbort ? 'TIMEOUT' : 'ANALYSIS_FAILED',
      });
      activeRequestIdRef.current = null;
      setIsLoading(false);
    }
  }, [style, selectedFormats, user]);

  // 2. Auto-run analysis if URL passed in search params (Guarded against duplicate calls)
  useEffect(() => {
    if (
      user &&
      initialUrl &&
      isValidYoutubeUrl(initialUrl) &&
      !resultData &&
      !isLoading &&
      activeRequestIdRef.current === null &&
      autoAnalyzedUrlRef.current !== initialUrl
    ) {
      autoAnalyzedUrlRef.current = initialUrl;
      handleAnalyze(initialUrl);
    }
  }, [user, initialUrl, resultData, isLoading, handleAnalyze]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || activeRequestIdRef.current !== null) return;
    handleAnalyze(youtubeUrl);
  };


  const handleFormatToggle = (format: OutputFormat) => {
    if (selectedFormats.includes(format)) {
      if (selectedFormats.length === 1) return;
      setSelectedFormats(selectedFormats.filter((f) => f !== format));
    } else {
      setSelectedFormats([...selectedFormats, format]);
    }
  };

  const handleCopyShareLink = () => {
    if (!resultData) return;
    const shareUrl = `${window.location.origin}/brief/${resultData.id}`;
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleDownloadPng = async () => {
    if (!resultData) return;
    await downloadElementAsPng('visual-brief-container', `${resultData.id}_visual_brief`);
  };

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'there';
  const planName = profile?.plan === 'pro' ? 'Pro' : 'Free';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans">
      <HeaderNav />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* DASHBOARD HEADER & USAGE METER BAR */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Good to see you, {displayName}.
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
              Transform long YouTube videos into shareable visual briefs, carousels, and PDFs.
            </p>
          </div>

          <div className="w-full sm:w-auto flex items-center gap-4 bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            {planName === 'Pro' ? (
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-300 text-xs font-black uppercase tracking-wider">
                  PRO
                </span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Unlimited Analyses
                </span>
              </div>
            ) : (
              <div className="space-y-1 w-full sm:w-48">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-600 dark:text-slate-400">Free Monthly Quota</span>
                  <span className="text-slate-900 dark:text-slate-100">{usageCount} of 2 Used</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      usageCount >= 2 ? 'bg-red-500' : 'bg-amber-500'
                    }`}
                    style={{ width: `${Math.min((usageCount / 2) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* TOP CREATE FORM (IF NOT LOADING) */}
        {!isLoading && (
          <div className="bg-white dark:bg-slate-900 p-4 sm:p-8 lg:p-10 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg space-y-6">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 block mb-1">
                Visual Knowledge Engine
              </span>
              <h2 className="text-xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                What do you want to understand?
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
                  <div className="relative flex-1 min-w-0">
                    <YoutubeIcon className="w-5 h-5 text-red-500 absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 shrink-0" />
                    <input
                      type="text"
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      placeholder="Paste YouTube link (e.g. youtube.com/watch?v=...)"
                      className="w-full pl-11 sm:pl-12 pr-4 py-3 sm:py-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium truncate"
                    />
                  </div>

                  <button
                    type="submit"
                    className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl transition shadow-md whitespace-nowrap text-xs sm:text-sm shrink-0"
                  >
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>Create with KWIP</span>
                  </button>
                </div>

                {/* INFORMATIONAL DURATION NOTE */}
                <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 mt-2.5 px-0.5">
                  <Info className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                  <span>Currently, KWIP supports YouTube videos up to 30 minutes.</span>
                </div>
              </div>

              {/* ADVANCED SETTINGS ROW */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                {/* OUTPUT STYLE */}
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
                    Output Style & Palette
                  </label>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                    {(['editorial', 'minimal', 'bold', 'academic', 'dark'] as TemplateStyle[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setStyle(s)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition ${
                          style === s
                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* OUTPUT FORMATS */}
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">
                    Output Formats
                  </label>
                  <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedFormats.includes('brief')}
                        onChange={() => handleFormatToggle('brief')}
                        className="rounded text-amber-500 focus:ring-amber-400 w-4 h-4"
                      />
                      <span>Visual Brief</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedFormats.includes('carousel')}
                        onChange={() => handleFormatToggle('carousel')}
                        className="rounded text-amber-500 focus:ring-amber-400 w-4 h-4"
                      />
                      <span>Carousel</span>
                    </label>

                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedFormats.includes('pdf')}
                        onChange={() => handleFormatToggle('pdf')}
                        className="rounded text-amber-500 focus:ring-amber-400 w-4 h-4"
                      />
                      <span>PDF</span>
                    </label>
                  </div>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* LOADING ANIMATED PROGRESS STATE */}
        {isLoading && <ProgressState requestId={activeRequestId} />}


        {/* ERROR HANDLING UI CARDS */}
        {errorInfo && !isLoading && (
          <div className="max-w-xl mx-auto p-6 sm:p-8 rounded-2xl bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900/50 shadow-xl text-center space-y-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 flex items-center justify-center mx-auto">
              {errorInfo.code === 'USER_LIMIT_REACHED' ? <Lock className="w-6 h-6 sm:w-7 sm:h-7" /> : <AlertTriangle className="w-6 h-6 sm:w-7 sm:h-7" />}
            </div>

            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
              {errorInfo.code === 'USER_LIMIT_REACHED'
                ? "You've reached your monthly free limit"
                : errorInfo.code === 'UPSTREAM_RATE_LIMIT' || errorInfo.code === 'AI_ALL_PROVIDERS_FAILED' || errorInfo.code === 'AI_INVALID_OUTPUT'
                ? 'KWIP is temporarily at capacity'
                : errorInfo.code === 'INVALID_YOUTUBE_URL'
                ? "That doesn't look like a valid YouTube link"
                : errorInfo.code === 'TRANSCRIPT_UNAVAILABLE'
                ? "We couldn't access a transcript for this video"
                : errorInfo.code === 'TRANSCRIPT_TOO_SHORT'
                ? 'Transcript Too Short'
                : errorInfo.code === 'VIDEO_TOO_LONG'
                ? 'Video Exceeds 30-Minute Limit'
                : errorInfo.code === 'UNAUTHENTICATED'
                ? 'Sign In Required'
                : errorInfo.code === 'DATABASE_ERROR'
                ? 'Database Processing Notice'
                : 'Processing Notice'}
            </h3>

            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-md mx-auto font-medium">
              {errorInfo.message}
            </p>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-center gap-3 flex-wrap">
              {errorInfo.code === 'USER_LIMIT_REACHED' ? (
                <Link
                  href="/pricing"
                  className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-extrabold px-6 py-3 rounded-xl text-xs shadow hover:opacity-90 transition w-full sm:w-auto"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Upgrade to Pro — $15/month</span>
                </Link>
              ) : (
                <button
                  onClick={() => {
                    setErrorInfo(null);
                    setYoutubeUrl('');
                  }}
                  className="inline-flex items-center justify-center gap-2 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold px-5 py-2.5 rounded-xl text-xs hover:opacity-90 transition w-full sm:w-auto"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Try Another Video</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* GENERATED RESULT DISPLAY CONTAINER */}
        {resultData && !isLoading && (
          <div className="space-y-6 sm:space-y-8">
            {/* SUCCESS BANNER & BAR */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
              <div className="flex items-center gap-3">
                <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping shrink-0" />
                <span className="font-bold text-xs sm:text-sm text-emerald-900 dark:text-emerald-300">
                  Your KWIP is ready!
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap justify-end">
                <button
                  onClick={handleDownloadPng}
                  className="flex items-center gap-1.5 text-xs font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-3.5 py-2 rounded-lg hover:opacity-90 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Brief PNG</span>
                </button>

                <button
                  onClick={handleCopyShareLink}
                  className="flex items-center gap-1.5 text-xs font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition"
                >
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>{copiedLink ? 'Link Copied!' : 'Share Link'}</span>
                </button>
              </div>
            </div>

            {/* TAB SELECTOR FOR OUTPUT ASSETS */}
            <div className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 overflow-x-auto w-full">
              <button
                onClick={() => setActiveResultTab('brief')}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-extrabold transition whitespace-nowrap ${
                  activeResultTab === 'brief'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Visual Brief</span>
              </button>

              <button
                onClick={() => setActiveResultTab('carousel')}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-extrabold transition whitespace-nowrap ${
                  activeResultTab === 'carousel'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Carousel</span>
              </button>

              <button
                onClick={() => setActiveResultTab('pdf')}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs font-extrabold transition whitespace-nowrap ${
                  activeResultTab === 'pdf'
                    ? 'bg-amber-500 text-slate-950 shadow'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>PDF Summary</span>
              </button>
            </div>


            {/* ACTIVE TAB RESULT VIEW */}
            <div>
              {activeResultTab === 'brief' && <VisualBrief data={resultData} id="visual-brief-container" />}
              {activeResultTab === 'carousel' && <CarouselRender data={resultData} />}
              {activeResultTab === 'pdf' && <PdfRender data={resultData} />}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center font-bold">Loading KWIP Dashboard...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
