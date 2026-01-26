/**
 * EventAtlas Capture - API Functions
 *
 * API-related functions for communicating with the EventAtlas backend.
 * All API calls go through the centralized apiRequest() function.
 */

import { normalizeUrl } from './utils';

// Storage key for sync data (must match sidepanel.js)
const SYNC_DATA_KEY = 'eventatlas_sync_data';

// Type definitions
export interface ApiSettings {
  apiUrl: string;
  apiToken: string;
  syncMode?: string;
}

interface ApiRequestOptions {
  apiUrl: string;
  apiToken: string;
  method?: string;
  params?: Record<string, string> | null;
  body?: Record<string, unknown> | null;
  timeout?: number;
  signal?: AbortSignal | null;
}

interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}

export interface SyncEvent {
  id: number;
  source_url_normalized: string;
  title?: string;
  name?: string;
}

export interface OrganizerLink {
  url_normalized: string;
  id: number;
}

export interface SyncData {
  events: SyncEvent[];
  organizer_links: OrganizerLink[];
  synced_at: string;
}

export interface EventMatch {
  match_type: 'event';
  event: SyncEvent;
}

export interface LinkDiscoveryMatch {
  match_type: 'link_discovery';
  organizer_link: OrganizerLink;
  link_discovery?: LinkDiscoveryData;
}

export interface ContentItemMatch {
  match_type: 'content_item';
}

export interface NoMatch {
  match_type: 'no_match';
}

export type LookupResult = EventMatch | LinkDiscoveryMatch | ContentItemMatch | NoMatch | null;

export interface LinkDiscoveryData {
  organizer_link_id: number;
  organizer_name: string;
  has_api_endpoint: boolean;
  last_scraped_at: string | null;
  url_pattern: string | null;
  child_links: { url: string }[];
}

export interface Tag {
  id: number;
  name: string;
  events_count?: number;
}

export interface EventType {
  id: number;
  name: string;
}

export interface Distance {
  value: number;
  label: string;
}

// =============================================================================
// API Client
// =============================================================================

/**
 * Normalize API base URL - adds protocol if missing
 * Uses http:// for localhost/127.0.0.1, https:// for everything else
 * Users can override by explicitly typing http:// or https://
 */
function normalizeBaseUrl(url: string): string {
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
 */
async function apiRequest<T = unknown>(
  endpoint: string,
  options: ApiRequestOptions
): Promise<ApiResponse<T>> {
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
    const fetchOptions: RequestInit = {
      method,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      signal: signal || controller.signal,
    };

    if (body) {
      (fetchOptions.headers as Record<string, string>)['Content-Type'] = 'application/json';
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

    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, status: 0, data: null, error: 'Timeout' };
    }

    return {
      ok: false,
      status: 0,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =============================================================================
// API Endpoints
// =============================================================================

/**
 * Sync data from EventAtlas API (bulk sync)
 * Fetches events and organizer links for local URL matching
 */
export async function syncWithApi(settings: ApiSettings): Promise<SyncData | null> {
  if (!settings.apiUrl || !settings.apiToken) return null;
  if (settings.syncMode === 'realtime_only') return null;

  const result = await apiRequest<SyncData>('/api/extension/sync', {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
  });

  if (!result.ok || !result.data) {
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
 */
async function getLocalMatch(url: string): Promise<EventMatch | LinkDiscoveryMatch | null> {
  try {
    const result = await chrome.storage.local.get([SYNC_DATA_KEY]);
    const syncData = result[SYNC_DATA_KEY] as
      | { events?: SyncEvent[]; organizerLinks?: OrganizerLink[] }
      | undefined;

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
 */
export async function lookupUrl(url: string, settings: ApiSettings): Promise<LookupResult> {
  // First check local sync data
  const local = await getLocalMatch(url);

  // If sync mode is bulk only, return local match
  if (settings.syncMode === 'bulk_only') return local;

  // Otherwise, do real-time lookup
  if (!settings.apiUrl || !settings.apiToken) return local;

  const result = await apiRequest<LookupResult>('/api/extension/lookup', {
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
 */
export async function testApiConnection(
  apiUrl: string,
  apiToken: string
): Promise<{ success: boolean; message: string }> {
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
 */
export async function fetchTags(settings: ApiSettings): Promise<Tag[]> {
  if (!settings.apiUrl || !settings.apiToken) return [];

  const result = await apiRequest<{ tags: Tag[] }>('/api/extension/tags', {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
  });

  if (!result.ok || !result.data) {
    console.error('[EventAtlas] Error fetching tags:', result.error);
    return [];
  }

  return result.data.tags || [];
}

/**
 * Fetch available event types from API
 */
export async function fetchEventTypes(settings: ApiSettings): Promise<EventType[]> {
  if (!settings.apiUrl || !settings.apiToken) return [];

  const result = await apiRequest<{ event_types: EventType[] }>('/api/extension/event-types', {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
  });

  if (!result.ok || !result.data) {
    console.error('[EventAtlas] Error fetching event types:', result.error);
    return [];
  }

  return result.data.event_types || [];
}

/**
 * Fetch available distances from API
 */
export async function fetchDistances(settings: ApiSettings): Promise<Distance[]> {
  if (!settings.apiUrl || !settings.apiToken) return [];

  const result = await apiRequest<{ distances: Distance[] }>('/api/extension/distances', {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
  });

  if (!result.ok || !result.data) {
    console.error('[EventAtlas] Error fetching distances:', result.error);
    return [];
  }

  return result.data.distances || [];
}

/**
 * Create a new tag
 */
export async function createTag(
  settings: ApiSettings,
  name: string
): Promise<ApiResponse<{ tag: Tag }>> {
  return apiRequest<{ tag: Tag }>('/api/extension/tags', {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
    method: 'POST',
    body: { name },
  });
}

/**
 * Delete a screenshot from an event
 */
export async function deleteScreenshot(
  settings: ApiSettings,
  eventId: number,
  mediaId: number
): Promise<ApiResponse<void>> {
  return apiRequest<void>(`/api/extension/events/${eventId}/screenshot/${mediaId}`, {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
    method: 'DELETE',
  });
}

/**
 * Upload a screenshot to an event
 */
export interface MediaAsset {
  id: number;
  type: string;
  file_url: string;
  thumbnail_url?: string;
  name?: string;
}

export async function uploadScreenshot(
  settings: ApiSettings,
  eventId: number,
  imageData: string,
  filename: string
): Promise<ApiResponse<{ media_asset: MediaAsset }>> {
  return apiRequest<{ media_asset: MediaAsset }>(`/api/extension/events/${eventId}/screenshot`, {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
    method: 'POST',
    body: { image: imageData, filename },
  });
}

/**
 * Update an event
 */
export async function updateEvent<T = unknown>(
  settings: ApiSettings,
  eventId: number,
  data: Record<string, unknown>
): Promise<ApiResponse<T>> {
  return apiRequest<T>(`/api/extension/events/${eventId}`, {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
    method: 'PATCH',
    body: data,
  });
}

/**
 * Fetch event list with filters
 */
export interface EventListParams {
  missingTags?: boolean;
  missingDistances?: boolean;
  filterMode?: string;
  startsFrom?: string | null;
}

export interface EventStatusFilters {
  missingTags: boolean;
  missingDistances: boolean;
  filterMode: string;
}

export interface EventListEvent {
  id: number;
  name: string;
  start_datetime?: string;
  primary_url?: string;
  primary_link_id?: number;
  event_type?: string;
  tags?: string[];
  distances?: number[];
  missing?: string[];
}

export async function fetchEventList(
  settings: ApiSettings,
  params: EventListParams
): Promise<ApiResponse<{ events: EventListEvent[] }>> {
  const queryParams: Record<string, string> = {};
  if (params.missingTags) queryParams.missing_tags = '1';
  if (params.missingDistances) queryParams.missing_distances = '1';
  if (params.filterMode) queryParams.filter_mode = params.filterMode;
  if (params.startsFrom) queryParams.starts_from = params.startsFrom;

  return apiRequest<{ events: EventListEvent[] }>('/api/extension/event-list', {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
    params: queryParams,
  });
}

/**
 * Mark an event as visited in the event list
 */
export async function markEventVisited(
  settings: ApiSettings,
  eventLinkId: number
): Promise<ApiResponse<void>> {
  return apiRequest<void>('/api/extension/event-list/mark-visited', {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
    method: 'POST',
    body: { event_link_id: eventLinkId },
  });
}

/**
 * Add discovered links to the pipeline
 */
export async function addDiscoveredLinks(
  settings: ApiSettings,
  organizerLinkId: number,
  urls: string[]
): Promise<ApiResponse<{ created_count: number }>> {
  return apiRequest<{ created_count: number }>('/api/extension/add-discovered-links', {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
    method: 'POST',
    body: { organizer_link_id: organizerLinkId, urls },
  });
}

/**
 * Fetch a single event by ID (for refreshing individual items)
 */
export async function fetchSingleEvent(
  settings: ApiSettings,
  eventId: number
): Promise<ApiResponse<{ event: EventListEvent }>> {
  return apiRequest<{ event: EventListEvent }>(`/api/extension/events/${eventId}`, {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
  });
}

/**
 * Check if an event still matches the current filter after being updated
 */
export async function checkEventListStatus(
  settings: ApiSettings,
  eventId: number,
  filters: EventStatusFilters
): Promise<ApiResponse<{ matches_filter: boolean; has_tags: boolean; has_distances: boolean }>> {
  if (!settings.apiUrl || !settings.apiToken) {
    return { ok: false, status: 0, data: null, error: 'No API credentials' };
  }

  const params: Record<string, string> = {};
  if (filters.missingTags) params.missing_tags = '1';
  if (filters.missingDistances) params.missing_distances = '1';
  if (filters.filterMode) params.filter_mode = filters.filterMode;

  return apiRequest(`/api/extension/event-list/${eventId}/status`, {
    apiUrl: settings.apiUrl,
    apiToken: settings.apiToken,
    params,
  });
}

/**
 * Export normalizeBaseUrl for use in upload-queue.ts (XHR needs manual URL construction)
 */
export { normalizeBaseUrl };
