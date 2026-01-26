/**
 * EventAtlas Capture - Utility Functions
 *
 * Common utility functions used throughout the sidepanel.
 */

// Re-export shared URL utilities
export { normalizeUrl, getDomain, fixUrl, hostsAreRelated, urlsMatchFlexible } from '@/utils/url';

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Escape special regex characters in a string
 */
export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Generate unique ID
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/**
 * Freshness level for data age indicators
 */
export type FreshnessLevel = 'fresh' | 'stale' | 'old';

/**
 * Get freshness level based on timestamp
 * - fresh (green): < 1 hour
 * - stale (yellow): 1-24 hours
 * - old (red): > 24 hours
 */
export function getFreshnessLevel(timestamp: string | null | undefined): FreshnessLevel {
  if (!timestamp) return 'old';

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'old';

  const ageMs = Date.now() - date.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);

  if (ageHours < 1) return 'fresh';
  if (ageHours < 24) return 'stale';
  return 'old';
}

/**
 * Format relative time (e.g., "5 min", "2 hours", "3 days")
 */
export function formatRelativeTime(timestamp: string | null | undefined): string {
  if (!timestamp) return 'never';

  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return 'unknown';

  const ageMs = Date.now() - date.getTime();
  const ageSeconds = Math.floor(ageMs / 1000);
  const ageMinutes = Math.floor(ageSeconds / 60);
  const ageHours = Math.floor(ageMinutes / 60);
  const ageDays = Math.floor(ageHours / 24);

  if (ageSeconds < 60) return 'just now';
  if (ageMinutes < 60) return `${ageMinutes} min`;
  if (ageHours < 24) return `${ageHours} hr${ageHours > 1 ? 's' : ''}`;
  return `${ageDays} day${ageDays > 1 ? 's' : ''}`;
}
