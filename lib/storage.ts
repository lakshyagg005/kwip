import { KwipAnalysisResult } from '@/types/kwip';

const LEGACY_STORAGE_KEY = 'kwip_saved_briefs';

export function clearLegacyStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Ignore
  }
}

function getUserKey(userId?: string): string | null {
  if (!userId) return null;
  return `kwip_saved_briefs_${userId}`;
}

export function getSavedBriefs(userId?: string): KwipAnalysisResult[] {
  if (typeof window === 'undefined') return [];
  clearLegacyStorage();
  const key = getUserKey(userId);
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read briefs from localStorage:', err);
    return [];
  }
}

export function getBriefById(id: string, userId?: string): KwipAnalysisResult | null {
  const all = getSavedBriefs(userId);
  return all.find((b) => b.id === id) || null;
}

export function saveBrief(brief: KwipAnalysisResult, userId?: string): void {
  if (typeof window === 'undefined') return;
  clearLegacyStorage();
  const key = getUserKey(userId);
  if (!key) return;
  try {
    const all = getSavedBriefs(userId);
    const existingIndex = all.findIndex((b) => b.id === brief.id);
    if (existingIndex >= 0) {
      all[existingIndex] = brief;
    } else {
      all.unshift(brief);
    }
    localStorage.setItem(key, JSON.stringify(all));
  } catch (err) {
    console.error('Failed to save brief to localStorage:', err);
  }
}

export function deleteBrief(id: string, userId?: string): void {
  if (typeof window === 'undefined') return;
  clearLegacyStorage();
  const key = getUserKey(userId);
  if (!key) return;
  try {
    const all = getSavedBriefs(userId);
    const filtered = all.filter((b) => b.id !== id);
    localStorage.setItem(key, JSON.stringify(filtered));
  } catch (err) {
    console.error('Failed to delete brief from localStorage:', err);
  }
}
