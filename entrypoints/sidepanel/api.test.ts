/**
 * Tests for entrypoints/sidepanel/api.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearMockStorage, mockStorage } from '../../test/setup';
import {
  syncWithApi,
  lookupUrl,
  testApiConnection,
  fetchTags,
  fetchEventTypes,
  fetchDistances,
  type ApiSettings,
  type SyncData,
} from './api';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Test fixtures
const apiSettings: ApiSettings = {
  apiUrl: 'https://api.example.com',
  apiToken: 'test-token-123',
  syncMode: 'hybrid',
};

describe('syncWithApi', () => {
  beforeEach(() => {
    clearMockStorage();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return null when apiUrl is missing', async () => {
    const result = await syncWithApi({ ...apiSettings, apiUrl: '' });
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return null when apiToken is missing', async () => {
    const result = await syncWithApi({ ...apiSettings, apiToken: '' });
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return null when syncMode is realtime_only', async () => {
    const result = await syncWithApi({ ...apiSettings, syncMode: 'realtime_only' });
    expect(result).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should fetch and store sync data successfully', async () => {
    const syncData: SyncData = {
      events: [{ id: 1, source_url_normalized: 'example.com/event', title: 'Test Event' }],
      organizer_links: [{ url_normalized: 'example.com/org', id: 1 }],
      synced_at: '2024-01-01T00:00:00Z',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(syncData),
    });

    const result = await syncWithApi(apiSettings);

    expect(result).toEqual(syncData);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/api/extension/sync',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token-123',
        }),
      })
    );
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });

  it('should handle API errors gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve(null),
    });

    const result = await syncWithApi(apiSettings);

    expect(result).toBeNull();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('should normalize API URL without protocol', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ events: [], organizer_links: [], synced_at: '' }),
    });

    await syncWithApi({ ...apiSettings, apiUrl: 'api.example.com' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/api/extension/sync',
      expect.anything()
    );
  });

  it('should use http for localhost', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ events: [], organizer_links: [], synced_at: '' }),
    });

    await syncWithApi({ ...apiSettings, apiUrl: 'localhost:3000' });

    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/extension/sync',
      expect.anything()
    );
  });
});

describe('lookupUrl', () => {
  beforeEach(() => {
    clearMockStorage();
    mockFetch.mockReset();
  });

  it('should return local match in bulk_only mode', async () => {
    mockStorage['eventatlas_sync_data'] = {
      events: [{ id: 1, source_url_normalized: 'example.com/page', title: 'Test' }],
      organizerLinks: [],
    };

    const result = await lookupUrl('https://example.com/page', {
      ...apiSettings,
      syncMode: 'bulk_only',
    });

    expect(result).toEqual({
      match_type: 'event',
      event: { id: 1, source_url_normalized: 'example.com/page', title: 'Test' },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should return local match for organizer links', async () => {
    mockStorage['eventatlas_sync_data'] = {
      events: [],
      organizerLinks: [{ url_normalized: 'example.com/org', id: 5 }],
    };

    const result = await lookupUrl('https://example.com/org', {
      ...apiSettings,
      syncMode: 'bulk_only',
    });

    expect(result).toEqual({
      match_type: 'link_discovery',
      organizer_link: { url_normalized: 'example.com/org', id: 5 },
    });
  });

  it('should do realtime lookup when syncMode is hybrid', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ match_type: 'event', event: { id: 2 } }),
    });

    const result = await lookupUrl('https://example.com/page', apiSettings);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/extension/lookup'),
      expect.anything()
    );
    expect(result).toEqual({ match_type: 'event', event: { id: 2 } });
  });

  it('should fall back to local match on API error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockStorage['eventatlas_sync_data'] = {
      events: [{ id: 1, source_url_normalized: 'example.com/page', title: 'Fallback' }],
      organizerLinks: [],
    };

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await lookupUrl('https://example.com/page', apiSettings);

    expect(result).toEqual({
      match_type: 'event',
      event: { id: 1, source_url_normalized: 'example.com/page', title: 'Fallback' },
    });
    consoleError.mockRestore();
  });

  it('should return null when no API credentials and no local match', async () => {
    const result = await lookupUrl('https://example.com/page', {
      apiUrl: '',
      apiToken: '',
      syncMode: 'hybrid',
    });
    expect(result).toBeNull();
  });
});

describe('testApiConnection', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should return error when apiUrl is missing', async () => {
    const result = await testApiConnection('', 'token');
    expect(result).toEqual({ success: false, message: 'Enter API URL' });
  });

  it('should return error when apiToken is missing', async () => {
    const result = await testApiConnection('https://api.example.com', '');
    expect(result).toEqual({ success: false, message: 'Enter API Token' });
  });

  it('should return success on valid connection', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
    });

    const result = await testApiConnection('https://api.example.com', 'token');
    expect(result).toEqual({ success: true, message: 'Connected!' });
  });

  it('should return invalid token on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
    });

    const result = await testApiConnection('https://api.example.com', 'bad-token');
    expect(result).toEqual({ success: false, message: 'Invalid token' });
  });

  it('should return endpoint not found on 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
    });

    const result = await testApiConnection('https://api.example.com', 'token');
    expect(result).toEqual({ success: false, message: 'Endpoint not found' });
  });

  it('should return timeout on AbortError', async () => {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValueOnce(abortError);

    const result = await testApiConnection('https://api.example.com', 'token');
    expect(result).toEqual({ success: false, message: 'Timeout' });
  });

  it('should return network error message', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failed'));

    const result = await testApiConnection('https://api.example.com', 'token');
    expect(result).toEqual({ success: false, message: 'Network failed' });
  });
});

describe('fetchTags', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should return empty array when apiUrl is missing', async () => {
    const result = await fetchTags({ ...apiSettings, apiUrl: '' });
    expect(result).toEqual([]);
  });

  it('should return empty array when apiToken is missing', async () => {
    const result = await fetchTags({ ...apiSettings, apiToken: '' });
    expect(result).toEqual([]);
  });

  it('should fetch and return tags', async () => {
    const tags = [
      { id: 1, name: 'Music', events_count: 10 },
      { id: 2, name: 'Tech', events_count: 5 },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ tags }),
    });

    const result = await fetchTags(apiSettings);
    expect(result).toEqual(tags);
  });

  it('should return empty array on API error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await fetchTags(apiSettings);
    expect(result).toEqual([]);
    consoleError.mockRestore();
  });
});

describe('fetchEventTypes', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should return empty array when credentials missing', async () => {
    const result = await fetchEventTypes({ ...apiSettings, apiUrl: '' });
    expect(result).toEqual([]);
  });

  it('should fetch and return event types', async () => {
    const eventTypes = [
      { id: 1, name: 'Conference' },
      { id: 2, name: 'Workshop' },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ event_types: eventTypes }),
    });

    const result = await fetchEventTypes(apiSettings);
    expect(result).toEqual(eventTypes);
  });

  it('should return empty array on API error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await fetchEventTypes(apiSettings);
    expect(result).toEqual([]);
    consoleError.mockRestore();
  });
});

describe('fetchDistances', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('should return empty array when credentials missing', async () => {
    const result = await fetchDistances({ ...apiSettings, apiToken: '' });
    expect(result).toEqual([]);
  });

  it('should fetch and return distances', async () => {
    const distances = [
      { value: 5, label: '5 km' },
      { value: 10, label: '10 km' },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ distances }),
    });

    const result = await fetchDistances(apiSettings);
    expect(result).toEqual(distances);
  });

  it('should return empty array on API error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await fetchDistances(apiSettings);
    expect(result).toEqual([]);
    consoleError.mockRestore();
  });
});
