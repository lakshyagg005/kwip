import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchYoutubeTranscript, isValidYoutubeUrl, extractYoutubeVideoId } from '@/lib/youtube';
import { generateAIAnalysis } from '@/lib/ai';
import { buildCacheKey, runSingleFlight } from '@/lib/cache';
import { checkIpRateLimit } from '@/lib/rate-limit';
import { reserveQuota, refundQuota } from '@/lib/quota';
import { saveAnalysisServer } from '@/lib/analyses';

export async function POST(req: NextRequest) {
  let userId: string | null = null;
  let quotaReserved = false;

  try {
    // 1. Authenticate User via Supabase Server Client
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: 'Authentication required. Please sign in to analyze YouTube videos.',
          code: 'UNAUTHENTICATED',
        },
        { status: 401 }
      );
    }

    userId = user.id;

    // 2. Parse Request Body & Validate YouTube URL FIRST
    const body = await req.json().catch(() => ({}));
    const { url, style = 'editorial', formats = ['brief', 'carousel', 'pdf'] } = body;

    if (!url || typeof url !== 'string' || !url.trim()) {
      return NextResponse.json(
        { error: 'Please enter a valid YouTube URL.', code: 'INVALID_YOUTUBE_URL' },
        { status: 400 }
      );
    }

    const videoId = extractYoutubeVideoId(url);
    if (!videoId || !isValidYoutubeUrl(url)) {
      return NextResponse.json(
        { error: 'Please enter a valid YouTube URL (e.g. youtube.com/watch?v=... or youtu.be/...)', code: 'INVALID_YOUTUBE_URL' },
        { status: 400 }
      );
    }

    // 3. Check IP Rate Limit for Abuse Protection
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const rateLimit = checkIpRateLimit(ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'KWIP is temporarily at capacity due to high volume. Please try again in a few minutes.',
          code: 'UPSTREAM_RATE_LIMIT',
        },
        { status: 429 }
      );
    }

    // 4. Fetch User Profile & Determine Plan ('free' vs 'pro')
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    const plan = (profile?.plan as 'free' | 'pro') || 'free';

    // 5. Atomically Reserve Quota on the Server
    const quota = await reserveQuota(user.id, plan);

    if (!quota.success) {
      return NextResponse.json(
        {
          error: quota.error || "You've used both free analyses for this month. Upgrade to KWIP Pro for unlimited analyses.",
          code: 'USER_LIMIT_REACHED',
          usageCount: quota.usageCount,
          limit: quota.limit,
          remaining: 0,
          nextResetAt: quota.nextResetAt,
        },
        { status: 403 }
      );
    }

    quotaReserved = true;

    // 6. Execute AI Pipeline (Single-Flight Caching)
    const cacheKey = buildCacheKey(videoId, style);

    const result = await runSingleFlight(cacheKey, async () => {
      let youtubeData;
      try {
        youtubeData = await fetchYoutubeTranscript(url);
      } catch (transcriptError: any) {
        const isMissingTranscript = transcriptError.message?.includes('TRANSCRIPT_UNAVAILABLE');
        const isTooLong = transcriptError.message?.includes('VIDEO_TOO_LONG');
        const userMsg = isTooLong
          ? 'KWIP currently supports videos up to 30 minutes.'
          : isMissingTranscript
          ? "We couldn't access a transcript for this video. KWIP currently needs an available YouTube transcript or captions to understand the video."
          : transcriptError.message || 'Failed to retrieve YouTube transcript.';

        const err = new Error(userMsg);
        (err as any).code = isTooLong ? 'VIDEO_TOO_LONG' : isMissingTranscript ? 'TRANSCRIPT_UNAVAILABLE' : 'TRANSCRIPT_ERROR';
        (err as any).statusCode = isTooLong ? 400 : 422;
        throw err;
      }

      return generateAIAnalysis(
        youtubeData.rawTranscript,
        youtubeData.metadata,
        style,
        formats
      );
    });

    // 7. Save Analysis to Server & Supabase Database for User Library (Strict User Scoping)
    await saveAnalysisServer(user.id, result, url.trim(), videoId, style, formats);

    return NextResponse.json({
      success: true,
      data: result,
      usageCount: quota.usageCount,
      limit: quota.limit,
      remaining: quota.remaining,
      nextResetAt: quota.nextResetAt,
      cached: false,
    });
  } catch (error: any) {
    console.error('API /api/analyze error:', error.message || error);

    // Refund reserved quota if generation failed
    if (userId && quotaReserved) {
      try {
        await refundQuota(userId);
      } catch (refundErr) {
        console.error('[Analyze API] Quota refund error:', refundErr);
      }
    }

    const statusCode = error.statusCode || 500;
    const errorCode = error.code || (error.message?.includes('AI_ALL_PROVIDERS_FAILED') ? 'UPSTREAM_RATE_LIMIT' : 'ANALYSIS_FAILED');

    const userFriendlyMessage = error.message?.includes('AI_ALL_PROVIDERS_FAILED')
      ? 'KWIP is temporarily at capacity. Please try again in a few moments.'
      : error.message || 'An unexpected error occurred during processing. Please try again.';

    return NextResponse.json(
      {
        error: userFriendlyMessage,
        code: errorCode,
      },
      { status: statusCode }
    );
  }
}
