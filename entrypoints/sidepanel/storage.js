/**
 * EventAtlas Capture - Storage Functions
 *
 * Chrome storage operations for persisting bundles, settings, and filter state.
 */

/**
 * Save data to local storage
 * @param {string} storageKey - The storage key to use
 * @param {object} data - Object containing bundles and settings
 */
export async function saveToStorage(storageKey, data) {
  try {
    await chrome.storage.local.set({ [storageKey]: data });
  } catch (err) {
    console.error('Error saving data:', err);
  }
}

/**
 * Load data from local storage with migration support
 * @param {string} storageKey - The primary storage key
 * @param {string} oldStorageKey - The legacy storage key for migration
 * @param {object} defaultSettings - Default settings object
 * @param {function} migrateOldDistancePresets - Migration function for old presets
 * @param {function} getDomain - Domain extraction function
 * @param {function} generateId - ID generation function
 * @returns {Promise<{bundles: Array, settings: object, migrated: boolean}>}
 */
export async function loadFromStorage(
  storageKey,
  oldStorageKey,
  defaultSettings,
  { migrateOldDistancePresets, getDomain, generateId }
) {
  try {
    // First check new storage format
    const result = await chrome.storage.local.get([storageKey, oldStorageKey]);

    if (result[storageKey]) {
      const data = result[storageKey];
      let bundles = data.bundles || [];
      let settings = { ...defaultSettings, ...data.settings };
      let migrated = false;

      // Migrate old customDistancePresets string format to new toggle-based format
      if (settings.customDistancePresets && typeof settings.customDistancePresets === 'string') {
        settings.distancePresets = migrateOldDistancePresets(settings.customDistancePresets);
        delete settings.customDistancePresets;
        migrated = true;
      }

      return { bundles, settings, migrated };
    }

    // Check for old storage format and migrate
    if (result[oldStorageKey] && Array.isArray(result[oldStorageKey])) {
      const oldData = result[oldStorageKey];
      let bundles = [];

      if (oldData.length > 0) {
        // Group by domain for migration
        const domainMap = new Map();
        oldData.forEach((capture) => {
          const domain = getDomain(capture.url || capture.editedUrl || 'unknown');
          if (!domainMap.has(domain)) {
            domainMap.set(domain, []);
          }
          domainMap.get(domain).push(capture);
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
 * @param {string} storageKey - The storage key to use
 * @param {object} settings - Current settings to preserve
 */
export async function clearAllStorage(storageKey, settings) {
  try {
    await saveToStorage(storageKey, { bundles: [], settings });
  } catch (err) {
    console.error('Error clearing storage:', err);
  }
}

/**
 * Save filter state to storage
 * @param {string} filterStateKey - The filter state storage key
 * @param {object} filterState - The filter state object
 */
export async function saveFilterState(filterStateKey, filterState) {
  try {
    await chrome.storage.local.set({ [filterStateKey]: filterState });
  } catch (err) {
    console.error('Error saving filter state:', err);
  }
}

/**
 * Load filter state from storage
 * @param {string} filterStateKey - The filter state storage key
 * @param {object} defaultFilterState - Default filter state
 * @returns {Promise<object>} The loaded filter state merged with defaults
 */
export async function loadFilterState(filterStateKey, defaultFilterState) {
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
