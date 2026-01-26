/**
 * EventAtlas Capture - API Functions
 *
 * API-related functions for communicating with the EventAtlas backend.
 * All API calls go through the centralized apiRequest() function.
 */

import { normalizeUrl } from './utils.js';

// Storage key for sync data (must match sidepanel.js)
const SYNC_DATA_KEY = 'eventatlas_sync_data';

// =============================================================================
// API Client
// =============================================================================

/**
 * Normalize API base URL - adds protocol if missing
 * Uses http:// for localhost/127.0.0.1, https:// for everything else
 * Users can override by explicitly typing http:// or https://
 * @param {string} url - API URL (may or may not have protocol)
 * @returns {string} URL with protocol
 */
function normalizeBaseUrl(url) {
  if (!url) return url;

  // Remove trailing slashes
  url = url.replace(/\/+$/, '');

  // Already has protocol - use as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Only localhost/127.0.0.1 defaults to http (can't have real SSL)
  // Everything else (including .test) defaults to https
  const isLocalhost = url.startsWith('localhost') || url.startsWith('127.0.0.1');
  const protocol = isLocalhost ? 'http://' : 'https://';

  return protocol + url;
}

/**
 * Centralized API request function
 * All API calls should go through this function
 *
 * @param {string} endpoint - API endpoint (e.g., '/api/extension/sync')
 * @param {Object} options - Request options
 * @param {string} options.apiUrl - Base API URL
 * @param {string} options.apiToken - Bearer token
 * @param {string} [options.method='GET'] - HTTP method
 * @param {Object} [options.params] - Query parameters
 * @param {Object} [options.body] - Request body (will be JSON stringified)
 * @param {number} [options.timeout=10000] - Request timeout in ms
 * @param {AbortSignal} [options.signal] - AbortController signal
 * @returns {Promise<{ok: boolean, status: number, data: any, error?: string}>}
 */
async function apiRequest(endpoint, options) {
  const {
    apiUrl,
    apiToken,
    method = 'GET',
    params = null,
    body = null,
    timeout = 10000,
    signal = null,
  } = options;

  // Build URL
  let url = `${normalizeBaseUrl(apiUrl)}${endpoint}`;
  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  // Setup timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const fetchOptions = {
      method,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiToken}`,
      },
      signal: signal || controller.signal,
    };

    if (body) {
      fetchOptions.headers['Content-Type'] = 'application/json';
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    const data = response.ok ? await response.json() : null;

    return {
      ok: response.ok,
      status: response.status,
      data,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      return { ok: false, status: 0, data: null, error: 'Timeout' };
    }

    return { ok: false, status: 0, data: null, error: error.message };
  }
}

// =============================================================================
// API Endpoints
// =============================================================================

/**
 * Sync data from EventAtlas API (bulk sync)
 * Fetches events and organizer links for local URL matching
 * @param {Object} settings - Settings object with apiUrl, apiToken, syncMode
 * @returns {Promise<Object|null>} Sync data or null on error
 */
export async function syncWithApi(settings) {
  if (!settings.apiUrl || !settings.apiToken) return null;
  if (settings.syncMode === 'realtime_only') return null;

  const result = await apiRequest('/api/extension/sync', {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
  });

  if (!result.ok) {
    console.error('[EventAtlas] Sync error:', result.error);
    return null;
  }

  // Store sync data
  await chrome.storage.local.set({
    [SYNC_DATA_KEY]: {
      events: result.data.events || [],
      organizerLinks: result.data.organizer_links || [],
      syncedAt: result.data.synced_at,
    },
  });

  return result.data;
}

/**
 * Get local match for a URL from synced data
 * Returns match info if URL exists in events or organizer links
 * @param {string} url - URL to check
 * @returns {Promise<Object|null>} Match info or null
 */
async function getLocalMatch(url) {
  try {
    const result = await chrome.storage.local.get([SYNC_DATA_KEY]);
    const syncData = result[SYNC_DATA_KEY];

    if (!syncData) return null;

    const normalizedUrl = normalizeUrl(url);

    // Check events - API returns source_url_normalized
    const events = syncData.events || [];
    for (const event of events) {
      if (event.source_url_normalized === normalizedUrl) {
        return { match_type: 'event', event };
      }
    }

    // Check organizer links - API returns url_normalized
    const organizerLinks = syncData.organizerLinks || [];
    for (const link of organizerLinks) {
      if (link.url_normalized === normalizedUrl) {
        return { match_type: 'link_discovery', organizer_link: link };
      }
    }

    return null;
  } catch (error) {
    console.error('[EventAtlas] Local match error:', error);
    return null;
  }
}

/**
 * Lookup URL via API (real-time) or local sync data
 * Combines local and remote lookups based on sync mode
 * @param {string} url - URL to lookup
 * @param {Object} settings - Settings object with apiUrl, apiToken, syncMode
 * @returns {Promise<Object|null>} Match result or null
 */
export async function lookupUrl(url, settings) {
  // First check local sync data
  const local = await getLocalMatch(url);

  // If sync mode is bulk only, return local match
  if (settings.syncMode === 'bulk_only') return local;

  // Otherwise, do real-time lookup
  if (!settings.apiUrl || !settings.apiToken) return local;

  const result = await apiRequest('/api/extension/lookup', {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
    params: { url },
  });

  if (!result.ok) {
    console.error('[EventAtlas] Lookup error:', result.error);
    return local;
  }

  return result.data;
}

/**
 * Test API connection
 * @param {string} apiUrl - API URL to test
 * @param {string} apiToken - API token to use
 * @returns {Promise<{success: boolean, message: string}>} Test result
 */
export async function testApiConnection(apiUrl, apiToken) {
  if (!apiUrl) {
    return { success: false, message: 'Enter API URL' };
  }

  if (!apiToken) {
    return { success: false, message: 'Enter API Token' };
  }

  const result = await apiRequest('/api/extension/sync', {
    apiUrl,
    apiToken,
    timeout: 5000,
  });

  if (result.ok) {
    return { success: true, message: 'Connected!' };
  }

  if (result.status === 401) {
    return { success: false, message: 'Invalid token' };
  }

  if (result.status === 404) {
    return { success: false, message: 'Endpoint not found' };
  }

  if (result.error === 'Timeout') {
    return { success: false, message: 'Timeout' };
  }

  return { success: false, message: result.error || 'Connection failed' };
}

/**
 * Fetch available tags from API
 * @param {Object} settings - Settings object with apiUrl, apiToken
 * @returns {Promise<Array>} Array of tags or empty array on error
 */
export async function fetchTags(settings) {
  if (!settings.apiUrl || !settings.apiToken) return [];

  const result = await apiRequest('/api/extension/tags', {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
  });

  if (!result.ok) {
    console.error('[EventAtlas] Error fetching tags:', result.error);
    return [];
  }

  return result.data.tags || [];
}

/**
 * Fetch available event types from API
 * @param {Object} settings - Settings object with apiUrl, apiToken
 * @returns {Promise<Array>} Array of event types or empty array on error
 */
export async function fetchEventTypes(settings) {
  if (!settings.apiUrl || !settings.apiToken) return [];

  const result = await apiRequest('/api/extension/event-types', {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
  });

  if (!result.ok) {
    console.error('[EventAtlas] Error fetching event types:', result.error);
    return [];
  }

  return result.data.event_types || [];
}

/**
 * Fetch available distances from API
 * @param {Object} settings - Settings object with apiUrl, apiToken
 * @returns {Promise<Array>} Array of distances or empty array on error
 */
export async function fetchDistances(settings) {
  if (!settings.apiUrl || !settings.apiToken) return [];

  const result = await apiRequest('/api/extension/distances', {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
  });

  if (!result.ok) {
    console.error('[EventAtlas] Error fetching distances:', result.error);
    return [];
  }

  return result.data.distances || [];
}
