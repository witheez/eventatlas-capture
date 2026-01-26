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

/**
 * Check if two hosts are related (one is a subdomain of the other).
 * Example: "kh.checkpointspot.asia" and "checkpointspot.asia" are related.
 * @param host1 - First hostname
 * @param host2 - Second hostname
 * @returns true if hosts are related
 */
export function hostsAreRelated(host1: string, host2: string): boolean {
  const h1 = host1.toLowerCase();
  const h2 = host2.toLowerCase();

  if (h1 === h2) return true;

  // Check if one is a subdomain of the other
  return h1.endsWith('.' + h2) || h2.endsWith('.' + h1);
}

/**
 * Flexible URL matching - allows subdomain variations.
 * Paths must match exactly, hosts can be subdomain-related.
 * @param url1 - First URL to compare
 * @param url2 - Second URL to compare
 * @returns true if URLs match flexibly
 */
export function urlsMatchFlexible(url1: string, url2: string): boolean {
  // First try exact normalized match (faster)
  if (normalizeUrl(url1) === normalizeUrl(url2)) {
    return true;
  }

  try {
    const parsed1 = new URL(url1);
    const parsed2 = new URL(url2);

    // Strip www. from hostnames
    const host1 = parsed1.hostname.toLowerCase().replace(/^www\./, '');
    const host2 = parsed2.hostname.toLowerCase().replace(/^www\./, '');

    // Hosts must be related
    if (!hostsAreRelated(host1, host2)) {
      return false;
    }

    // Paths must match exactly (after stripping trailing slash)
    const path1 = parsed1.pathname.replace(/\/$/, '');
    const path2 = parsed2.pathname.replace(/\/$/, '');

    return path1 === path2;
  } catch {
    return false;
  }
}
