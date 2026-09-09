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
        console.error(
          `[Analyze API Transcript Error] videoId=${videoId}, code=${transcriptError.code || 'TRANSCRIPT_ERROR'}, statusCode=${transcriptError.statusCode || 422}, message="${transcriptError.message}"`
        );
        const err = new Error(transcriptError.message || 'Failed to retrieve YouTube transcript.');
        (err as any).code = transcriptError.code || 'TRANSCRIPT_ERROR';
        (err as any).statusCode = transcriptError.statusCode || 422;
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

    let statusCode = error.statusCode;
    let errorCode = error.code;
    let userFriendlyMessage = error.message;

    if (error.code === 'YOUTUBE_IP_BLOCKED') {
      statusCode = 503;
      errorCode = 'YOUTUBE_IP_BLOCKED';
      userFriendlyMessage = 'YouTube temporarily restricted serverless access for this request. Please try again in a few moments.';
    } else if (error.message?.includes('AI_ALL_PROVIDERS_FAILED')) {
      statusCode = 503;
      errorCode = 'AI_ALL_PROVIDERS_FAILED';
      userFriendlyMessage = 'KWIP is temporarily at capacity. Please try again in a few moments.';
    } else if (error.message?.includes('PGRST') || error.message?.toLowerCase().includes('database')) {
      statusCode = 500;
      errorCode = 'DATABASE_ERROR';
      userFriendlyMessage = 'A database error occurred while processing your request. Please try again.';
    }

    if (!statusCode) {
      statusCode = errorCode === 'UNAUTHENTICATED' ? 401 : errorCode === 'USER_LIMIT_REACHED' ? 403 : errorCode === 'UPSTREAM_RATE_LIMIT' || errorCode === 'YOUTUBE_RATE_LIMITED' ? 429 : 500;
    }

    if (!errorCode) {
      errorCode = 'INTERNAL_SERVER_ERROR';
    }

    if (!userFriendlyMessage) {
      userFriendlyMessage = 'An unexpected server error occurred during processing. Please try again.';
    }

    return NextResponse.json(
      {
        error: userFriendlyMessage,
        code: errorCode,
      },
      { status: statusCode }
    );
  }
}
