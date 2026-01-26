/**
 * Shared URL utilities
 * Used by background script and sidepanel
 */

/**
 * Domains that require www. prefix due to redirect issues
 */
const DOMAINS_REQUIRING_WWW = ['heyjom.com'];

/**
 * Normalize URL for comparison (strips protocol, www, query params, fragment, trailing slash)
 * Special handling for domains with redirect issues that require www.
 * @param {string} url - URL to normalize
 * @returns {string} Normalized URL (hostname + path)
 */
export function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    let hostname = parsed.hostname.toLowerCase();

    // Some domains require www. - add it if missing
    if (DOMAINS_REQUIRING_WWW.includes(hostname)) {
      hostname = 'www.' + hostname;
    }

    // Strip www. for normalization
    let normalized = hostname.replace(/^www\./, '');
    normalized += parsed.pathname.replace(/\/$/, '');
    return normalized.toLowerCase();
  } catch (e) {
    return url.toLowerCase();
  }
}

/**
 * Extract domain from URL
 * @param {string} url - Full URL
 * @returns {string} Domain/hostname
 */
export function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
