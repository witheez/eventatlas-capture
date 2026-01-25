/**
 * EventAtlas Capture - API Functions
 *
 * API-related functions for communicating with the EventAtlas backend.
 * All functions accept settings as a parameter for API URL and token.
 */

import { normalizeUrl } from './utils.js';

// Storage key for sync data (must match sidepanel.js)
const SYNC_DATA_KEY = 'eventatlas_sync_data';

/**
 * Sync data from EventAtlas API (bulk sync)
 * Fetches events and organizer links for local URL matching
 * @param {Object} settings - Settings object with apiUrl, apiToken, syncMode
 * @returns {Promise<Object|null>} Sync data or null on error
 */
export async function syncWithApi(settings) {
  // Skip if no API configured
  if (!settings.apiUrl || !settings.apiToken) return null;
  if (settings.syncMode === 'realtime_only') return null;

  try {
    const response = await fetch(`${settings.apiUrl}/api/extension/sync`, {
      headers: {
        'Authorization': `Bearer ${settings.apiToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) throw new Error(`Sync failed: ${response.status}`);

    const data = await response.json();

    // Store sync data
    await chrome.storage.local.set({
      [SYNC_DATA_KEY]: {
        events: data.events || [],
        organizerLinks: data.organizer_links || [],
        syncedAt: data.synced_at,
      },
    });

    return data;
  } catch (error) {
    console.error('[EventAtlas] Sync error:', error);
    return null;
  }
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
        return {
          match_type: 'event',
          event: event,
        };
      }
    }

    // Check organizer links - API returns url_normalized
    const organizerLinks = syncData.organizerLinks || [];
    for (const link of organizerLinks) {
      if (link.url_normalized === normalizedUrl) {
        return {
          match_type: 'link_discovery',
          organizer_link: link,
        };
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

  try {
    const response = await fetch(
      `${settings.apiUrl}/api/extension/lookup?url=${encodeURIComponent(url)}`,
      {
        headers: {
          'Authorization': `Bearer ${settings.apiToken}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) return local;
    return await response.json();
  } catch (error) {
    console.error('[EventAtlas] Lookup error:', error);
    return local;
  }
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

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`${apiUrl}/api/extension/sync`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { success: true, message: 'Connected!' };
    } else if (response.status === 401) {
      return { success: false, message: 'Invalid token' };
    } else if (response.status === 404) {
      return { success: false, message: 'Endpoint not found' };
    } else {
      return { success: false, message: `Error ${response.status}` };
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      return { success: false, message: 'Timeout' };
    } else {
      console.error('Connection test error:', error);
      return { success: false, message: 'Connection failed' };
    }
  }
}

/**
 * Fetch available tags from API
 * @param {Object} settings - Settings object with apiUrl, apiToken
 * @returns {Promise<Array>} Array of tags or empty array on error
 */
export async function fetchTags(settings) {
  if (!settings.apiUrl || !settings.apiToken) return [];

  try {
    const response = await fetch(`${settings.apiUrl}/api/extension/tags`, {
      headers: {
        'Authorization': `Bearer ${settings.apiToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) throw new Error(`Failed to fetch tags: ${response.status}`);
    const data = await response.json();
    return data.tags || [];
  } catch (error) {
    console.error('[EventAtlas] Error fetching tags:', error);
    return [];
  }
}

/**
 * Fetch available event types from API
 * @param {Object} settings - Settings object with apiUrl, apiToken
 * @returns {Promise<Array>} Array of event types or empty array on error
 */
export async function fetchEventTypes(settings) {
  if (!settings.apiUrl || !settings.apiToken) return [];

  try {
    const response = await fetch(`${settings.apiUrl}/api/extension/event-types`, {
      headers: {
        'Authorization': `Bearer ${settings.apiToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) throw new Error(`Failed to fetch event types: ${response.status}`);
    const data = await response.json();
    return data.event_types || [];
  } catch (error) {
    console.error('[EventAtlas] Error fetching event types:', error);
    return [];
  }
}

/**
 * Fetch available distances from API
 * @param {Object} settings - Settings object with apiUrl, apiToken
 * @returns {Promise<Array>} Array of distances or empty array on error
 */
export async function fetchDistances(settings) {
  if (!settings.apiUrl || !settings.apiToken) return [];

  try {
    const response = await fetch(`${settings.apiUrl}/api/extension/distances`, {
      headers: {
        'Authorization': `Bearer ${settings.apiToken}`,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) throw new Error(`Failed to fetch distances: ${response.status}`);
    const data = await response.json();
    return data.distances || [];
  } catch (error) {
    console.error('[EventAtlas] Error fetching distances:', error);
    return [];
  }
}
