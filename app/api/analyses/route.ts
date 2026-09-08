import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getUserAnalyses } from '@/lib/analyses';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: 'Authentication required.',
          code: 'UNAUTHENTICATED',
        },
        { status: 401 }
      );
    }

    const userBriefs = await getUserAnalyses(user.id);
    return NextResponse.json({ success: true, data: userBriefs });
  } catch (error: any) {
    console.error('API /api/analyses error:', error.message || error);
    return NextResponse.json(
      { error: 'Failed to fetch user library', code: 'LIBRARY_FETCH_FAILED' },
      { status: 500 }
    );
  }
}
