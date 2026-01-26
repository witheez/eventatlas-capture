/**
 * Shared URL utilities
 * Used by background script and sidepanel
 */

/**
 * Domains that require www. prefix due to redirect issues
 */
const DOMAINS_REQUIRING_WWW: string[] = ['heyjom.com'];

/**
 * Fix URL for navigation/display - adds www. where required
 * @param url - URL to fix
 * @returns Fixed URL
 */
export function fixUrl(url: string): string {
  if (!url) return url;

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Check if this domain requires www.
    if (DOMAINS_REQUIRING_WWW.includes(hostname)) {
      parsed.hostname = 'www.' + hostname;
      return parsed.toString();
    }

    return url;
  } catch {
    return url;
  }
}

/**
 * Normalize URL for comparison (strips protocol, www, query params, fragment, trailing slash)
 * @param url - URL to normalize
 * @returns Normalized URL (hostname + path)
 */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Strip www. for normalization - comparison doesn't care about www
    let normalized = parsed.hostname.toLowerCase().replace(/^www\./, '');
    normalized += parsed.pathname.replace(/\/$/, '');
    return normalized;
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Extract domain from URL
 * @param url - Full URL
 * @returns Domain/hostname
 */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
