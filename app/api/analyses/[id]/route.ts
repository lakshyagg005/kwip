import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getAnalysisById, getPublicAnalysisById, deleteAnalysisServer } from '@/lib/analyses';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let analysis = user ? await getAnalysisById(user.id, id) : null;

    // If unauthenticated or accessing shared public link, attempt public fetch
    if (!analysis) {
      analysis = await getPublicAnalysisById(id);
    }

    if (!analysis) {
      return NextResponse.json(
        {
          error: 'Visual brief not found or access denied.',
          code: 'NOT_FOUND',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: analysis });
  } catch (error: any) {
    console.error('API /api/analyses/[id] error:', error.message || error);
    return NextResponse.json(
      { error: 'Failed to fetch visual brief', code: 'BRIEF_FETCH_FAILED' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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

    const success = await deleteAnalysisServer(user.id, id);

    if (!success) {
      return NextResponse.json(
        {
          error: 'Access denied or visual brief not found.',
          code: 'FORBIDDEN',
        },
        { status: 403 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API DELETE /api/analyses/[id] error:', error.message || error);
    return NextResponse.json(
      { error: 'Failed to delete visual brief', code: 'BRIEF_DELETE_FAILED' },
      { status: 500 }
    );
  }
}
