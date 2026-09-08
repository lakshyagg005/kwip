import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getUserQuota } from '@/lib/quota';

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

    // Fetch user profile plan
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single();

    const plan = (profile?.plan as 'free' | 'pro') || 'free';
    const quotaStatus = await getUserQuota(user.id, plan);

    return NextResponse.json(quotaStatus);
  } catch (error: any) {
    console.error('API /api/user/quota error:', error.message || error);
    return NextResponse.json(
      { error: 'Failed to fetch user quota', code: 'QUOTA_FETCH_FAILED' },
      { status: 500 }
    );
  }
}
