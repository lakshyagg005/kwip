import fs from 'fs';
import path from 'path';
import { createServerSupabaseClient } from './supabase/server';
import { KwipAnalysisResult } from '@/types/kwip';

export interface StoredAnalysisRecord {
  id: string;
  userId: string;
  content: KwipAnalysisResult;
  createdAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const ANALYSES_FILE = path.resolve(DATA_DIR, 'analyses-store.json');

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch {
    // Ignore read-only filesystem on Vercel
  }
}

export function readAllAnalysesStore(): Record<string, StoredAnalysisRecord> {
  ensureDataDir();
  try {
    if (!fs.existsSync(ANALYSES_FILE)) {
      return {};
    }
    const raw = fs.readFileSync(ANALYSES_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

export function writeAllAnalysesStore(store: Record<string, StoredAnalysisRecord>): void {
  ensureDataDir();
  try {
    fs.writeFileSync(ANALYSES_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    // Ignore read-only filesystem on Vercel
  }
}

/**
 * Fetch all analyses belonging strictly to the authenticated user.
 */
export async function getUserAnalyses(userId: string): Promise<KwipAnalysisResult[]> {
  if (!userId) return [];

  let dbResults: KwipAnalysisResult[] = [];

  // 1. Query Supabase analyses table filtering strictly by user_id
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      dbResults = data.map((row: any) => ({
        id: row.id,
        title: row.title,
        hook: row.content?.hook || '',
        executiveSummary: row.content?.executiveSummary || '',
        finalTakeaway: row.content?.finalTakeaway || '',
        keyIdeas: row.content?.keyIdeas || [],
        framework: row.content?.framework,
        statistics: row.content?.statistics || [],
        quotes: row.content?.quotes || [],
        actionSteps: row.content?.actionSteps || [],
        style: row.template || 'editorial',
        selectedFormats: row.output_types || ['brief', 'carousel', 'pdf'],
        source: {
          videoId: row.youtube_video_id,
          videoTitle: row.title,
          channelTitle: row.content?.source?.channelTitle || 'YouTube Video',
          videoUrl: row.youtube_url,
          thumbnailUrl: row.thumbnail_url,
        },
        createdAt: row.created_at,
        contentType: row.content?.contentType || 'Podcast',
      }));
    }
  } catch {
    // Ignore Supabase table missing errors
  }

  // 2. Read from persistent server store strictly filtered by userId
  const store = readAllAnalysesStore();
  const fileResults: KwipAnalysisResult[] = [];
  for (const item of Object.values(store)) {
    if (item.userId === userId) {
      fileResults.push(item.content);
    }
  }

  // Merge and deduplicate by id
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

  // Check persistent server store first
  const store = readAllAnalysesStore();
  const record = store[analysisId];
  if (record && record.content) {
    return record.content;
  }

  // Check Supabase analyses table by id
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('analyses')
      .select('*')
      .eq('id', analysisId)
      .single();

    if (!error && data) {
      return {
        id: data.id,
        title: data.title,
        hook: data.content?.hook || '',
        executiveSummary: data.content?.executiveSummary || '',
        finalTakeaway: data.content?.finalTakeaway || '',
        keyIdeas: data.content?.keyIdeas || [],
        framework: data.content?.framework,
        statistics: data.content?.statistics || [],
        quotes: data.content?.quotes || [],
        actionSteps: data.content?.actionSteps || [],
        style: data.template || 'editorial',
        selectedFormats: data.output_types || ['brief', 'carousel', 'pdf'],
        source: {
          videoId: data.youtube_video_id,
          videoTitle: data.title,
          channelTitle: data.content?.source?.channelTitle || 'YouTube Video',
          videoUrl: data.youtube_url,
          thumbnailUrl: data.thumbnail_url,
        },
        createdAt: data.created_at,
        contentType: data.content?.contentType || 'Podcast',
      };
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

  // Check persistent server store first
  const store = readAllAnalysesStore();
  const record = store[analysisId];

  if (record) {
    // IDOR Protection: Strict ownership check!
    if (record.userId !== userId) {
      return null; // Access denied
    }
    return record.content;
  }

  // Check Supabase analyses table with user_id filter
  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('analyses')
      .select('*')
      .eq('id', analysisId)
      .eq('user_id', userId)
      .single();

    if (!error && data) {
      return {
        id: data.id,
        title: data.title,
        hook: data.content?.hook || '',
        executiveSummary: data.content?.executiveSummary || '',
        finalTakeaway: data.content?.finalTakeaway || '',
        keyIdeas: data.content?.keyIdeas || [],
        framework: data.content?.framework,
        statistics: data.content?.statistics || [],
        quotes: data.content?.quotes || [],
        actionSteps: data.content?.actionSteps || [],
        style: data.template || 'editorial',
        selectedFormats: data.output_types || ['brief', 'carousel', 'pdf'],
        source: {
          videoId: data.youtube_video_id,
          videoTitle: data.title,
          channelTitle: data.content?.source?.channelTitle || 'YouTube Video',
          videoUrl: data.youtube_url,
          thumbnailUrl: data.thumbnail_url,
        },
        createdAt: data.created_at,
        contentType: data.content?.contentType || 'Podcast',
      };
    }
  } catch {
    // Ignore
  }

  return null;
}

/**
 * Save an analysis belonging to a specific user server-side.
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
  const record: StoredAnalysisRecord = {
    id: analysis.id,
    userId,
    content: {
      ...analysis,
      createdAt: analysis.createdAt || now,
    },
    createdAt: analysis.createdAt || now,
  };

  const store = readAllAnalysesStore();
  store[analysis.id] = record;
  writeAllAnalysesStore(store);

  // Sync to Supabase analyses table with user_id = userId
  try {
    const supabase = await createServerSupabaseClient();
    await supabase.from('analyses').upsert({
      id: analysis.id,
      user_id: userId,
      youtube_url: youtubeUrl,
      youtube_video_id: videoId,
      title: analysis.title,
      thumbnail_url: analysis.source?.thumbnailUrl,
      content: analysis,
      output_types: formats,
      template: style,
      created_at: record.createdAt,
    });
  } catch {
    // Ignore
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

  const store = readAllAnalysesStore();
  const record = store[analysisId];

  if (record) {
    if (record.userId !== userId) {
      return false; // Cannot delete another user's content!
    }
    delete store[analysisId];
    writeAllAnalysesStore(store);
  }

  try {
    const supabase = await createServerSupabaseClient();
    await supabase
      .from('analyses')
      .delete()
      .eq('id', analysisId)
      .eq('user_id', userId);
  } catch {
    // Ignore
  }

  return true;
}
