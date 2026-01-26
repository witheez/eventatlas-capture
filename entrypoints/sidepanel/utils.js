/**
 * EventAtlas Capture - Utility Functions
 *
 * Common utility functions used throughout the sidepanel.
 */

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Extract domain from URL
 */
export function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Normalize URL for comparison (strips protocol, www, query params, fragment, trailing slash)
 * Special case: heyjom.com requires www. prefix due to their redirect issues
 */
export function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    let hostname = parsed.hostname.toLowerCase();

    // heyjom.com requires www. - add it if missing
    if (hostname === 'heyjom.com') {
      hostname = 'www.heyjom.com';
    }

    // Strip www. for normalization (except heyjom.com which we just fixed)
    let normalized = hostname.replace(/^www\./, '');
    normalized += parsed.pathname.replace(/\/$/, '');
    return normalized.toLowerCase();
  } catch (e) {
    return url.toLowerCase();
  }
}

/**
 * Escape special regex characters in a string
 */
export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Generate unique ID
 */
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}
