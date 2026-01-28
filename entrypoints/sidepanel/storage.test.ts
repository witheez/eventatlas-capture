/**
 * Tests for entrypoints/sidepanel/storage.ts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearMockStorage, mockStorage } from '../../test/setup';
import {
  saveToStorage,
  loadFromStorage,
  clearAllStorage,
  saveFilterState,
  loadFilterState,
  type Settings,
  type Bundle,
  type FilterState,
  type StorageData,
} from './storage';

// Test fixtures
const defaultSettings: Settings = {
  apiUrl: '',
  apiToken: '',
  syncMode: 'hybrid',
  autoGroupByDomain: true,
  captureScreenshotByDefault: false,
  autoSwitchTab: true,
  eventListRefreshInterval: 30000,
  distancePresets: [],
  screenshotUploadMode: 'auto',
  autoAnalyzeSites: false,
};

const testBundle: Bundle = {
  id: 'test-id-1',
  name: 'Test Bundle',
  pages: [
    {
      url: 'https://example.com',
      title: 'Example Page',
      capturedAt: '2024-01-01T00:00:00Z',
    },
  ],
  createdAt: '2024-01-01T00:00:00Z',
  expanded: false,
};

const defaultFilterState: FilterState = {
  missingTags: false,
  missingDistances: false,
  startsFrom: null,
  mode: 'all',
};

const migrationHelpers = {
  migrateOldDistancePresets: (presets: string) => {
    return presets.split(',').map((p) => ({
      value: parseInt(p.trim()),
      label: `${p.trim()} km`,
      enabled: true,
    }));
  },
  getDomain: (url: string) => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  },
  generateId: () => 'generated-id-' + Math.random().toString(36).substring(2, 9),
};

describe('saveToStorage', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  it('should save data to chrome storage', async () => {
    const data: StorageData = {
      bundles: [testBundle],
      settings: defaultSettings,
    };

    await saveToStorage('testKey', data);

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ testKey: data });
  });

  it('should save empty bundles array', async () => {
    const data: StorageData = {
      bundles: [],
      settings: defaultSettings,
    };

    await saveToStorage('testKey', data);

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ testKey: data });
  });

  it('should handle storage errors gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('Storage error'));

    await saveToStorage('testKey', { bundles: [], settings: defaultSettings });

    expect(consoleError).toHaveBeenCalledWith('Error saving data:', expect.any(Error));
    consoleError.mockRestore();
  });
});

describe('loadFromStorage', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  it('should load data from new storage format', async () => {
    const storedData: StorageData = {
      bundles: [testBundle],
      settings: { ...defaultSettings, apiUrl: 'https://api.example.com' },
    };
    mockStorage['testKey'] = storedData;

    const result = await loadFromStorage('testKey', 'oldKey', defaultSettings, migrationHelpers);

    expect(result.bundles).toHaveLength(1);
    expect(result.bundles[0].id).toBe('test-id-1');
    expect(result.settings.apiUrl).toBe('https://api.example.com');
    expect(result.migrated).toBe(false);
  });

  it('should return default settings when no data exists', async () => {
    const result = await loadFromStorage('testKey', 'oldKey', defaultSettings, migrationHelpers);

    expect(result.bundles).toHaveLength(0);
    expect(result.settings).toEqual(defaultSettings);
    expect(result.migrated).toBe(false);
  });

  it('should merge stored settings with defaults', async () => {
    const storedData: StorageData = {
      bundles: [],
      settings: { apiUrl: 'https://api.test.com' } as Settings,
    };
    mockStorage['testKey'] = storedData;

    const result = await loadFromStorage('testKey', 'oldKey', defaultSettings, migrationHelpers);

    expect(result.settings.apiUrl).toBe('https://api.test.com');
    expect(result.settings.syncMode).toBe('hybrid');
    expect(result.settings.autoGroupByDomain).toBe(true);
  });

  it('should migrate old format with customDistancePresets', async () => {
    const storedData: StorageData = {
      bundles: [],
      settings: {
        ...defaultSettings,
        customDistancePresets: '5, 10, 25',
      },
    };
    mockStorage['testKey'] = storedData;

    const result = await loadFromStorage('testKey', 'oldKey', defaultSettings, migrationHelpers);

    expect(result.settings.distancePresets).toHaveLength(3);
    expect(result.settings.distancePresets[0].value).toBe(5);
    expect(result.settings.customDistancePresets).toBeUndefined();
    expect(result.migrated).toBe(true);
  });

  it('should migrate from old storage key format', async () => {
    const oldData = [
      { url: 'https://example.com', title: 'Example', capturedAt: '2024-01-01T00:00:00Z' },
      { url: 'https://test.com', title: 'Test', capturedAt: '2024-01-01T00:00:00Z' },
    ];
    mockStorage['oldKey'] = oldData;

    const result = await loadFromStorage('testKey', 'oldKey', defaultSettings, migrationHelpers);

    expect(result.bundles.length).toBeGreaterThan(0);
    expect(result.migrated).toBe(true);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('oldKey');
  });

  it('should handle storage errors gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(new Error('Storage error'));

    const result = await loadFromStorage('testKey', 'oldKey', defaultSettings, migrationHelpers);

    expect(result.bundles).toHaveLength(0);
    expect(result.settings).toEqual(defaultSettings);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('clearAllStorage', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  it('should clear bundles but preserve settings', async () => {
    const settings: Settings = { ...defaultSettings, apiUrl: 'https://api.example.com' };

    await clearAllStorage('testKey', settings);

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      testKey: { bundles: [], settings },
    });
  });
});

describe('saveFilterState', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  it('should save filter state to storage', async () => {
    const filterState: FilterState = {
      missingTags: true,
      missingDistances: false,
      startsFrom: '2024-01-01',
      mode: 'filtered',
    };

    await saveFilterState('filterKey', filterState);

    expect(chrome.storage.local.set).toHaveBeenCalledWith({ filterKey: filterState });
  });

  it('should handle storage errors gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('Storage error'));

    await saveFilterState('filterKey', defaultFilterState);

    expect(consoleError).toHaveBeenCalledWith('Error saving filter state:', expect.any(Error));
    consoleError.mockRestore();
  });
});

describe('loadFilterState', () => {
  beforeEach(() => {
    clearMockStorage();
  });

  it('should load filter state from storage', async () => {
    const storedState: FilterState = {
      missingTags: true,
      missingDistances: true,
      startsFrom: '2024-06-01',
      mode: 'active',
    };
    mockStorage['filterKey'] = storedState;

    const result = await loadFilterState('filterKey', defaultFilterState);

    expect(result.missingTags).toBe(true);
    expect(result.missingDistances).toBe(true);
    expect(result.startsFrom).toBe('2024-06-01');
    expect(result.mode).toBe('active');
  });

  it('should return default filter state when no data exists', async () => {
    const result = await loadFilterState('filterKey', defaultFilterState);

    expect(result).toEqual(defaultFilterState);
  });

  it('should merge stored filter state with defaults', async () => {
    const partialState = { missingTags: true };
    mockStorage['filterKey'] = partialState;

    const result = await loadFilterState('filterKey', defaultFilterState);

    expect(result.missingTags).toBe(true);
    expect(result.missingDistances).toBe(false);
    expect(result.mode).toBe('all');
  });

  it('should handle storage errors gracefully', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(new Error('Storage error'));

    const result = await loadFilterState('filterKey', defaultFilterState);

    expect(result).toEqual(defaultFilterState);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
