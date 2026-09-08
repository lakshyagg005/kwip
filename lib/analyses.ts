import { createServerSupabaseClient, getSupabaseAdminClient } from './supabase/server';
import { KwipAnalysisResult } from '@/types/kwip';

export interface StoredAnalysisRecord {
  id: string;
  userId: string;
  content: KwipAnalysisResult;
  createdAt: string;
}

// In-memory fallback cache for serverless execution context
const inMemoryAnalysesStore: Record<string, StoredAnalysisRecord> = {};

export function readAllAnalysesStore(): Record<string, StoredAnalysisRecord> {
  return { ...inMemoryAnalysesStore };
}

export function writeAllAnalysesStore(store: Record<string, StoredAnalysisRecord>): void {
  Object.assign(inMemoryAnalysesStore, store);
}

/**
 * Helper to map Supabase database row to KwipAnalysisResult object
 */
function mapRowToAnalysisResult(row: any): KwipAnalysisResult {
  const content = row.content || {};
  return {
    id: row.id,
    title: row.title || content.title || 'Untitled Visual Brief',
    hook: content.hook || '',
    executiveSummary: content.executiveSummary || '',
    finalTakeaway: content.finalTakeaway || '',
    keyIdeas: content.keyIdeas || [],
    framework: content.framework,
    statistics: content.statistics || [],
    quotes: content.quotes || [],
    actionSteps: content.actionSteps || [],
    style: row.template || content.style || 'editorial',
    selectedFormats: row.output_types || content.selectedFormats || ['brief', 'carousel', 'pdf'],
    source: {
      videoId: row.youtube_video_id || content.source?.videoId || '',
      videoTitle: row.title || content.source?.videoTitle || 'YouTube Video',
      channelTitle: content.source?.channelTitle || 'YouTube Video',
      videoUrl: row.youtube_url || content.source?.videoUrl || '',
      thumbnailUrl: row.thumbnail_url || content.source?.thumbnailUrl || '',
    },
    createdAt: row.created_at || content.createdAt || new Date().toISOString(),
    contentType: content.contentType || 'Podcast',
  };
}

/**
 * Fetch all analyses belonging strictly to the authenticated user from Supabase.
 */
export async function getUserAnalyses(userId: string): Promise<KwipAnalysisResult[]> {
  if (!userId) return [];

  let dbResults: KwipAnalysisResult[] = [];

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data && Array.isArray(data)) {
      dbResults = data.map(mapRowToAnalysisResult);
    } else {
      // Try admin client if server client returned no data or error
      const adminClient = getSupabaseAdminClient();
      const { data: adminData } = await adminClient
        .from('analyses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (adminData && Array.isArray(adminData)) {
        dbResults = adminData.map(mapRowToAnalysisResult);
      }
    }
  } catch {
    // Fallback to admin client or in-memory store
    try {
      const adminClient = getSupabaseAdminClient();
      const { data: adminData } = await adminClient
        .from('analyses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (adminData && Array.isArray(adminData)) {
        dbResults = adminData.map(mapRowToAnalysisResult);
      }
    } catch {
      // Ignore
    }
  }

  // Merge in-memory fallback items strictly for this user
  const fileResults: KwipAnalysisResult[] = [];
  for (const item of Object.values(inMemoryAnalysesStore)) {
    if (item.userId === userId) {
      fileResults.push(item.content);
    }
  }

  const map = new Map<string, KwipAnalysisResult>();
  dbResults.forEach((b) => map.set(b.id, b));
  fileResults.forEach((b) => {
    if (!map.has(b.id)) {
      map.set(b.id, b);
    }
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );
}

/**
 * Fetch a single analysis by ID for public share links (/brief/[id]).
 */
export async function getPublicAnalysisById(
  analysisId: string
): Promise<KwipAnalysisResult | null> {
  if (!analysisId) return null;

  // Check in-memory store first
  const cached = inMemoryAnalysesStore[analysisId];
  if (cached && cached.content) {
    return cached.content;
  }

  try {
    const adminClient = getSupabaseAdminClient();
    const { data, error } = await adminClient
      .from('analyses')
      .select('*')
      .eq('id', analysisId)
      .single();

    if (!error && data) {
      const result = mapRowToAnalysisResult(data);
      inMemoryAnalysesStore[analysisId] = {
        id: analysisId,
        userId: data.user_id,
        content: result,
        createdAt: data.created_at,
      };
      return result;
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Fetch a single analysis by ID, strictly enforcing user ownership (IDOR protection).
 */
export async function getAnalysisById(
  userId: string,
  analysisId: string
): Promise<KwipAnalysisResult | null> {
  if (!userId || !analysisId) return null;

  // Check in-memory store first
  const cached = inMemoryAnalysesStore[analysisId];
  if (cached) {
    if (cached.userId !== userId) {
      return null; // IDOR Protection: Access denied
    }
    return cached.content;
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('analyses')
      .select('*')
      .eq('id', analysisId)
      .eq('user_id', userId)
      .single();

    if (!error && data) {
      const result = mapRowToAnalysisResult(data);
      inMemoryAnalysesStore[analysisId] = {
        id: analysisId,
        userId: data.user_id,
        content: result,
        createdAt: data.created_at,
      };
      return result;
    }
  } catch {
    // Try admin client
    try {
      const adminClient = getSupabaseAdminClient();
      const { data, error } = await adminClient
        .from('analyses')
        .select('*')
        .eq('id', analysisId)
        .eq('user_id', userId)
        .single();

      if (!error && data) {
        const result = mapRowToAnalysisResult(data);
        inMemoryAnalysesStore[analysisId] = {
          id: analysisId,
          userId: data.user_id,
          content: result,
          createdAt: data.created_at,
        };
        return result;
      }
    } catch {
      // Ignore
    }
  }

  return null;
}

/**
 * Save an analysis belonging to a specific user server-side in Supabase.
 */
export async function saveAnalysisServer(
  userId: string,
  analysis: KwipAnalysisResult,
  youtubeUrl: string,
  videoId: string,
  style: string,
  formats: string[]
): Promise<void> {
  if (!userId || !analysis || !analysis.id) return;

  const now = new Date().toISOString();
  const createdAt = analysis.createdAt || now;
  const analysisRecord: KwipAnalysisResult = {
    ...analysis,
    createdAt,
  };

  // Sync to in-memory store
  inMemoryAnalysesStore[analysis.id] = {
    id: analysis.id,
    userId,
    content: analysisRecord,
    createdAt,
  };

  // Persist to Supabase analyses table with user_id = userId
  try {
    const adminClient = getSupabaseAdminClient();
    await adminClient.from('analyses').upsert({
      id: analysis.id,
      user_id: userId,
      youtube_url: youtubeUrl,
      youtube_video_id: videoId,
      title: analysis.title || 'Untitled Visual Brief',
      thumbnail_url: analysis.source?.thumbnailUrl || '',
      content: analysisRecord,
      output_types: formats,
      template: style,
      created_at: createdAt,
    });
  } catch (err: any) {
    console.error('[SaveAnalysisServer Supabase Error]:', err.message || err);
  }
}

/**
 * Delete an analysis belonging to a specific user (verifies ownership).
 */
export async function deleteAnalysisServer(
  userId: string,
  analysisId: string
): Promise<boolean> {
  if (!userId || !analysisId) return false;

  const cached = inMemoryAnalysesStore[analysisId];
  if (cached) {
    if (cached.userId !== userId) {
      return false; // Cannot delete another user's content!
    }
    delete inMemoryAnalysesStore[analysisId];
  }

  try {
    const adminClient = getSupabaseAdminClient();
    await adminClient
      .from('analyses')
      .delete()
      .eq('id', analysisId)
      .eq('user_id', userId);
  } catch (err: any) {
    console.error('[DeleteAnalysisServer Supabase Error]:', err.message || err);
  }

  return true;
}
