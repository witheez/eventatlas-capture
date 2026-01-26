/**
 * EventAtlas Capture - Storage Functions
 *
 * Chrome storage operations for persisting bundles, settings, and filter state.
 */

// Type definitions
export interface DistancePreset {
  value: number;
  label: string;
  enabled: boolean;
  isUserPreset?: boolean;
}

export interface Settings {
  apiUrl: string;
  apiToken: string;
  syncMode: string;
  autoGroupByDomain: boolean;
  captureScreenshotByDefault: boolean;
  autoSwitchTab: boolean;
  eventListRefreshInterval: number;
  distancePresets: DistancePreset[];
  screenshotUploadMode: string;
  customDistancePresets?: string;
}

export interface Capture {
  url: string;
  editedUrl?: string;
  title: string;
  editedTitle?: string;
  html?: string;
  text?: string;
  images?: string[];
  selectedImages?: string[];
  screenshot?: string;
  metadata?: Record<string, string>;
  capturedAt: string;
  includeHtml?: boolean;
  includeImages?: boolean;
  includeScreenshot?: boolean;
}

export interface Bundle {
  id: string;
  name: string;
  pages: Capture[];
  createdAt: string;
  expanded: boolean;
}

export interface StorageData {
  bundles: Bundle[];
  settings: Settings;
}

export interface FilterState {
  missingTags: boolean;
  missingDistances: boolean;
  startsFrom: string | null;
  mode: string;
}

interface MigrationHelpers {
  migrateOldDistancePresets: (presets: string) => DistancePreset[];
  getDomain: (url: string) => string;
  generateId: () => string;
}

/**
 * Save data to local storage
 * @param storageKey - The storage key to use
 * @param data - Object containing bundles and settings
 */
export async function saveToStorage(storageKey: string, data: StorageData): Promise<void> {
  try {
    await chrome.storage.local.set({ [storageKey]: data });
  } catch (err) {
    console.error('Error saving data:', err);
  }
}

/**
 * Load data from local storage with migration support
 * @param storageKey - The primary storage key
 * @param oldStorageKey - The legacy storage key for migration
 * @param defaultSettings - Default settings object
 * @param helpers - Migration helper functions
 * @returns Loaded data with bundles, settings, and migration flag
 */
export async function loadFromStorage(
  storageKey: string,
  oldStorageKey: string,
  defaultSettings: Settings,
  helpers: MigrationHelpers
): Promise<{ bundles: Bundle[]; settings: Settings; migrated: boolean }> {
  const { migrateOldDistancePresets, getDomain, generateId } = helpers;

  try {
    // First check new storage format
    const result = await chrome.storage.local.get([storageKey, oldStorageKey]);

    if (result[storageKey]) {
      const data = result[storageKey] as StorageData;
      const loadedBundles = data.bundles || [];
      const loadedSettings = { ...defaultSettings, ...data.settings };
      let migrated = false;

      // Migrate old customDistancePresets string format to new toggle-based format
      if (
        loadedSettings.customDistancePresets &&
        typeof loadedSettings.customDistancePresets === 'string'
      ) {
        loadedSettings.distancePresets = migrateOldDistancePresets(
          loadedSettings.customDistancePresets
        );
        delete loadedSettings.customDistancePresets;
        migrated = true;
      }

      return { bundles: loadedBundles, settings: loadedSettings, migrated };
    }

    // Check for old storage format and migrate
    if (result[oldStorageKey] && Array.isArray(result[oldStorageKey])) {
      const oldData = result[oldStorageKey] as Capture[];
      const bundles: Bundle[] = [];

      if (oldData.length > 0) {
        // Group by domain for migration
        const domainMap = new Map<string, Capture[]>();
        oldData.forEach((capture) => {
          const domain = getDomain(capture.url || capture.editedUrl || 'unknown');
          if (!domainMap.has(domain)) {
            domainMap.set(domain, []);
          }
          domainMap.get(domain)!.push(capture);
        });

        // Create bundles from domain groups
        domainMap.forEach((pages, domain) => {
          bundles.push({
            id: generateId(),
            name: domain,
            pages: pages,
            createdAt: new Date().toISOString(),
            expanded: false,
          });
        });
      }

      // Save in new format and remove old key
      await saveToStorage(storageKey, { bundles, settings: defaultSettings });
      await chrome.storage.local.remove(oldStorageKey);

      return { bundles, settings: { ...defaultSettings }, migrated: true };
    }
  } catch (err) {
    console.error('Error loading data:', err);
  }

  return { bundles: [], settings: { ...defaultSettings }, migrated: false };
}

/**
 * Clear all bundles from storage
 * @param storageKey - The storage key to use
 * @param settings - Current settings to preserve
 */
export async function clearAllStorage(storageKey: string, settings: Settings): Promise<void> {
  try {
    await saveToStorage(storageKey, { bundles: [], settings });
  } catch (err) {
    console.error('Error clearing storage:', err);
  }
}

/**
 * Save filter state to storage
 * @param filterStateKey - The filter state storage key
 * @param filterState - The filter state object
 */
export async function saveFilterState(
  filterStateKey: string,
  filterState: FilterState
): Promise<void> {
  try {
    await chrome.storage.local.set({ [filterStateKey]: filterState });
  } catch (err) {
    console.error('Error saving filter state:', err);
  }
}

/**
 * Load filter state from storage
 * @param filterStateKey - The filter state storage key
 * @param defaultFilterState - Default filter state
 * @returns The loaded filter state merged with defaults
 */
export async function loadFilterState(
  filterStateKey: string,
  defaultFilterState: FilterState
): Promise<FilterState> {
  try {
    const result = await chrome.storage.local.get([filterStateKey]);
    if (result[filterStateKey]) {
      return { ...defaultFilterState, ...result[filterStateKey] };
    }
  } catch (err) {
    console.error('Error loading filter state:', err);
  }
  return { ...defaultFilterState };
}
