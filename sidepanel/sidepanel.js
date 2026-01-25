/**
 * EventAtlas Capture - Side Panel Script
 *
 * Handles side panel UI interactions, preview display, and bundle storage
 * for captured page data. Supports multi-page bundling with persistence.
 * Uses accordion-style bundles with drag-and-drop between bundles.
 */

// Storage keys
const STORAGE_KEY = 'eventatlas_capture_data';
const SYNC_DATA_KEY = 'eventatlas_sync_data';
const MAX_BUNDLE_PAGES = 20;
const MAX_BUNDLES = 50;

// Default settings
const DEFAULT_SETTINGS = {
  autoGroupByDomain: true,
  captureScreenshotByDefault: false,
  apiUrl: '',
  apiToken: '',
  syncMode: 'both', // 'bulk_only', 'realtime_only', 'both'
  // Distance presets - new toggle-based format
  distancePresets: {
    // Which default distances are enabled (true = show, false = hide)
    defaults: {
      5: true,   // 5K
      10: true,  // 10K
      21: true,  // HM
      42: true,  // FM
      50: true,  // 50K
      100: true, // 100K
      161: true, // 100M
    },
    // Additional custom distances to add (comma-separated in input)
    custom: [],
  },
  screenshotUploadTiming: 'immediate', // 'immediate' or 'on_save'
  autoSwitchTab: true, // Switch to Current tab when clicking event in list
  eventListRefreshInterval: 0, // Background refresh interval in minutes (0 = off)
};

// App state
let bundles = []; // Array of { id, name, pages[], createdAt, expanded }
let settings = { ...DEFAULT_SETTINGS };

// Current view state: 'bundles', 'detail'
let currentView = 'bundles';
let currentBundleId = null;
let currentPageIndex = null;

// Detail view state
let selectedImages = new Set();
let textExpanded = false;

// Pending capture for duplicate handling
let pendingCapture = null;

// Drag and drop state
let draggedPage = null; // { bundleId, pageIndex }

// Event list state
let eventListCache = [];
let eventListLastFetched = null;
let eventListRefreshTimer = null;
let activeTab = 'current'; // 'current' or 'event-list'
let filterState = {
  missingTags: false,
  missingDistances: false,
  mode: 'any',
  startsFrom: null, // 'this_month', 'next_month', '2_months', '3_months', '6_months', or ISO date string
};

// Storage key for filter state persistence
const FILTER_STATE_KEY = 'eventatlas_filter_state';

// Link Discovery state
let currentLinkDiscovery = null;
let extractedPageLinks = [];
let newDiscoveredLinks = [];
let selectedNewLinks = new Set();

// DOM Elements - Views
const bundlesView = document.getElementById('bundlesView');
const detailView = document.getElementById('detailView');
const backNav = document.getElementById('backNav');
const backNavText = document.getElementById('backNavText');
const tabNavigation = document.getElementById('tabNavigation');

// DOM Elements - Event List View
const eventListView = document.getElementById('eventListView');
const eventListContainer = document.getElementById('eventListContainer');
const eventListLoading = document.getElementById('eventListLoading');
const eventListEmpty = document.getElementById('eventListEmpty');
const filterMissingTags = document.getElementById('filterMissingTags');
const filterMissingDistances = document.getElementById('filterMissingDistances');
const refreshEventListBtn = document.getElementById('refreshEventList');

// DOM Elements - Event List Settings
const autoSwitchTabSetting = document.getElementById('autoSwitchTabSetting');
const eventListRefreshIntervalSetting = document.getElementById('eventListRefreshInterval');

// DOM Elements - Settings
const settingsBtn = document.getElementById('settingsBtn');
const refreshBtn = document.getElementById('refreshBtn');
const settingsPanel = document.getElementById('settingsPanel');
const autoGroupSetting = document.getElementById('autoGroupSetting');
const screenshotDefaultSetting = document.getElementById('screenshotDefaultSetting');

// DOM Elements - API Settings
const apiUrlSetting = document.getElementById('apiUrlSetting');
const apiTokenSetting = document.getElementById('apiTokenSetting');
const toggleTokenVisibility = document.getElementById('toggleTokenVisibility');
const syncModeSetting = document.getElementById('syncModeSetting');
const customDistancePresetsSetting = document.getElementById('customDistancePresets');
const distancePresetToggles = document.getElementById('distancePresetToggles');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const testConnectionBtn = document.getElementById('testConnectionBtn');
const connectionStatus = document.getElementById('connectionStatus');

// DOM Elements - Bundles view
const pageTitleEl = document.getElementById('pageTitle');
const pageUrlEl = document.getElementById('pageUrl');
const captureBtn = document.getElementById('captureBtn');
const captureBtnGroup = document.getElementById('captureBtnGroup');
const captureNoScreenshotBtn = document.getElementById('captureNoScreenshotBtn');
const captureWithScreenshotBtn = document.getElementById('captureWithScreenshotBtn');
const captureBadge = document.getElementById('captureBadge');
const bundlesList = document.getElementById('bundlesList');
const bundlesCount = document.getElementById('bundlesCount');
const newBundleBtn = document.getElementById('newBundleBtn');
const clearAllBundlesBtn = document.getElementById('clearAllBundlesBtn');

// DOM Elements - Error/Dialog
const errorMessageEl = document.getElementById('errorMessage');
const errorTitleEl = document.getElementById('errorTitle');
const errorHintEl = document.getElementById('errorHint');
const duplicateDialog = document.getElementById('duplicateDialog');
const duplicateText = document.getElementById('duplicateText');
const duplicateReplace = document.getElementById('duplicateReplace');
const duplicateSkip = document.getElementById('duplicateSkip');

// DOM Elements - Detail view
const previewEl = document.getElementById('preview');
const htmlSizeStat = document.getElementById('htmlSizeStat');
const textSizeStat = document.getElementById('textSizeStat');
const imageSizeStat = document.getElementById('imageSizeStat');
const editTitle = document.getElementById('editTitle');
const editUrl = document.getElementById('editUrl');
const screenshotSection = document.getElementById('screenshotSection');
const screenshotBadge = document.getElementById('screenshotBadge');
const screenshotContainer = document.getElementById('screenshotContainer');
const screenshotPlaceholder = document.getElementById('screenshotPlaceholder');
const screenshotThumb = document.getElementById('screenshotThumb');
const screenshotModal = document.getElementById('screenshotModal');
const screenshotModalClose = document.getElementById('screenshotModalClose');
const screenshotModalImg = document.getElementById('screenshotModalImg');
const addScreenshotBtn = document.getElementById('addScreenshotBtn');
const textPreview = document.getElementById('textPreview');
const textCharCount = document.getElementById('textCharCount');
const textToggle = document.getElementById('textToggle');
const imageGallery = document.getElementById('imageGallery');
const imageSelectedCount = document.getElementById('imageSelectedCount');
const metadataSection = document.getElementById('metadataSection');
const metadataList = document.getElementById('metadataList');
const includeHtml = document.getElementById('includeHtml');
const includeImages = document.getElementById('includeImages');
const includeScreenshot = document.getElementById('includeScreenshot');
const moveBundleSelect = document.getElementById('moveBundleSelect');
const copyBtn = document.getElementById('copyBtn');
const removeBtn = document.getElementById('removeBtn');

// DOM Elements - Toast
const toastEl = document.getElementById('toast');

// DOM Elements - Header
const headerTitle = document.getElementById('headerTitle');

// DOM Elements - URL Status (legacy, kept for compatibility)
const urlStatusContainer = document.getElementById('urlStatusContainer');
const urlStatusBadge = document.getElementById('urlStatusBadge');
const urlStatusDetails = document.getElementById('urlStatusDetails');

// DOM Elements - Combined Page Info
const pageInfoSection = document.getElementById('pageInfoSection');
const statusSection = document.getElementById('statusSection');
const pageInfoBadge = document.getElementById('pageInfoBadge');
const pageInfoBadgeIcon = document.getElementById('pageInfoBadgeIcon');
const pageInfoBadgeText = document.getElementById('pageInfoBadgeText');
const statusViewLink = document.getElementById('statusViewLink');
const pageInfoDetails = document.getElementById('pageInfoDetails');
const pageInfoEventName = document.getElementById('pageInfoEventName');
const pageInfoAdminLink = document.getElementById('pageInfoAdminLink');

// DOM Elements - Bundle Section (for conditional visibility)
const captureButtons = document.getElementById('captureButtons');
const bundleSection = document.querySelector('.bundle-section');

// DOM Elements - Link Discovery View
const linkDiscoveryView = document.getElementById('linkDiscoveryView');
const discoverySourceName = document.getElementById('discoverySourceName');
const discoveryApiBadge = document.getElementById('discoveryApiBadge');
const discoveryLastScraped = document.getElementById('discoveryLastScraped');
const scanPageLinksBtn = document.getElementById('scanPageLinks');
const linkComparisonResults = document.getElementById('linkComparisonResults');
const newLinksCount = document.getElementById('newLinksCount');
const knownLinksCount = document.getElementById('knownLinksCount');
const newLinksList = document.getElementById('newLinksList');
const knownLinksList = document.getElementById('knownLinksList');
const selectAllNewLinks = document.getElementById('selectAllNewLinks');
const addNewLinksBtn = document.getElementById('addNewLinksBtn');
const selectedLinksCountEl = document.getElementById('selectedLinksCount');

// DOM Elements - Event Editor
const eventEditor = document.getElementById('eventEditor');
const eventEditorAccordionHeader = document.getElementById('eventEditorAccordionHeader');
const eventEditorChevron = document.getElementById('eventEditorChevron');
const eventEditorContent = document.getElementById('eventEditorContent');
const editorEventName = document.getElementById('editorEventName');
const editorPageTitle = document.getElementById('editorPageTitle');
const editorPageUrl = document.getElementById('editorPageUrl');
const editorBadge = document.getElementById('editorBadge');
const editorViewLink = document.getElementById('editorViewLink');
const editorLoading = document.getElementById('editorLoading');
const editorContent = document.getElementById('editorContent');
const editorEventTypes = document.getElementById('editorEventTypes');
const editorTags = document.getElementById('editorTags');
const editorDistances = document.getElementById('editorDistances');
const customDistanceInput = document.getElementById('customDistanceInput');
const addCustomDistanceBtn = document.getElementById('addCustomDistanceBtn');
const selectedDistancesEl = document.getElementById('selectedDistances');
const editorNotes = document.getElementById('editorNotes');
const editorSaveBtn = document.getElementById('editorSaveBtn');
const captureEventScreenshotBtn = document.getElementById('captureEventScreenshotBtn');
const captureEventHtmlBtn = document.getElementById('captureEventHtmlBtn');
const savedScreenshotsEl = document.getElementById('savedScreenshots');

// Event Editor State
let currentMatchedEvent = null;
let availableTags = [];
let availableEventTypes = [];
let availableDistances = [];
let selectedEventTypeId = null;
let selectedTagIds = new Set();
let selectedDistanceValues = [];
let eventEditorExpanded = true; // Default expanded when event is matched

// Pending screenshots state (for on_save mode)
let pendingScreenshots = []; // Array of { id, data, filename, capturedAt }
let lastKnownUrl = null; // Track URL changes for unsaved warning
let pendingUrlChange = null; // Stores the URL we want to navigate to after dialog

// Upload queue state (persists in memory, survives navigation within session)
// { id, eventId, eventName, imageData, thumbnail, status: 'uploading'|'complete'|'failed', progress: 0-100, error?: string }
let uploadQueue = [];

// DOM Elements - Screenshot Upload Timing Setting
const screenshotUploadTimingSetting = document.getElementById('screenshotUploadTiming');

// DOM Elements - Upload Queue
const uploadQueueEl = document.getElementById('uploadQueue');
const uploadQueueCountEl = document.getElementById('uploadQueueCount');
const uploadQueueItemsEl = document.getElementById('uploadQueueItems');

// DOM Elements - Unsaved Changes Dialog
const unsavedDialog = document.getElementById('unsavedDialog');
const unsavedDialogText = document.getElementById('unsavedDialogText');
const unsavedSaveBtn = document.getElementById('unsavedSaveBtn');
const unsavedDiscardBtn = document.getElementById('unsavedDiscardBtn');
const unsavedCancelBtn = document.getElementById('unsavedCancelBtn');

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Extract domain from URL
 */
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Normalize URL for comparison (strips protocol, www, query params, fragment, trailing slash)
 */
function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    let normalized = parsed.hostname.replace(/^www\./, '');
    normalized += parsed.pathname.replace(/\/$/, '');
    return normalized.toLowerCase();
  } catch (e) {
    return url.toLowerCase();
  }
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Known EventAtlas domains (production, staging, local)
 * These are checked in addition to settings.apiUrl
 */
const KNOWN_EVENTATLAS_DOMAINS = [
  'https://www.eventatlas.co',
  'https://eventatlas.co',
  'https://eventatlasco-staging.up.railway.app',
  'https://ongoingevents-production.up.railway.app',
  'http://eventatlas.test',
  'https://eventatlas.test',
];

/**
 * Check if a URL is an EventAtlas URL (our own admin or frontend)
 * Returns { type: 'admin' | 'frontend', eventId: number } or null
 */
function checkIfEventAtlasUrl(url) {
  // Build list of domains to check: known domains + settings.apiUrl
  const domainsToCheck = [...KNOWN_EVENTATLAS_DOMAINS];
  if (settings.apiUrl) {
    domainsToCheck.push(settings.apiUrl.replace(/\/$/, ''));
  }

  for (const domain of domainsToCheck) {
    try {
      const escapedDomain = escapeRegex(domain.replace(/\/$/, ''));

      // Check admin event URLs: /admin/v2/events/{id} or /admin/v2/events/{id}/edit
      const adminMatch = url.match(new RegExp(`${escapedDomain}/admin/v2/events/(\\d+)`));
      if (adminMatch) {
        return { type: 'admin', eventId: parseInt(adminMatch[1], 10) };
      }

      // Check frontend event URLs: /events/{id-or-slug}
      const frontendMatch = url.match(new RegExp(`${escapedDomain}/events/([^/]+)`));
      if (frontendMatch) {
        return { type: 'frontend', eventIdOrSlug: frontendMatch[1] };
      }
    } catch (e) {
      console.warn('[EventAtlas] Error checking domain:', domain, e);
    }
  }

  return null;
}

/**
 * Build admin edit URL for an event
 * Prefers eventatlas.co for production, falls back to apiUrl
 */
function buildAdminEditUrl(eventId) {
  if (!eventId) return null;
  // Prefer the production domain for admin links
  const baseUrl = 'https://www.eventatlas.co';
  return `${baseUrl}/admin/v2/events/${eventId}/edit`;
}

/**
 * Show toast notification
 */
function showToast(message, type = 'success') {
  toastEl.textContent = message;
  toastEl.className = 'toast visible ' + type;
  setTimeout(() => {
    toastEl.classList.remove('visible');
  }, 2500);
}

/**
 * Show error message box
 */
function showErrorMessage(title, hint) {
  errorTitleEl.textContent = title;
  errorHintEl.textContent = hint;
  errorMessageEl.classList.add('visible');
}

/**
 * Hide error message box
 */
function hideErrorMessage() {
  errorMessageEl.classList.remove('visible');
}

/**
 * Show duplicate URL dialog
 */
function showDuplicateDialog(existingTitle) {
  duplicateText.textContent = `"${existingTitle}" is already in the bundle.`;
  duplicateDialog.classList.add('visible');
}

/**
 * Hide duplicate URL dialog
 */
function hideDuplicateDialog() {
  duplicateDialog.classList.remove('visible');
  pendingCapture = null;
}

/**
 * Update UI with current tab info
 */
async function updateTabInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      const newUrl = tab.url || '';

      // Check for unsaved changes when URL changes
      if (lastKnownUrl && lastKnownUrl !== newUrl && hasUnsavedChanges()) {
        pendingUrlChange = newUrl;
        showUnsavedDialog();
        // Don't update UI yet, wait for user decision
        return;
      }

      // Update last known URL
      lastKnownUrl = newUrl;

      pageTitleEl.textContent = tab.title || 'Unknown';
      pageUrlEl.textContent = newUrl;
    }
  } catch (err) {
    pageTitleEl.textContent = 'Unable to get tab info';
    console.error('Error getting tab info:', err);
  }

  // Update URL status after tab info is updated
  await updateUrlStatus();
}

/**
 * Generate unique ID
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

/**
 * Save data to local storage
 */
async function saveToStorage() {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: { bundles, settings },
    });
  } catch (err) {
    console.error('Error saving data:', err);
  }
}

/**
 * Load data from local storage
 */
async function loadFromStorage() {
  const OLD_STORAGE_KEY = 'eventatlas_capture_bundle';

  try {
    // First check new storage format
    const result = await chrome.storage.local.get([STORAGE_KEY, OLD_STORAGE_KEY]);

    if (result[STORAGE_KEY]) {
      const data = result[STORAGE_KEY];
      bundles = data.bundles || [];
      settings = { ...DEFAULT_SETTINGS, ...data.settings };

      // Migrate old customDistancePresets string format to new toggle-based format
      if (settings.customDistancePresets && typeof settings.customDistancePresets === 'string') {
        settings.distancePresets = migrateOldDistancePresets(settings.customDistancePresets);
        delete settings.customDistancePresets;
        await saveToStorage(); // Persist the migration
      }

      return true;
    }

    // Check for old storage format and migrate
    if (result[OLD_STORAGE_KEY] && Array.isArray(result[OLD_STORAGE_KEY])) {
      const oldData = result[OLD_STORAGE_KEY];
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
        bundles = [];
        domainMap.forEach((pages, domain) => {
          bundles.push({
            id: generateId(),
            name: domain,
            pages: pages,
            createdAt: new Date().toISOString(),
            expanded: false,
          });
        });
      } else {
        bundles = [];
      }
      settings = { ...DEFAULT_SETTINGS };

      // Save in new format and remove old key
      await saveToStorage();
      await chrome.storage.local.remove(OLD_STORAGE_KEY);
      return true;
    }
  } catch (err) {
    console.error('Error loading data:', err);
  }
  bundles = [];
  settings = { ...DEFAULT_SETTINGS };
  return false;
}

/**
 * Sync data from EventAtlas API (bulk sync)
 * Fetches events and organizer links for local URL matching
 */
async function syncWithApi() {
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
 */
async function lookupUrl(url) {
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
 * Render URL status details with optional admin link
 */
function renderUrlStatusDetails(eventName, eventId) {
  urlStatusDetails.innerHTML = '';

  if (eventId) {
    // Create row with event name and admin link
    const row = document.createElement('div');
    row.className = 'url-status-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'url-status-event-name';
    nameSpan.textContent = eventName || '';
    nameSpan.title = eventName || '';

    const adminUrl = buildAdminEditUrl(eventId);
    if (adminUrl) {
      const link = document.createElement('a');
      link.className = 'admin-link';
      link.href = adminUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.innerHTML = 'View \u2192';
      link.title = 'Open in Admin';
      link.addEventListener('click', (e) => {
        e.preventDefault();
        window.open(adminUrl, '_blank');
      });

      row.appendChild(nameSpan);
      row.appendChild(link);
    } else {
      row.appendChild(nameSpan);
    }

    urlStatusDetails.appendChild(row);
  } else {
    urlStatusDetails.textContent = eventName || '';
  }
}

/**
 * Update the combined page info badge and status section visibility
 */
function updatePageInfoBadge(type, text, icon = null) {
  statusSection.style.display = 'flex';
  pageInfoBadge.className = 'page-info-badge ' + type;
  pageInfoBadgeText.textContent = text;
  if (icon) {
    pageInfoBadgeIcon.textContent = icon;
  }
}

/**
 * Show or hide the View link under the status badge
 */
function updateStatusViewLink(eventId) {
  if (eventId) {
    const adminUrl = buildAdminEditUrl(eventId);
    if (adminUrl) {
      statusViewLink.href = adminUrl;
      statusViewLink.style.display = 'inline';
      statusViewLink.onclick = (e) => {
        e.preventDefault();
        window.open(adminUrl, '_blank');
      };
    } else {
      statusViewLink.style.display = 'none';
    }
  } else {
    statusViewLink.style.display = 'none';
  }
}

/**
 * Show or hide the bundle UI based on whether an event is matched
 * Note: status section visibility is controlled by updatePageInfoBadge/hidePageInfoStatus,
 * not here, to avoid conflicts with "no API configured" state
 */
function updateBundleUIVisibility(isEventMatched) {
  if (isEventMatched) {
    // Hide page info, status section, and bundle UI when event is matched
    // (page info is now shown in the event editor accordion header)
    if (pageInfoSection) pageInfoSection.style.display = 'none';
    if (statusSection) statusSection.style.display = 'none';
    if (captureButtons) captureButtons.style.display = 'none';
    if (bundleSection) bundleSection.style.display = 'none';
  } else {
    // Show page info and bundle UI when no event matched
    // Note: status section visibility is NOT changed here - it's controlled by
    // updatePageInfoBadge (shows) and hidePageInfoStatus (hides)
    if (pageInfoSection) pageInfoSection.style.display = 'block';
    if (captureButtons) captureButtons.style.display = 'block';
    if (bundleSection) bundleSection.style.display = 'block';
    // Also update the capture buttons visibility based on settings
    updateCaptureButtonsVisibility();
  }
}

/**
 * Update the page info details section (legacy - kept for backward compatibility)
 * The actual display is now handled by updateStatusViewLink and the status section
 */
function updatePageInfoDetails(eventName, eventId) {
  // Legacy section is now always hidden - display handled by status section
  pageInfoDetails.style.display = 'none';

  // Store values for legacy compatibility
  if (eventName) {
    pageInfoEventName.textContent = eventName || '';
    pageInfoEventName.title = eventName || '';
  }
}

/**
 * Hide page info badge and details
 */
function hidePageInfoStatus() {
  statusSection.style.display = 'none';
  statusViewLink.style.display = 'none';
  pageInfoDetails.style.display = 'none';
  // Show bundle UI when status is hidden
  updateBundleUIVisibility(false);
  // Also hide link discovery view
  hideLinkDiscoveryView();
}

/**
 * Update URL status indicator based on current tab URL
 */
async function updateUrlStatus() {
  // Skip if no API configured
  if (!settings.apiUrl || !settings.apiToken) {
    hidePageInfoStatus();
    hideEventEditor();
    return;
  }

  // Get current tab URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    hidePageInfoStatus();
    hideEventEditor();
    return;
  }

  // Check if this is an EventAtlas URL first
  const eventAtlasMatch = checkIfEventAtlasUrl(tab.url);
  if (eventAtlasMatch) {
    // Show loading state
    updatePageInfoBadge('loading', 'Checking...', '\u22EF');
    updateStatusViewLink(null);
    updateBundleUIVisibility(false);

    // For EventAtlas URLs, we can fetch event details directly
    // Still use lookup API which will match, but we know it's our own page
    try {
      const result = await lookupUrl(tab.url);
      if (result && result.match_type === 'event' && result.event) {
        updatePageInfoBadge('event', 'EventAtlas Event', '\u2713');
        updateStatusViewLink(result.event.id);
        updateBundleUIVisibility(true);
        showEventEditor(result.event);
        hideLinkDiscoveryView();
      } else {
        // EventAtlas URL but no match found (maybe event deleted)
        updatePageInfoBadge('no-match', 'EventAtlas Page', '\u25CB');
        updateStatusViewLink(null);
        updateBundleUIVisibility(false);
        hideEventEditor();
        hideLinkDiscoveryView();
      }
    } catch (error) {
      console.error('[EventAtlas] Status update error:', error);
      hidePageInfoStatus();
      hideEventEditor();
      hideLinkDiscoveryView();
    }
    return;
  }

  // Show loading state for external URLs
  updatePageInfoBadge('loading', 'Checking...', '\u22EF');
  updateStatusViewLink(null);
  updateBundleUIVisibility(false);

  try {
    const result = await lookupUrl(tab.url);

    if (!result || result.match_type === 'no_match') {
      updatePageInfoBadge('no-match', 'New Page', '\u25CB');
      updateStatusViewLink(null);
      updateBundleUIVisibility(false);
      hideEventEditor();
      hideLinkDiscoveryView();
    } else if (result.match_type === 'event') {
      updatePageInfoBadge('event', 'Known Event', '\u2713');
      updateStatusViewLink(result.event?.id);
      updateBundleUIVisibility(true);
      // Show event editor
      showEventEditor(result.event);
      hideLinkDiscoveryView();
    } else if (result.match_type === 'link_discovery') {
      updatePageInfoBadge('link-discovery', 'Discovery', '\u2295');
      updateStatusViewLink(null);
      updateBundleUIVisibility(false);
      hideEventEditor();
      // Show the link discovery view with enhanced data
      showLinkDiscoveryView(result.link_discovery);
    } else if (result.match_type === 'content_item') {
      updatePageInfoBadge('content-item', 'Scraped', '\u25D0');
      updateStatusViewLink(null);
      updateBundleUIVisibility(false);
      hideEventEditor();
      hideLinkDiscoveryView();
    }
  } catch (error) {
    console.error('[EventAtlas] Status update error:', error);
    hidePageInfoStatus();
    hideEventEditor();
    hideLinkDiscoveryView();
  }
}

/**
 * Show the link discovery view with data from lookup response
 */
function showLinkDiscoveryView(linkDiscoveryData) {
  currentLinkDiscovery = linkDiscoveryData;

  // Update header info
  discoverySourceName.textContent = linkDiscoveryData.organizer_name || 'Unknown Source';

  // Show/hide API badge
  discoveryApiBadge.style.display = linkDiscoveryData.has_api_endpoint ? 'inline-block' : 'none';

  // Show last scraped date
  if (linkDiscoveryData.last_scraped_at) {
    const date = new Date(linkDiscoveryData.last_scraped_at);
    discoveryLastScraped.textContent = `Last scraped: ${date.toLocaleDateString()}`;
  } else {
    discoveryLastScraped.textContent = 'Never scraped';
  }

  // Reset state
  extractedPageLinks = [];
  newDiscoveredLinks = [];
  selectedNewLinks = new Set();
  linkComparisonResults.style.display = 'none';

  // Show the view
  linkDiscoveryView.style.display = 'block';
}

/**
 * Hide the link discovery view
 */
function hideLinkDiscoveryView() {
  if (linkDiscoveryView) {
    linkDiscoveryView.style.display = 'none';
  }
  currentLinkDiscovery = null;
}

/**
 * Scan the current page for links using chrome.scripting
 */
async function scanPageForLinks() {
  if (!currentLinkDiscovery) return;

  const btn = scanPageLinksBtn;
  btn.disabled = true;
  btn.innerHTML = '<span class="scan-btn-icon">\u23F3</span> Scanning...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Execute script in page context to extract links
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractLinksFromPage,
      args: [currentLinkDiscovery.url_pattern],
    });

    extractedPageLinks = results[0]?.result || [];

    // Compare with known links
    compareLinksAndRender();

    btn.innerHTML = '<span class="scan-btn-icon">\uD83D\uDD04</span> Rescan Page';
  } catch (error) {
    console.error('[EventAtlas] Error scanning page:', error);
    showToast('Failed to scan page for links', 'error');
    btn.innerHTML = '<span class="scan-btn-icon">\uD83D\uDD0D</span> Scan Page for Links';
  } finally {
    btn.disabled = false;
  }
}

/**
 * Function injected into page to extract links
 * @param {string|null} urlPattern - Regex pattern to filter links
 */
function extractLinksFromPage(urlPattern) {
  const allLinks = document.querySelectorAll('a[href]');
  const uniqueUrls = new Set();

  allLinks.forEach((a) => {
    const href = a.href;
    if (href && href.startsWith('http')) {
      // Normalize URL - remove trailing slashes and fragments
      try {
        const url = new URL(href);
        let normalized = url.origin + url.pathname.replace(/\/$/, '');

        if (urlPattern) {
          try {
            // URL pattern uses ~ as delimiter in PHP, we just use the pattern content
            const regex = new RegExp(urlPattern, 'i');
            if (regex.test(href)) {
              uniqueUrls.add(normalized);
            }
          } catch (e) {
            // Invalid regex, add anyway
            uniqueUrls.add(normalized);
          }
        } else {
          uniqueUrls.add(normalized);
        }
      } catch (e) {
        // Invalid URL, skip
      }
    }
  });

  return Array.from(uniqueUrls);
}

/**
 * Compare extracted links with known child links and render results
 */
function compareLinksAndRender() {
  if (!currentLinkDiscovery) return;

  // Build set of known normalized URLs
  const knownUrls = new Set();
  const childLinks = currentLinkDiscovery.child_links || [];

  childLinks.forEach((link) => {
    const normalized = normalizeUrl(link.url);
    knownUrls.add(normalized);
  });

  // Find new links (on page but not in known)
  newDiscoveredLinks = extractedPageLinks.filter((url) => {
    const normalized = normalizeUrl(url);
    return !knownUrls.has(normalized);
  });

  // Start with all new links selected
  selectedNewLinks = new Set(newDiscoveredLinks);

  // Render results
  renderLinkComparison(childLinks);
}

/**
 * Render the link comparison results
 */
function renderLinkComparison(childLinks) {
  // Update counts
  newLinksCount.textContent = newDiscoveredLinks.length;
  knownLinksCount.textContent = childLinks.length;

  // Render new links with checkboxes
  newLinksList.innerHTML = newDiscoveredLinks
    .map(
      (url) => `
    <div class="link-item new-link">
      <label>
        <input type="checkbox" class="new-link-checkbox" data-url="${escapeHtml(url)}" checked>
        <span>${escapeHtml(url)}</span>
      </label>
    </div>
  `
    )
    .join('');

  // Setup checkbox listeners
  newLinksList.querySelectorAll('.new-link-checkbox').forEach((cb) => {
    cb.addEventListener('change', (e) => {
      if (e.target.checked) {
        selectedNewLinks.add(e.target.dataset.url);
      } else {
        selectedNewLinks.delete(e.target.dataset.url);
      }
      updateSelectedLinksCount();
    });
  });

  // Setup select all
  selectAllNewLinks.checked = newDiscoveredLinks.length > 0;
  selectAllNewLinks.disabled = newDiscoveredLinks.length === 0;

  // Render known links (read-only)
  knownLinksList.innerHTML = childLinks.map((link) => `<div class="link-item known-link">${escapeHtml(link.url)}</div>`).join('');

  updateSelectedLinksCount();
  linkComparisonResults.style.display = 'block';
}

/**
 * Update the selected links count and button visibility
 */
function updateSelectedLinksCount() {
  const count = selectedNewLinks.size;
  selectedLinksCountEl.textContent = count;
  addNewLinksBtn.style.display = count > 0 ? 'block' : 'none';
  addNewLinksBtn.disabled = count === 0;
}

/**
 * Add selected new links to the pipeline via API
 */
async function addNewLinksToPipeline() {
  const linksToAdd = Array.from(selectedNewLinks);
  if (linksToAdd.length === 0 || !currentLinkDiscovery) return;

  const btn = addNewLinksBtn;
  btn.disabled = true;
  btn.textContent = 'Adding...';

  try {
    const response = await fetch(`${settings.apiUrl}/api/extension/add-discovered-links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${settings.apiToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        organizer_link_id: currentLinkDiscovery.organizer_link_id,
        urls: linksToAdd,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    showToast(`Added ${data.created_count} new links to pipeline`);

    // Refresh the lookup to get updated child links
    await updateUrlStatus();
  } catch (error) {
    console.error('[EventAtlas] Error adding links:', error);
    showToast('Error adding links: ' + error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `Add <span id="selectedLinksCount">${selectedNewLinks.size}</span> Selected Links to Pipeline`;
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Clear all bundles from storage
 */
async function clearAllStorage() {
  try {
    bundles = [];
    await saveToStorage();
  } catch (err) {
    console.error('Error clearing storage:', err);
  }
}

/**
 * Get bundle by ID
 */
function getBundleById(id) {
  return bundles.find((b) => b.id === id);
}

/**
 * Get current bundle
 */
function getCurrentBundle() {
  return currentBundleId ? getBundleById(currentBundleId) : null;
}

/**
 * Update capture buttons visibility based on screenshot default setting
 */
function updateCaptureButtonsVisibility() {
  if (settings.captureScreenshotByDefault) {
    // Show single button (captures with screenshot)
    captureBtn.style.display = 'block';
    captureBtnGroup.style.display = 'none';
  } else {
    // Show two buttons (capture without/with screenshot)
    captureBtn.style.display = 'none';
    captureBtnGroup.style.display = 'flex';
  }
}

/**
 * Switch between views: 'bundles', 'detail'
 */
function switchView(view) {
  currentView = view;

  // Hide all views
  bundlesView.classList.remove('active');
  detailView.classList.remove('active');
  backNav.classList.remove('visible');

  if (view === 'bundles') {
    bundlesView.classList.add('active');
    currentPageIndex = null;
  } else if (view === 'detail') {
    detailView.classList.add('active');
    backNav.classList.add('visible');
    backNavText.textContent = 'Back to Bundles';
  }
}

/**
 * Update header badge - total pages across all bundles
 */
function updateBadge() {
  const totalPages = bundles.reduce((sum, b) => sum + (b.pages?.length || 0), 0);
  if (totalPages === 0) {
    captureBadge.textContent = 'No captures';
    captureBadge.classList.remove('has-capture');
  } else {
    captureBadge.textContent = `${totalPages} page${totalPages !== 1 ? 's' : ''}`;
    captureBadge.classList.add('has-capture');
  }
}

/**
 * Toggle bundle accordion
 */
function toggleBundleExpanded(bundleId) {
  const bundle = getBundleById(bundleId);
  if (bundle) {
    bundle.expanded = !bundle.expanded;
    saveToStorage();
    renderBundlesList();
  }
}

/**
 * Clear all children from an element
 */
function clearChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Render the bundles list with accordion (Main View)
 */
function renderBundlesList() {
  clearChildren(bundlesList);
  updateBadge();

  const count = bundles.length;
  bundlesCount.textContent = `${count} bundle${count !== 1 ? 's' : ''}`;

  if (count === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'bundles-empty';
    emptyEl.innerHTML = '<div class="bundles-empty-icon">&#128193;</div><div>No bundles yet. Capture a page to start.</div>';
    bundlesList.appendChild(emptyEl);
    return;
  }

  bundles.forEach((bundle) => {
    const accordionBundle = createAccordionBundle(bundle);
    bundlesList.appendChild(accordionBundle);
  });
}

/**
 * Create an accordion bundle element
 */
function createAccordionBundle(bundle) {
  const wrapper = document.createElement('div');
  wrapper.className = 'accordion-bundle' + (bundle.expanded ? ' expanded' : '');
  wrapper.dataset.bundleId = bundle.id;

  // Header
  const header = document.createElement('div');
  header.className = 'accordion-header';

  // Chevron
  const chevron = document.createElement('span');
  chevron.className = 'accordion-chevron';
  chevron.innerHTML = '&#9654;'; // ▶

  // Icon
  const icon = document.createElement('span');
  icon.className = 'accordion-icon';
  icon.textContent = '📁';

  // Info
  const info = document.createElement('div');
  info.className = 'accordion-info';

  const name = document.createElement('div');
  name.className = 'accordion-name';
  name.textContent = bundle.name || 'Unnamed Bundle';

  const meta = document.createElement('div');
  meta.className = 'accordion-meta';
  const pageCount = bundle.pages?.length || 0;
  meta.textContent = `${pageCount} page${pageCount !== 1 ? 's' : ''}`;

  info.appendChild(name);
  info.appendChild(meta);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'accordion-actions';

  // Copy button
  const copyBundleBtn = document.createElement('button');
  copyBundleBtn.className = 'accordion-action-btn';
  copyBundleBtn.innerHTML = '&#128203;'; // 📋
  copyBundleBtn.title = 'Copy bundle to clipboard';
  copyBundleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyBundleToClipboard(bundle.id);
  });

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'accordion-action-btn delete';
  deleteBtn.innerHTML = '&times;';
  deleteBtn.title = 'Delete bundle';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteBundle(bundle.id);
  });

  actions.appendChild(copyBundleBtn);
  actions.appendChild(deleteBtn);

  header.appendChild(chevron);
  header.appendChild(icon);
  header.appendChild(info);
  header.appendChild(actions);

  // Click header to toggle
  header.addEventListener('click', () => {
    toggleBundleExpanded(bundle.id);
  });

  // Content (pages)
  const content = document.createElement('div');
  content.className = 'accordion-content';

  const pagesContainer = document.createElement('div');
  pagesContainer.className = 'accordion-pages';

  const pages = bundle.pages || [];
  if (pages.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'accordion-empty';
    emptyEl.textContent = 'No pages in this bundle yet.';
    pagesContainer.appendChild(emptyEl);
  } else {
    pages.forEach((capture, index) => {
      const pageItem = createAccordionPageItem(bundle.id, capture, index);
      pagesContainer.appendChild(pageItem);
    });
  }

  content.appendChild(pagesContainer);

  wrapper.appendChild(header);
  wrapper.appendChild(content);

  // Drop zone for the bundle (header is the drop target)
  setupBundleDropZone(wrapper, bundle.id);

  return wrapper;
}

/**
 * Create a page item within an accordion bundle
 */
function createAccordionPageItem(bundleId, capture, index) {
  const item = document.createElement('div');
  item.className = 'accordion-page';
  item.draggable = true;
  item.dataset.bundleId = bundleId;
  item.dataset.pageIndex = index;

  // Drag handle
  const dragHandle = document.createElement('span');
  dragHandle.className = 'accordion-page-drag';
  dragHandle.innerHTML = '&#8942;&#8942;'; // ⋮⋮

  // Thumbnail - prefer screenshot, then first image, then icon
  const thumb = document.createElement('div');
  thumb.className = 'accordion-page-thumb';

  const thumbUrl = capture.screenshot || capture.images?.[0] || capture.selectedImages?.[0];
  if (thumbUrl) {
    const img = document.createElement('img');
    img.src = thumbUrl;
    img.alt = '';
    img.onerror = () => {
      thumb.textContent = '📄';
    };
    thumb.appendChild(img);
  } else {
    thumb.textContent = '📄';
  }

  // Info
  const info = document.createElement('div');
  info.className = 'accordion-page-info';

  const title = document.createElement('div');
  title.className = 'accordion-page-title';
  title.textContent = capture.editedTitle || capture.title || 'Untitled';

  const domain = document.createElement('div');
  domain.className = 'accordion-page-domain';
  domain.textContent = getDomain(capture.editedUrl || capture.url || '');

  info.appendChild(title);
  info.appendChild(domain);

  // Remove button
  const removeBtnEl = document.createElement('button');
  removeBtnEl.className = 'accordion-page-remove';
  removeBtnEl.innerHTML = '&times;';
  removeBtnEl.title = 'Remove from bundle';
  removeBtnEl.addEventListener('click', (e) => {
    e.stopPropagation();
    removePageFromBundle(bundleId, index);
  });

  // Click to view details
  item.addEventListener('click', (e) => {
    if (e.target.closest('.accordion-page-remove') || e.target.closest('.accordion-page-drag')) {
      return;
    }
    currentBundleId = bundleId;
    viewPageDetail(index);
  });

  // Drag events
  item.addEventListener('dragstart', (e) => {
    draggedPage = { bundleId, pageIndex: index };
    item.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ bundleId, pageIndex: index }));
  });

  item.addEventListener('dragend', () => {
    item.classList.remove('dragging');
    draggedPage = null;
    // Remove all drag-over highlights
    document.querySelectorAll('.accordion-bundle.drag-over').forEach((el) => {
      el.classList.remove('drag-over');
    });
  });

  item.appendChild(dragHandle);
  item.appendChild(thumb);
  item.appendChild(info);
  item.appendChild(removeBtnEl);

  return item;
}

/**
 * Setup drag and drop zone for a bundle
 */
function setupBundleDropZone(bundleElement, bundleId) {
  bundleElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (draggedPage && draggedPage.bundleId !== bundleId) {
      bundleElement.classList.add('drag-over');
      e.dataTransfer.dropEffect = 'move';
    }
  });

  bundleElement.addEventListener('dragleave', (e) => {
    // Only remove if we're actually leaving the bundle element
    if (!bundleElement.contains(e.relatedTarget)) {
      bundleElement.classList.remove('drag-over');
    }
  });

  bundleElement.addEventListener('drop', async (e) => {
    e.preventDefault();
    bundleElement.classList.remove('drag-over');

    if (!draggedPage) return;

    const { bundleId: sourceBundleId, pageIndex } = draggedPage;
    if (sourceBundleId === bundleId) return; // Same bundle, no move needed

    // Move page from source to target bundle
    await movePageBetweenBundles(sourceBundleId, pageIndex, bundleId);
    draggedPage = null;
  });
}

/**
 * Move a page from one bundle to another
 */
async function movePageBetweenBundles(sourceBundleId, pageIndex, targetBundleId) {
  const sourceBundle = getBundleById(sourceBundleId);
  const targetBundle = getBundleById(targetBundleId);

  if (!sourceBundle || !targetBundle) return;

  // Check target bundle limit
  if (targetBundle.pages.length >= MAX_BUNDLE_PAGES) {
    showToast(`Target bundle is full (${MAX_BUNDLE_PAGES} pages max)`, 'error');
    return;
  }

  // Remove from source and add to target
  const page = sourceBundle.pages.splice(pageIndex, 1)[0];
  targetBundle.pages.push(page);

  // Expand target bundle to show the moved page
  targetBundle.expanded = true;

  await saveToStorage();
  renderBundlesList();
  showToast(`Moved to "${targetBundle.name}"`, 'success');
}

/**
 * View page detail
 */
function viewPageDetail(index) {
  const bundle = getCurrentBundle();
  if (!bundle || index < 0 || index >= bundle.pages.length) return;

  currentPageIndex = index;
  const capture = bundle.pages[index];

  // Restore selected images for this capture
  selectedImages = new Set(capture.selectedImages || capture.images || []);

  // Restore toggle states
  includeHtml.checked = capture.includeHtml !== false;
  includeImages.checked = capture.includeImages !== false;
  includeScreenshot.checked = capture.includeScreenshot !== false;

  // Reset text expansion
  textExpanded = false;

  // Populate move bundle dropdown
  populateMoveBundleSelect();

  renderDetailPreview(capture);
  switchView('detail');
}

/**
 * Populate the move-to-bundle dropdown
 */
function populateMoveBundleSelect() {
  clearChildren(moveBundleSelect);

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '-- Select bundle --';
  moveBundleSelect.appendChild(defaultOption);

  bundles.forEach((bundle) => {
    // Skip current bundle
    if (bundle.id === currentBundleId) return;

    const option = document.createElement('option');
    option.value = bundle.id;
    option.textContent = bundle.name || 'Unnamed Bundle';
    moveBundleSelect.appendChild(option);
  });
}

/**
 * Render detail preview for a capture
 */
function renderDetailPreview(capture) {
  // Stats
  htmlSizeStat.textContent = formatBytes(capture.html?.length || 0);
  textSizeStat.textContent = formatBytes(capture.text?.length || 0);
  imageSizeStat.textContent = String(capture.images?.length || 0);

  // Editable fields
  editTitle.value = capture.editedTitle || capture.title || '';
  editUrl.value = capture.editedUrl || capture.url || '';

  // Screenshot
  renderScreenshot(capture);

  // Text preview
  const fullText = capture.text || '';
  const previewText = fullText.substring(0, 500);
  textPreview.textContent = textExpanded ? fullText : previewText + (fullText.length > 500 ? '...' : '');
  textCharCount.textContent = `${fullText.length.toLocaleString()} chars`;
  textToggle.style.display = fullText.length > 500 ? 'block' : 'none';
  textToggle.textContent = textExpanded ? 'Show less' : 'Show more';

  // Image gallery
  renderImageGallery(capture);

  // Metadata
  renderMetadata(capture);
}

/**
 * Render screenshot section
 */
function renderScreenshot(capture) {
  if (capture.screenshot) {
    // Calculate approximate size of base64 data
    const screenshotSize = Math.round((capture.screenshot.length * 3) / 4); // Base64 to bytes
    screenshotBadge.textContent = formatBytes(screenshotSize);

    screenshotThumb.src = capture.screenshot;
    screenshotThumb.style.display = 'block';
    screenshotPlaceholder.style.display = 'none';
  } else {
    screenshotBadge.textContent = 'N/A';
    screenshotThumb.style.display = 'none';
    screenshotPlaceholder.style.display = 'block';
  }
}

/**
 * Open screenshot modal
 */
function openScreenshotModal(screenshotSrc) {
  screenshotModalImg.src = screenshotSrc;
  screenshotModal.classList.add('visible');
}

/**
 * Close screenshot modal
 */
function closeScreenshotModal() {
  screenshotModal.classList.remove('visible');
  screenshotModalImg.src = '';
}

/**
 * Render image gallery
 */
function renderImageGallery(capture) {
  clearChildren(imageGallery);

  const images = capture.images || [];

  if (images.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'image-item-error';
    emptyEl.textContent = 'No images found';
    emptyEl.style.gridColumn = '1 / -1';
    emptyEl.style.padding = '16px';
    imageGallery.appendChild(emptyEl);
    imageSelectedCount.textContent = '0 selected';
    return;
  }

  images.forEach((url, index) => {
    const isSelected = selectedImages.has(url);

    const item = document.createElement('div');
    item.className = 'image-item' + (isSelected ? '' : ' excluded');

    const img = document.createElement('img');
    img.src = url;
    img.alt = `Image ${index + 1}`;
    img.onerror = () => {
      clearChildren(item);
      const errorEl = document.createElement('div');
      errorEl.className = 'image-item-error';
      errorEl.textContent = 'Failed to load';
      item.appendChild(errorEl);
    };

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'image-checkbox';
    checkbox.checked = isSelected;
    checkbox.addEventListener('change', (e) => {
      e.stopPropagation();
      if (checkbox.checked) {
        selectedImages.add(url);
        item.classList.remove('excluded');
      } else {
        selectedImages.delete(url);
        item.classList.add('excluded');
      }
      updateImageCount(capture);
      saveCurrentDetail();
    });

    item.appendChild(img);
    item.appendChild(checkbox);

    // Click on image toggles checkbox
    item.addEventListener('click', (e) => {
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
        checkbox.dispatchEvent(new Event('change'));
      }
    });

    imageGallery.appendChild(item);
  });

  updateImageCount(capture);
}

/**
 * Update image selected count
 */
function updateImageCount(capture) {
  const total = capture.images?.length || 0;
  const selected = selectedImages.size;
  imageSelectedCount.textContent = `${selected}/${total} selected`;
}

/**
 * Render metadata section
 */
function renderMetadata(capture) {
  const metadata = capture.metadata || {};
  const entries = Object.entries(metadata);

  if (entries.length === 0) {
    metadataSection.style.display = 'none';
    return;
  }

  metadataSection.style.display = 'block';
  clearChildren(metadataList);

  entries.forEach(([key, value]) => {
    const item = document.createElement('div');
    item.className = 'metadata-item';

    const keyEl = document.createElement('span');
    keyEl.className = 'metadata-key';
    keyEl.textContent = key.replace(/_/g, ':');

    const valueEl = document.createElement('span');
    valueEl.className = 'metadata-value';
    valueEl.textContent = value.length > 100 ? value.substring(0, 100) + '...' : value;
    valueEl.title = value;

    item.appendChild(keyEl);
    item.appendChild(valueEl);
    metadataList.appendChild(item);
  });
}

/**
 * Save current detail view edits back to bundle
 */
function saveCurrentDetail() {
  const bundle = getCurrentBundle();
  if (!bundle || currentPageIndex === null || currentPageIndex >= bundle.pages.length) return;

  bundle.pages[currentPageIndex] = {
    ...bundle.pages[currentPageIndex],
    selectedImages: Array.from(selectedImages),
    editedTitle: editTitle.value,
    editedUrl: editUrl.value,
    includeHtml: includeHtml.checked,
    includeImages: includeImages.checked,
    includeScreenshot: includeScreenshot.checked,
  };

  saveToStorage();
}

/**
 * Build export data for a single capture
 */
function buildExportData(capture) {
  const exportData = {
    url: capture.editedUrl || capture.url,
    title: capture.editedTitle || capture.title,
    text: capture.text,
    metadata: capture.metadata,
    capturedAt: capture.capturedAt,
  };

  if (capture.includeHtml !== false) {
    exportData.html = capture.html;
  }

  const images = capture.selectedImages || capture.images || [];
  if (capture.includeImages !== false && images.length > 0) {
    exportData.images = images;
  }

  if (capture.includeScreenshot !== false && capture.screenshot) {
    exportData.screenshot = capture.screenshot;
  }

  return exportData;
}

/**
 * Copy single capture to clipboard
 */
async function copySingleToClipboard() {
  const bundle = getCurrentBundle();
  if (!bundle || currentPageIndex === null || currentPageIndex >= bundle.pages.length) {
    showToast('No capture selected', 'error');
    return;
  }

  // Save any pending edits first
  saveCurrentDetail();

  const capture = bundle.pages[currentPageIndex];
  const exportData = buildExportData(capture);

  try {
    const json = JSON.stringify(exportData, null, 2);
    await navigator.clipboard.writeText(json);
    showToast('Copied to clipboard!', 'success');
  } catch (err) {
    console.error('Copy failed:', err);
    showToast('Failed to copy', 'error');
  }
}

/**
 * Copy bundle to clipboard by bundle ID
 */
async function copyBundleToClipboard(bundleId) {
  const bundle = getBundleById(bundleId);
  if (!bundle || bundle.pages.length === 0) {
    showToast('No pages in bundle', 'error');
    return;
  }

  const exportBundle = bundle.pages.map((capture) => buildExportData(capture));

  try {
    const json = JSON.stringify(exportBundle, null, 2);
    await navigator.clipboard.writeText(json);
    showToast(`Copied ${bundle.pages.length} page${bundle.pages.length !== 1 ? 's' : ''} to clipboard!`, 'success');
  } catch (err) {
    console.error('Copy bundle failed:', err);
    showToast('Failed to copy bundle', 'error');
  }
}

/**
 * Remove page from bundle
 */
async function removePageFromBundle(bundleId, index) {
  const bundle = getBundleById(bundleId);
  if (!bundle || index < 0 || index >= bundle.pages.length) return;

  const removed = bundle.pages.splice(index, 1)[0];
  await saveToStorage();

  // If we're viewing the removed item in detail view, go back to bundles
  if (currentView === 'detail' && currentBundleId === bundleId && currentPageIndex === index) {
    switchView('bundles');
  } else if (currentView === 'detail' && currentBundleId === bundleId && currentPageIndex > index) {
    // Adjust index if we removed something before current view
    currentPageIndex--;
  }

  renderBundlesList();
  showToast(`Removed "${removed.title || 'page'}" from bundle`, 'success');
}

/**
 * Remove current page from bundle (from detail view)
 */
async function removeCurrentFromBundle() {
  if (currentBundleId && currentPageIndex !== null) {
    await removePageFromBundle(currentBundleId, currentPageIndex);
  }
}

/**
 * Delete an entire bundle
 */
async function deleteBundle(bundleId) {
  const index = bundles.findIndex((b) => b.id === bundleId);
  if (index === -1) return;

  const removed = bundles.splice(index, 1)[0];
  await saveToStorage();

  // If viewing detail of deleted bundle, go back to bundles list
  if (currentBundleId === bundleId) {
    switchView('bundles');
  }

  renderBundlesList();
  showToast(`Deleted "${removed.name || 'bundle'}"`, 'success');
}

/**
 * Clear all bundles
 */
async function clearAllBundles() {
  if (bundles.length === 0) {
    showToast('No bundles to clear', 'error');
    return;
  }

  bundles = [];
  await saveToStorage();

  switchView('bundles');
  renderBundlesList();
  showToast('All bundles cleared', 'success');
}

/**
 * Find duplicate URL in a specific bundle
 */
function findDuplicateInBundle(bundleId, url) {
  const bundle = getBundleById(bundleId);
  if (!bundle) return -1;

  return bundle.pages.findIndex((capture) => {
    const captureUrl = capture.editedUrl || capture.url;
    return captureUrl === url;
  });
}

/**
 * Find bundle for domain (for auto-grouping)
 */
function findBundleForDomain(domain) {
  return bundles.find((b) => b.name === domain);
}

/**
 * Create a new bundle
 */
function createBundle(name) {
  if (bundles.length >= MAX_BUNDLES) {
    showToast(`Bundle limit reached (${MAX_BUNDLES} max)`, 'error');
    return null;
  }

  const newBundle = {
    id: generateId(),
    name: name || `Bundle ${bundles.length + 1}`,
    pages: [],
    createdAt: new Date().toISOString(),
    expanded: true, // Start expanded
  };

  bundles.push(newBundle);
  return newBundle;
}

/**
 * Add capture to a specific bundle
 */
async function addCaptureToBundle(bundleId, capture, replaceIndex = -1) {
  const bundle = getBundleById(bundleId);
  if (!bundle) return false;

  // Prepare capture data
  const captureData = {
    ...capture,
    selectedImages: capture.images || [],
    includeHtml: true,
    includeImages: true,
    includeScreenshot: true,
  };

  if (replaceIndex >= 0 && replaceIndex < bundle.pages.length) {
    // Replace existing
    bundle.pages[replaceIndex] = captureData;
  } else {
    // Check bundle limit
    if (bundle.pages.length >= MAX_BUNDLE_PAGES) {
      showToast(`Bundle limit reached (${MAX_BUNDLE_PAGES} pages max)`, 'error');
      return false;
    }
    bundle.pages.push(captureData);
  }

  // Expand the bundle to show the new page
  bundle.expanded = true;

  await saveToStorage();
  renderBundlesList();
  return true;
}

/**
 * Check if an error is a connection error
 */
function isConnectionError(error) {
  const errorMessage = error?.message || String(error);
  return (
    errorMessage.includes('Could not establish connection') ||
    errorMessage.includes('Receiving end does not exist') ||
    errorMessage.includes('No tab with id') ||
    errorMessage.includes('Cannot access') ||
    errorMessage.includes('Extension context invalidated')
  );
}

/**
 * Capture screenshot via background service worker
 */
async function captureScreenshot(windowId) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'captureScreenshot',
      windowId: windowId,
    });

    if (response.error) {
      console.warn('[EventAtlas Capture] Screenshot capture failed:', response.error);
      return null;
    }

    return response.screenshot;
  } catch (error) {
    console.warn('[EventAtlas Capture] Screenshot capture failed:', error);
    return null;
  }
}

/**
 * Set capture buttons state (disabled/enabled and text)
 */
function setCaptureButtonsState(disabled, text) {
  // Single button (screenshot default ON)
  captureBtn.disabled = disabled;
  captureBtn.textContent = text;

  // Dual buttons (screenshot default OFF)
  captureNoScreenshotBtn.disabled = disabled;
  captureWithScreenshotBtn.disabled = disabled;

  if (text !== 'Capture Page') {
    // Update button text for both modes
    captureNoScreenshotBtn.innerHTML = `<span class="capture-btn-icon">📄</span> ${text}`;
  } else {
    captureNoScreenshotBtn.innerHTML = '<span class="capture-btn-icon">📄</span> Capture Page';
  }
}

/**
 * Add/remove class from all capture buttons
 */
function setCaptureButtonsClass(className, add) {
  if (add) {
    captureBtn.classList.add(className);
    captureNoScreenshotBtn.classList.add(className);
    captureWithScreenshotBtn.classList.add(className);
  } else {
    captureBtn.classList.remove(className);
    captureNoScreenshotBtn.classList.remove(className);
    captureWithScreenshotBtn.classList.remove(className);
  }
}

/**
 * Capture page content
 * @param {boolean} includeScreenshot - Whether to capture a screenshot
 */
async function capturePage(includeScreenshot = true) {
  setCaptureButtonsState(true, 'Capturing...');
  hideErrorMessage();
  hideDuplicateDialog();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      throw new Error('No active tab found');
    }

    // Check if we can capture this page
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      throw new Error('Cannot capture Chrome system pages');
    }

    // Send message to content script for page content
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'capture' });

    // Capture screenshot if requested
    if (includeScreenshot) {
      const screenshot = await captureScreenshot(tab.windowId);
      if (screenshot) {
        response.screenshot = screenshot;
      }
    }

    if (response.error) {
      throw new Error(response.error);
    }

    // Determine target bundle based on auto-group setting
    const domain = getDomain(response.url);
    let targetBundle = null;

    if (settings.autoGroupByDomain) {
      // Try to find existing bundle for this domain
      targetBundle = findBundleForDomain(domain);
    }

    if (!targetBundle) {
      // Create new bundle
      const bundleName = settings.autoGroupByDomain ? domain : `Bundle ${bundles.length + 1}`;
      targetBundle = createBundle(bundleName);
      if (!targetBundle) {
        setCaptureButtonsState(false, 'Capture Page');
        return;
      }
    }

    // Check for duplicate URL in target bundle
    const duplicateIndex = findDuplicateInBundle(targetBundle.id, response.url);

    if (duplicateIndex >= 0) {
      // Show duplicate dialog
      const existingPage = targetBundle.pages[duplicateIndex];
      pendingCapture = {
        capture: response,
        bundleId: targetBundle.id,
        duplicateIndex,
      };
      showDuplicateDialog(existingPage.editedTitle || existingPage.title);

      setCaptureButtonsState(false, 'Capture Page');
      return;
    }

    // Add to bundle
    const success = await addCaptureToBundle(targetBundle.id, response);

    if (success) {
      setCaptureButtonsState(true, 'Added!');
      setCaptureButtonsClass('success', true);
      const totalPages = bundles.reduce((sum, b) => sum + (b.pages?.length || 0), 0);
      showToast(`Added to "${targetBundle.name}" (${totalPages} total page${totalPages !== 1 ? 's' : ''})`, 'success');

      setTimeout(() => {
        setCaptureButtonsState(false, 'Capture Page');
        setCaptureButtonsClass('success', false);
      }, 1500);
    } else {
      setCaptureButtonsState(false, 'Capture Page');
    }
  } catch (err) {
    console.error('Capture error:', err);

    if (isConnectionError(err)) {
      showErrorMessage(
        'Could not connect to page',
        'Please refresh this page first, then try capturing again.'
      );
      showToast('Refresh the page first', 'error');
    } else {
      showToast(err.message, 'error');
    }

    setCaptureButtonsState(true, 'Retry');
    setCaptureButtonsClass('error', true);

    setTimeout(() => {
      setCaptureButtonsState(false, 'Capture Page');
      setCaptureButtonsClass('error', false);
    }, 2000);
  }
}

/**
 * Add screenshot to the current capture in detail view
 */
async function addScreenshotToCurrentCapture() {
  const bundle = getCurrentBundle();
  if (!bundle || currentPageIndex === null || currentPageIndex >= bundle.pages.length) {
    showToast('No capture selected', 'error');
    return;
  }

  const capture = bundle.pages[currentPageIndex];

  // Already has screenshot
  if (capture.screenshot) {
    showToast('Screenshot already exists', 'error');
    return;
  }

  // Disable button while capturing
  addScreenshotBtn.disabled = true;
  addScreenshotBtn.innerHTML = '<span class="capture-btn-icon">📸</span> Capturing...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.windowId) {
      throw new Error('No active tab found');
    }

    const screenshot = await captureScreenshot(tab.windowId);

    if (!screenshot) {
      throw new Error('Failed to capture screenshot');
    }

    // Add screenshot to capture
    capture.screenshot = screenshot;
    await saveToStorage();

    // Update the detail view
    renderScreenshot(capture);

    showToast('Screenshot added', 'success');
  } catch (err) {
    console.error('Add screenshot error:', err);
    showToast(err.message || 'Failed to add screenshot', 'error');
  } finally {
    addScreenshotBtn.disabled = false;
    addScreenshotBtn.innerHTML = '<span class="capture-btn-icon">📸</span> Add Screenshot';
  }
}

/**
 * Handle duplicate replace
 */
async function handleDuplicateReplace() {
  if (!pendingCapture) return;

  const { capture, bundleId, duplicateIndex } = pendingCapture;
  hideDuplicateDialog();

  const success = await addCaptureToBundle(bundleId, capture, duplicateIndex);
  if (success) {
    showToast('Replaced existing page in bundle', 'success');
  }

  pendingCapture = null;
}

/**
 * Handle duplicate skip
 */
function handleDuplicateSkip() {
  hideDuplicateDialog();
  showToast('Page skipped (already in bundle)', 'success');
  pendingCapture = null;
}

/**
 * Move page to another bundle (from detail view dropdown)
 */
async function movePageToBundle(targetBundleId) {
  if (!targetBundleId || !currentBundleId || currentPageIndex === null) return;

  const sourceBundle = getCurrentBundle();
  const targetBundle = getBundleById(targetBundleId);
  if (!sourceBundle || !targetBundle) return;

  // Check target bundle limit
  if (targetBundle.pages.length >= MAX_BUNDLE_PAGES) {
    showToast(`Target bundle is full (${MAX_BUNDLE_PAGES} pages max)`, 'error');
    return;
  }

  // Remove from source and add to target
  const page = sourceBundle.pages.splice(currentPageIndex, 1)[0];
  targetBundle.pages.push(page);

  // Expand target bundle
  targetBundle.expanded = true;

  await saveToStorage();

  // Go back to bundles view
  switchView('bundles');
  renderBundlesList();

  showToast(`Moved to "${targetBundle.name}"`, 'success');
}

// Event Listeners - Settings
settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('visible');
  settingsBtn.classList.toggle('active');
});

/**
 * Refresh page data - reload lookup, tags, event types, and distances from API
 */
async function refreshPageData() {
  if (refreshBtn.classList.contains('loading')) return; // Prevent double-click

  refreshBtn.classList.add('loading');

  try {
    // Clear cached editor options to force reload
    availableTags = [];
    availableEventTypes = [];
    availableDistances = [];

    // Sync with API (refresh local cache)
    const syncResult = await syncWithApi();
    if (syncResult) {
      console.log('[EventAtlas] Refresh - Sync completed:', {
        events: syncResult.events?.length || 0,
        organizerLinks: syncResult.organizer_links?.length || 0,
      });
    }

    // Update URL status (will call lookup API and potentially show event editor)
    await updateUrlStatus();

    // If we have an event editor visible, reload its options
    if (currentMatchedEvent) {
      await loadEditorOptions();
      // Re-render editor with fresh data
      renderTagsChips();
      renderDistanceButtons();
      renderSelectedDistances();
    }

    showToast('Page data refreshed', 'success');
  } catch (error) {
    console.error('[EventAtlas] Refresh error:', error);
    showToast('Failed to refresh data', 'error');
  } finally {
    refreshBtn.classList.remove('loading');
  }
}

refreshBtn.addEventListener('click', refreshPageData);

autoGroupSetting.addEventListener('change', async () => {
  settings.autoGroupByDomain = autoGroupSetting.checked;
  await saveToStorage();
});

screenshotDefaultSetting.addEventListener('change', async () => {
  settings.captureScreenshotByDefault = screenshotDefaultSetting.checked;
  await saveToStorage();
  updateCaptureButtonsVisibility();
});

// Event Listeners - API Settings (clear status on change, but don't auto-save)
apiUrlSetting.addEventListener('input', () => {
  connectionStatus.textContent = '';
  connectionStatus.className = 'connection-status';
});

apiTokenSetting.addEventListener('input', () => {
  connectionStatus.textContent = '';
  connectionStatus.className = 'connection-status';
});

// Toggle token visibility (show/hide password)
toggleTokenVisibility.addEventListener('click', () => {
  const isPassword = apiTokenSetting.type === 'password';
  apiTokenSetting.type = isPassword ? 'text' : 'password';
  toggleTokenVisibility.querySelector('.eye-icon').textContent = isPassword ? '🙈' : '👁';
  toggleTokenVisibility.title = isPassword ? 'Hide token' : 'Show token';
});

// Save Settings button - saves all API settings at once
saveSettingsBtn.addEventListener('click', async () => {
  // Collect values from form
  settings.apiUrl = apiUrlSetting.value.trim();
  settings.apiToken = apiTokenSetting.value.trim();
  settings.syncMode = syncModeSetting.value;
  settings.screenshotUploadTiming = screenshotUploadTimingSetting.value;

  // Collect distance presets from toggle chips
  const defaults = {};
  if (distancePresetToggles) {
    const chips = distancePresetToggles.querySelectorAll('.distance-preset-chip');
    chips.forEach((chip) => {
      const value = parseInt(chip.dataset.value, 10);
      defaults[value] = chip.classList.contains('enabled');
    });
  }

  // Parse custom distances from input
  const customString = customDistancePresetsSetting.value.trim();
  const customDistances = [];
  if (customString) {
    const parts = customString.split(',');
    for (const part of parts) {
      const value = parseInt(part.trim(), 10);
      if (!isNaN(value) && value >= 1 && value <= 1000) {
        if (!customDistances.includes(value)) {
          customDistances.push(value);
        }
      }
    }
  }

  // Update distancePresets in settings
  settings.distancePresets = {
    defaults: defaults,
    custom: customDistances,
  };

  // Save to storage
  await saveToStorage();

  // Reload editor options if API is configured (to apply new distance presets)
  if (settings.apiUrl && settings.apiToken) {
    // Reset available distances to trigger reload
    availableDistances = [];
  }

  // Show saved feedback
  saveSettingsBtn.textContent = 'Saved!';
  saveSettingsBtn.classList.add('saved');

  setTimeout(() => {
    saveSettingsBtn.textContent = 'Save Settings';
    saveSettingsBtn.classList.remove('saved');
  }, 1500);

  // Trigger sync if API is configured
  if (settings.apiUrl && settings.apiToken) {
    syncWithApi().then((result) => {
      if (result) {
        updateUrlStatus();
      }
    });
  }
});

testConnectionBtn.addEventListener('click', testConnection);

/**
 * Test API connection (reads directly from form fields, not saved settings)
 */
async function testConnection() {
  const apiUrl = apiUrlSetting.value.trim();
  const apiToken = apiTokenSetting.value.trim();

  // Validate form fields
  if (!apiUrl) {
    connectionStatus.textContent = 'Enter API URL';
    connectionStatus.className = 'connection-status error';
    return;
  }

  if (!apiToken) {
    connectionStatus.textContent = 'Enter API Token';
    connectionStatus.className = 'connection-status error';
    return;
  }

  // Show loading state
  testConnectionBtn.disabled = true;
  connectionStatus.textContent = 'Testing...';
  connectionStatus.className = 'connection-status loading';

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
      connectionStatus.textContent = 'Connected!';
      connectionStatus.className = 'connection-status success';
    } else if (response.status === 401) {
      connectionStatus.textContent = 'Invalid token';
      connectionStatus.className = 'connection-status error';
    } else if (response.status === 404) {
      connectionStatus.textContent = 'Endpoint not found';
      connectionStatus.className = 'connection-status error';
    } else {
      connectionStatus.textContent = `Error ${response.status}`;
      connectionStatus.className = 'connection-status error';
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      connectionStatus.textContent = 'Timeout';
      connectionStatus.className = 'connection-status error';
    } else {
      connectionStatus.textContent = 'Connection failed';
      connectionStatus.className = 'connection-status error';
    }
    console.error('Connection test error:', error);
  } finally {
    testConnectionBtn.disabled = false;
  }
}

// Event Listeners - Bundles view
// Single button (when screenshot default is ON) - always captures with screenshot
captureBtn.addEventListener('click', () => capturePage(true));

// Dual buttons (when screenshot default is OFF)
captureNoScreenshotBtn.addEventListener('click', () => capturePage(false));
captureWithScreenshotBtn.addEventListener('click', () => capturePage(true));
newBundleBtn.addEventListener('click', async () => {
  const name = `Bundle ${bundles.length + 1}`;
  const newBundle = createBundle(name);
  if (newBundle) {
    await saveToStorage();
    renderBundlesList();
    showToast(`Created "${name}"`, 'success');
  }
});
clearAllBundlesBtn.addEventListener('click', clearAllBundles);

// Event Listeners - Duplicate dialog
duplicateReplace.addEventListener('click', handleDuplicateReplace);
duplicateSkip.addEventListener('click', handleDuplicateSkip);

// Event Listeners - Navigation
backNav.addEventListener('click', () => {
  if (currentView === 'detail') {
    saveCurrentDetail();
    switchView('bundles');
    renderBundlesList();
  }
});

// Event Listeners - Detail view
copyBtn.addEventListener('click', copySingleToClipboard);
removeBtn.addEventListener('click', removeCurrentFromBundle);
addScreenshotBtn.addEventListener('click', addScreenshotToCurrentCapture);

// Event Listeners - Link Discovery
if (scanPageLinksBtn) {
  scanPageLinksBtn.addEventListener('click', scanPageForLinks);
}

if (selectAllNewLinks) {
  selectAllNewLinks.addEventListener('change', (e) => {
    if (e.target.checked) {
      selectedNewLinks = new Set(newDiscoveredLinks);
    } else {
      selectedNewLinks = new Set();
    }
    // Update all checkboxes
    newLinksList.querySelectorAll('.new-link-checkbox').forEach((cb) => {
      cb.checked = e.target.checked;
    });
    updateSelectedLinksCount();
  });
}

if (addNewLinksBtn) {
  addNewLinksBtn.addEventListener('click', addNewLinksToPipeline);
}

textToggle.addEventListener('click', () => {
  const bundle = getCurrentBundle();
  if (!bundle || currentPageIndex === null || currentPageIndex >= bundle.pages.length) return;

  textExpanded = !textExpanded;
  const fullText = bundle.pages[currentPageIndex].text || '';
  textPreview.textContent = textExpanded ? fullText : fullText.substring(0, 500) + (fullText.length > 500 ? '...' : '');
  textToggle.textContent = textExpanded ? 'Show less' : 'Show more';
  textPreview.classList.toggle('expanded', textExpanded);
});

// Move to bundle select
moveBundleSelect.addEventListener('change', async () => {
  const targetBundleId = moveBundleSelect.value;
  if (targetBundleId) {
    await movePageToBundle(targetBundleId);
    moveBundleSelect.value = '';
  }
});

// Save edits on change
editTitle.addEventListener('change', saveCurrentDetail);
editUrl.addEventListener('change', saveCurrentDetail);
includeHtml.addEventListener('change', saveCurrentDetail);
includeImages.addEventListener('change', saveCurrentDetail);
includeScreenshot.addEventListener('change', saveCurrentDetail);

// Screenshot modal events
screenshotThumb.addEventListener('click', () => {
  const bundle = getCurrentBundle();
  if (bundle && currentPageIndex !== null && currentPageIndex < bundle.pages.length) {
    const capture = bundle.pages[currentPageIndex];
    if (capture.screenshot) {
      openScreenshotModal(capture.screenshot);
    }
  }
});

screenshotModalClose.addEventListener('click', closeScreenshotModal);

screenshotModal.addEventListener('click', (e) => {
  // Close modal if clicking outside the image
  if (e.target === screenshotModal) {
    closeScreenshotModal();
  }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && screenshotModal.classList.contains('visible')) {
    closeScreenshotModal();
  }
});

// Listen for tab changes
chrome.tabs.onActivated.addListener(async (_activeInfo) => {
  await updateTabInfo();
  hideErrorMessage();
  hideDuplicateDialog();
});

// Listen for tab URL/title changes
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, _tab) => {
  if (changeInfo.title || changeInfo.url) {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.id === tabId) {
      await updateTabInfo();
      hideErrorMessage();
      hideDuplicateDialog();
    }
  }
});

// ========================================
// Tab Navigation & Event List Functions
// ========================================

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Switch between tabs (Current/Event List)
 */
function switchMainTab(tabName) {
  activeTab = tabName;

  // Update tab buttons
  if (tabNavigation) {
    tabNavigation.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
  }

  // Toggle views
  if (bundlesView) bundlesView.style.display = tabName === 'current' ? 'block' : 'none';
  if (eventListView) eventListView.style.display = tabName === 'event-list' ? 'block' : 'none';

  // Hide back nav when on event list
  if (backNav) backNav.classList.remove('visible');

  // Fetch event list if switching to it and cache is empty/stale
  if (tabName === 'event-list' && eventListCache.length === 0) {
    fetchEventList();
  }
}

/**
 * Fetch event list from API
 */
async function fetchEventList() {
  if (!settings.apiUrl || !settings.apiToken) {
    showEventListEmpty('Please configure API settings');
    return;
  }

  showEventListLoading();

  try {
    const params = new URLSearchParams();
    if (filterState.missingTags) params.append('missing_tags', '1');
    if (filterState.missingDistances) params.append('missing_distances', '1');
    params.append('filter_mode', filterState.mode);

    // Add starts_from filter if set
    const startsFromDate = getStartsFromDate(filterState.startsFrom);
    if (startsFromDate) {
      params.append('starts_from', startsFromDate);
    }

    const response = await fetch(`${settings.apiUrl}/api/extension/event-list?${params}`, {
      headers: {
        Authorization: `Bearer ${settings.apiToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) throw new Error('Failed to fetch event list');

    const data = await response.json();
    eventListCache = data.events || [];
    eventListLastFetched = Date.now();

    renderEventList();
  } catch (error) {
    console.error('[EventAtlas] Event list fetch error:', error);
    showEventListEmpty('Error loading events');
  }
}

/**
 * Render the event list
 */
function renderEventList() {
  if (!eventListContainer) return;

  if (eventListLoading) eventListLoading.style.display = 'none';
  eventListContainer.innerHTML = '';

  if (eventListCache.length === 0) {
    if (eventListEmpty) {
      eventListEmpty.textContent = 'No events match your filters';
      eventListEmpty.style.display = 'block';
    }
    return;
  }

  if (eventListEmpty) eventListEmpty.style.display = 'none';

  eventListCache.forEach((event) => {
    const item = document.createElement('div');
    item.className = 'event-list-item';
    const startDate = event.start_datetime ? formatEventDate(event.start_datetime) : '';
    item.innerHTML = `
      <div class="event-list-item-header">
        <div class="event-list-item-title">${escapeHtml(event.name)}</div>
        ${startDate ? `<div class="event-list-item-date">${escapeHtml(startDate)}</div>` : ''}
      </div>
      <div class="event-list-item-url">${escapeHtml(event.primary_url || '')}</div>
      <div class="event-list-item-meta">
        ${formatEventType(event.event_type)}
        ${formatTags(event.tags || [])}
        ${formatDistances(event.distances || [])}
      </div>
      <div class="event-list-item-missing">${formatMissingBadges(event.missing || [])}</div>
    `;
    item.addEventListener('click', () => navigateToEvent(event));
    eventListContainer.appendChild(item);
  });
}

/**
 * Format missing badges HTML
 */
function formatMissingBadges(missing) {
  return missing.map((m) => `<span class="missing-badge">${escapeHtml(m)}</span>`).join('');
}

/**
 * Format event type badge
 */
function formatEventType(eventType) {
  if (!eventType) return '';
  return `<span class="meta-badge meta-type">${escapeHtml(eventType)}</span>`;
}

/**
 * Format tags with "1 tag + x more" pattern
 */
function formatTags(tags) {
  if (!tags || tags.length === 0) return '';
  const firstTag = tags[0];
  const moreCount = tags.length - 1;
  let html = `<span class="meta-badge meta-tag">${escapeHtml(firstTag)}</span>`;
  if (moreCount > 0) {
    html += `<span class="meta-more">+${moreCount}</span>`;
  }
  return html;
}

/**
 * Format distances array
 */
function formatDistances(distances) {
  if (!distances || distances.length === 0) return '';
  const formatted = distances.map((d) => `${d}km`).join(', ');
  return `<span class="meta-badge meta-distance">${escapeHtml(formatted)}</span>`;
}

/**
 * Format a date as "Jan 1, 2026"
 */
function formatEventDate(dateString) {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * Get the first day of a month offset from now
 * @param {number} monthsOffset - 0 for this month, 1 for next month, etc.
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
function getFirstOfMonth(monthsOffset) {
  const date = new Date();
  date.setMonth(date.getMonth() + monthsOffset);
  date.setDate(1);
  return date.toISOString().split('T')[0];
}

/**
 * Get a month label like "Jan 2026"
 */
function getMonthLabel(monthsOffset) {
  const date = new Date();
  date.setMonth(date.getMonth() + monthsOffset);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Build the "Starts from" filter options with dynamic month labels
 */
function buildStartsFromOptions() {
  return [
    { value: '', label: 'All dates' },
    { value: 'this_month', label: `${getMonthLabel(0)}+` },
    { value: 'next_month', label: `${getMonthLabel(1)}+` },
    { value: '2_months', label: `${getMonthLabel(2)}+` },
    { value: '3_months', label: `${getMonthLabel(3)}+` },
    { value: '6_months', label: `${getMonthLabel(6)}+` },
    { value: 'custom', label: 'Custom...' },
  ];
}

/**
 * Convert filter preset to actual ISO date
 */
function getStartsFromDate(presetOrDate) {
  if (!presetOrDate) return null;

  switch (presetOrDate) {
    case 'this_month': return getFirstOfMonth(0);
    case 'next_month': return getFirstOfMonth(1);
    case '2_months': return getFirstOfMonth(2);
    case '3_months': return getFirstOfMonth(3);
    case '6_months': return getFirstOfMonth(6);
    default:
      // Assume it's an ISO date string
      if (/^\d{4}-\d{2}-\d{2}$/.test(presetOrDate)) {
        return presetOrDate;
      }
      return null;
  }
}

/**
 * Save filter state to storage
 */
async function saveFilterState() {
  try {
    await chrome.storage.local.set({ [FILTER_STATE_KEY]: filterState });
  } catch (err) {
    console.error('Error saving filter state:', err);
  }
}

/**
 * Load filter state from storage
 */
async function loadFilterState() {
  try {
    const result = await chrome.storage.local.get([FILTER_STATE_KEY]);
    if (result[FILTER_STATE_KEY]) {
      filterState = { ...filterState, ...result[FILTER_STATE_KEY] };
    }
  } catch (err) {
    console.error('Error loading filter state:', err);
  }
}

/**
 * Update the "Starts from" dropdown options
 */
function updateStartsFromDropdown() {
  const dropdown = document.getElementById('filterStartsFrom');
  if (!dropdown) return;

  const options = buildStartsFromOptions();
  dropdown.innerHTML = options.map(opt =>
    `<option value="${opt.value}">${escapeHtml(opt.label)}</option>`
  ).join('');

  // Set current value
  if (filterState.startsFrom) {
    // Check if it's a preset
    const presets = ['this_month', 'next_month', '2_months', '3_months', '6_months'];
    if (presets.includes(filterState.startsFrom)) {
      dropdown.value = filterState.startsFrom;
    } else {
      dropdown.value = 'custom';
    }
  } else {
    dropdown.value = '';
  }
}

/**
 * Show loading state for event list
 */
function showEventListLoading() {
  if (eventListContainer) eventListContainer.innerHTML = '';
  if (eventListEmpty) eventListEmpty.style.display = 'none';
  if (eventListLoading) eventListLoading.style.display = 'block';
}

/**
 * Show empty state for event list
 */
function showEventListEmpty(message) {
  if (eventListContainer) eventListContainer.innerHTML = '';
  if (eventListLoading) eventListLoading.style.display = 'none';
  if (eventListEmpty) {
    eventListEmpty.textContent = message || 'No events match your filters';
    eventListEmpty.style.display = 'block';
  }
}

/**
 * Navigate to an event URL and optionally switch to Current tab
 */
async function navigateToEvent(event) {
  // Mark as visited if we have the link ID
  if (event.primary_link_id && settings.apiUrl && settings.apiToken) {
    try {
      await fetch(`${settings.apiUrl}/api/extension/event-list/mark-visited`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${settings.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ event_link_id: event.primary_link_id }),
      });
    } catch (e) {
      console.warn('[EventAtlas] Failed to mark visit:', e);
    }
  }

  // Navigate browser to URL
  if (event.primary_url) {
    chrome.tabs.update({ url: event.primary_url });
  }

  // Auto-switch to Current tab if enabled
  if (settings.autoSwitchTab) {
    switchMainTab('current');
  }
}

/**
 * Setup background refresh timer for event list
 */
function setupEventListRefresh() {
  if (eventListRefreshTimer) {
    clearInterval(eventListRefreshTimer);
    eventListRefreshTimer = null;
  }

  const interval = (settings.eventListRefreshInterval || 0) * 60 * 1000;

  if (interval > 0) {
    eventListRefreshTimer = setInterval(() => {
      if (activeTab === 'event-list') {
        fetchEventList();
      }
    }, interval);
  }
}

// Event Listeners - Tab Navigation
if (tabNavigation) {
  tabNavigation.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchMainTab(btn.dataset.tab));
  });
}

// Event Listeners - Event List Filters
if (filterMissingTags) {
  filterMissingTags.addEventListener('change', async (e) => {
    filterState.missingTags = e.target.checked;
    await saveFilterState();
    fetchEventList();
  });
}

if (filterMissingDistances) {
  filterMissingDistances.addEventListener('change', async (e) => {
    filterState.missingDistances = e.target.checked;
    await saveFilterState();
    fetchEventList();
  });
}

// Starts from filter dropdown
const filterStartsFrom = document.getElementById('filterStartsFrom');
const customDateInput = document.getElementById('filterCustomDate');
const customDateContainer = document.getElementById('customDateContainer');

if (filterStartsFrom) {
  filterStartsFrom.addEventListener('change', async (e) => {
    const value = e.target.value;
    if (value === 'custom') {
      // Show custom date picker
      if (customDateContainer) customDateContainer.style.display = 'block';
      // Set default to first of next month if not already set
      if (customDateInput && !customDateInput.value) {
        customDateInput.value = getFirstOfMonth(1);
      }
      // Don't update filter state yet - wait for date input
    } else {
      // Hide custom date picker
      if (customDateContainer) customDateContainer.style.display = 'none';
      filterState.startsFrom = value || null;
      await saveFilterState();
      fetchEventList();
    }
  });
}

if (customDateInput) {
  customDateInput.addEventListener('change', async (e) => {
    filterState.startsFrom = e.target.value || null;
    await saveFilterState();
    fetchEventList();
  });
}

// Filter mode toggle
document.querySelectorAll('.filter-mode-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.filter-mode-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    filterState.mode = btn.dataset.mode;
    await saveFilterState();
    fetchEventList();
  });
});

// Refresh button
if (refreshEventListBtn) {
  refreshEventListBtn.addEventListener('click', fetchEventList);
}

// Event List Settings listeners
if (autoSwitchTabSetting) {
  autoSwitchTabSetting.addEventListener('change', async () => {
    settings.autoSwitchTab = autoSwitchTabSetting.checked;
    await saveToStorage();
  });
}

if (eventListRefreshIntervalSetting) {
  eventListRefreshIntervalSetting.addEventListener('change', async () => {
    settings.eventListRefreshInterval = parseInt(eventListRefreshIntervalSetting.value, 10);
    await saveToStorage();
    setupEventListRefresh();
  });
}

// ========================================
// Event Editor Functions
// ========================================

/**
 * Fetch available tags from API
 */
async function fetchTags() {
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
 */
async function fetchEventTypes() {
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
 */
async function fetchDistances() {
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

/**
 * Migrate old customDistancePresets string format to new toggle-based format
 * Old format: "25, -21, 35" where negative means remove default
 * New format: { defaults: { 5: true, ... }, custom: [25, 35] }
 */
function migrateOldDistancePresets(presetsString) {
  const result = {
    defaults: {
      5: true,
      10: true,
      21: true,
      42: true,
      50: true,
      100: true,
      161: true,
    },
    custom: [],
  };

  if (!presetsString || typeof presetsString !== 'string') {
    return result;
  }

  const parts = presetsString.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    const value = parseInt(trimmed, 10);

    if (isNaN(value) || value === 0) continue;

    if (value < 0) {
      // Negative: disable this default distance
      const removeValue = Math.abs(value);
      if (result.defaults[removeValue] !== undefined) {
        result.defaults[removeValue] = false;
      }
    } else {
      // Positive: add as custom distance (if not already a default)
      const defaultValues = [5, 10, 21, 42, 50, 100, 161];
      if (!defaultValues.includes(value) && !result.custom.includes(value)) {
        result.custom.push(value);
      }
    }
  }

  return result;
}

/**
 * Get distance presets from settings (with backwards compatibility)
 * Returns the distancePresets object with defaults and custom arrays
 */
function getDistancePresets() {
  // Handle new format
  if (settings.distancePresets && typeof settings.distancePresets === 'object') {
    return settings.distancePresets;
  }

  // Default: all defaults enabled, no custom
  return {
    defaults: {
      5: true,
      10: true,
      21: true,
      42: true,
      50: true,
      100: true,
      161: true,
    },
    custom: [],
  };
}

/**
 * Get custom distances from settings (parse from input field value if needed)
 */
function getCustomDistances() {
  const presets = getDistancePresets();

  // If we have the array already, return it
  if (Array.isArray(presets.custom)) {
    return presets.custom;
  }

  // Parse from comma-separated string (legacy or from input)
  const customString = customDistancePresetsSetting?.value || '';
  if (!customString.trim()) return [];

  const customDistances = [];
  const parts = customString.split(',');

  for (const part of parts) {
    const value = parseInt(part.trim(), 10);
    if (!isNaN(value) && value >= 1 && value <= 1000) {
      customDistances.push(value);
    }
  }

  return [...new Set(customDistances)]; // Remove duplicates
}

/**
 * Merge global distances with user presets (toggle-based)
 * - Filters out disabled defaults
 * - Adds custom distances
 */
function mergeDistancesWithPresets(globalDistances) {
  const presets = getDistancePresets();
  const defaults = presets.defaults || {};
  const customDistances = getCustomDistances();

  // Map of default value -> whether it's enabled
  // If a default isn't in the settings, it's enabled by default
  const defaultValues = [5, 10, 21, 42, 50, 100, 161];

  // Start with copy of global distances, filtering out disabled defaults
  let distances = globalDistances.filter(d => {
    // If it's a default distance, check if it's enabled
    if (defaultValues.includes(d.value)) {
      return defaults[d.value] !== false; // true or undefined = enabled
    }
    // Non-default distances from API are always included
    return true;
  });

  // Get set of existing values to avoid duplicates when adding
  const existingValues = new Set(distances.map(d => d.value));

  // Add custom distances that don't already exist
  for (const value of customDistances) {
    if (!existingValues.has(value)) {
      distances.push({
        value: value,
        label: `${value}K`,
        isUserPreset: true,
      });
      existingValues.add(value);
    }
  }

  // Sort by value
  distances.sort((a, b) => a.value - b.value);

  return distances;
}

/**
 * Load editor options (tags, event types, distances)
 */
async function loadEditorOptions() {
  // Fetch all in parallel
  const [tags, eventTypes, distances] = await Promise.all([
    fetchTags(),
    fetchEventTypes(),
    fetchDistances(),
  ]);

  availableTags = tags;
  availableEventTypes = eventTypes;

  // Merge global distances with user custom presets
  availableDistances = mergeDistancesWithPresets(distances);

  // Render event types pills
  renderEventTypePills();

  // Populate distances buttons (including user presets)
  renderDistanceButtonsFromOptions();
}

/**
 * Render event type pills
 */
function renderEventTypePills() {
  editorEventTypes.innerHTML = '';
  availableEventTypes.forEach((type) => {
    const btn = document.createElement('button');
    btn.className = 'event-type-btn' + (selectedEventTypeId === type.id ? ' selected' : '');
    btn.dataset.typeId = type.id;
    btn.textContent = type.name;
    btn.addEventListener('click', () => toggleEventType(type.id));
    editorEventTypes.appendChild(btn);
  });
}

/**
 * Toggle event type selection (single select)
 */
function toggleEventType(typeId) {
  selectedEventTypeId = selectedEventTypeId === typeId ? null : typeId;
  renderEventTypePills();
  // Clear validation error when user selects a type
  if (selectedEventTypeId) {
    document.getElementById('eventTypeError').classList.remove('visible');
  }
}

/**
 * Render distance buttons from availableDistances
 */
function renderDistanceButtonsFromOptions() {
  editorDistances.innerHTML = '';
  availableDistances.forEach((dist) => {
    const btn = document.createElement('button');
    btn.className = 'distance-btn' + (dist.isUserPreset ? ' user-preset' : '');
    btn.dataset.value = dist.value;
    btn.textContent = dist.label;
    btn.title = dist.isUserPreset ? 'Custom preset' : '';
    btn.addEventListener('click', () => toggleDistance(dist.value));
    editorDistances.appendChild(btn);
  });
}

/**
 * Toggle event editor accordion
 */
function toggleEventEditorAccordion() {
  eventEditorExpanded = !eventEditorExpanded;
  updateEventEditorAccordionState();
  saveEventEditorAccordionState();
}

/**
 * Update the visual state of the event editor accordion
 */
function updateEventEditorAccordionState() {
  if (eventEditorExpanded) {
    eventEditorChevron.classList.remove('collapsed');
    eventEditorContent.classList.remove('collapsed');
  } else {
    eventEditorChevron.classList.add('collapsed');
    eventEditorContent.classList.add('collapsed');
  }
}

/**
 * Save event editor accordion state to storage
 */
async function saveEventEditorAccordionState() {
  try {
    await chrome.storage.local.set({ eventEditorAccordionExpanded: eventEditorExpanded });
  } catch (err) {
    console.error('Error saving accordion state:', err);
  }
}

/**
 * Load event editor accordion state from storage
 */
async function loadEventEditorAccordionState() {
  try {
    const result = await chrome.storage.local.get(['eventEditorAccordionExpanded']);
    // If not set, default to expanded (true)
    eventEditorExpanded = result.eventEditorAccordionExpanded !== false;
  } catch (err) {
    console.error('Error loading accordion state:', err);
    eventEditorExpanded = true;
  }
}

/**
 * Show event editor with matched event data
 */
async function showEventEditor(event) {
  currentMatchedEvent = event;

  // Load accordion state from storage
  await loadEventEditorAccordionState();

  // Show editor and loading state
  eventEditor.classList.add('visible');
  editorLoading.style.display = 'flex';
  editorContent.style.display = 'none';

  // Set event name (legacy element, hidden)
  editorEventName.textContent = event.title || event.name || 'Untitled Event';

  // Populate accordion header with current page info
  // Use the current page title (from the tab), not the event name from API
  if (editorPageTitle) {
    editorPageTitle.textContent = pageTitleEl.textContent || 'Unknown Page';
  }
  if (editorPageUrl) {
    editorPageUrl.textContent = pageUrlEl.textContent || '';
  }

  // Set up the badge
  if (editorBadge) {
    editorBadge.innerHTML = '&#10003; Known Event';
  }

  // Set up the View link
  if (editorViewLink) {
    const adminUrl = buildAdminEditUrl(event.id);
    if (adminUrl) {
      editorViewLink.href = adminUrl;
      editorViewLink.style.display = 'inline';
      editorViewLink.onclick = (e) => {
        e.stopPropagation(); // Prevent accordion toggle
        window.open(adminUrl, '_blank');
        e.preventDefault();
      };
    } else {
      editorViewLink.style.display = 'none';
    }
  }

  // Always expand when showing for a new event match
  eventEditorExpanded = true;
  updateEventEditorAccordionState();

  // Load options if not already loaded
  if (availableEventTypes.length === 0 || availableTags.length === 0) {
    await loadEditorOptions();
  }

  // Set current values from event
  selectedEventTypeId = event.event_type_id || null;
  renderEventTypePills();

  // Set selected tags
  selectedTagIds = new Set((event.tags || []).map(t => t.id));
  renderTagsChips();

  // Set selected distances
  selectedDistanceValues = Array.isArray(event.distances_km) ? [...event.distances_km] : [];
  renderDistanceButtons();
  renderSelectedDistances();

  // Set notes
  editorNotes.value = event.notes || '';

  // Render saved screenshots
  renderSavedScreenshots(event.media || []);

  // Hide loading, show content
  editorLoading.style.display = 'none';
  editorContent.style.display = 'block';
}

/**
 * Hide event editor
 */
function hideEventEditor() {
  eventEditor.classList.remove('visible');
  currentMatchedEvent = null;
  selectedTagIds = new Set();
  selectedDistanceValues = [];
}

/**
 * Render tag chips
 */
function renderTagsChips() {
  editorTags.innerHTML = '';

  availableTags.forEach((tag) => {
    const chip = document.createElement('span');
    chip.className = 'tag-chip' + (selectedTagIds.has(tag.id) ? ' selected' : '');
    chip.dataset.tagId = tag.id;

    const checkmark = document.createElement('span');
    checkmark.className = 'tag-chip-check';
    checkmark.textContent = selectedTagIds.has(tag.id) ? '\u2713' : '';

    chip.appendChild(checkmark);

    // Tag name
    const nameSpan = document.createElement('span');
    nameSpan.textContent = tag.name;
    chip.appendChild(nameSpan);

    // Usage count (if available)
    if (typeof tag.events_count === 'number') {
      const countSpan = document.createElement('span');
      countSpan.className = 'tag-chip-count';
      countSpan.textContent = ` (${tag.events_count})`;
      chip.appendChild(countSpan);
    }

    chip.addEventListener('click', () => toggleTag(tag.id));
    editorTags.appendChild(chip);
  });

  // Render the create new tag input
  renderCreateTagInput();
}

/**
 * Render create new tag input
 */
function renderCreateTagInput() {
  // Check if input container already exists
  let inputContainer = document.getElementById('createTagContainer');
  if (!inputContainer) {
    inputContainer = document.createElement('div');
    inputContainer.id = 'createTagContainer';
    inputContainer.className = 'create-tag-container';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'createTagInput';
    input.className = 'create-tag-input';
    input.placeholder = 'Create new tag...';

    const errorEl = document.createElement('div');
    errorEl.id = 'createTagError';
    errorEl.className = 'create-tag-error';
    errorEl.style.display = 'none';

    inputContainer.appendChild(input);
    inputContainer.appendChild(errorEl);

    // Insert after the tags container
    editorTags.parentElement.appendChild(inputContainer);

    // Event listeners
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        createNewTag(input.value.trim());
      }
    });

    input.addEventListener('blur', () => {
      const value = input.value.trim();
      if (value) {
        createNewTag(value);
      }
    });

    // Clear error on input
    input.addEventListener('input', () => {
      const errorEl = document.getElementById('createTagError');
      if (errorEl) {
        errorEl.style.display = 'none';
      }
    });
  }
}

/**
 * Create a new tag via API
 */
async function createNewTag(name) {
  if (!name) return;

  if (!settings.apiUrl || !settings.apiToken) {
    showToast('API not configured', 'error');
    return;
  }

  const input = document.getElementById('createTagInput');
  const errorEl = document.getElementById('createTagError');

  // Disable input while creating
  if (input) {
    input.disabled = true;
  }

  try {
    const response = await fetch(`${settings.apiUrl}/api/extension/tags`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.apiToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData.message || errorData.errors?.name?.[0] || `Failed: ${response.status}`;
      throw new Error(message);
    }

    const data = await response.json();

    if (data.tag) {
      // Add the new tag to available tags
      availableTags.push(data.tag);

      // Auto-select the new tag
      selectedTagIds.add(data.tag.id);

      // Clear input
      if (input) {
        input.value = '';
      }

      // Re-render tags
      renderTagsChips();

      showToast(`Tag "${data.tag.name}" created`, 'success');
    }
  } catch (error) {
    console.error('[EventAtlas] Error creating tag:', error);

    // Show error message below input
    if (errorEl) {
      errorEl.textContent = error.message;
      errorEl.style.display = 'block';
    }

    showToast(error.message || 'Failed to create tag', 'error');
  } finally {
    if (input) {
      input.disabled = false;
      input.focus();
    }
  }
}

/**
 * Toggle tag selection
 */
function toggleTag(tagId) {
  if (selectedTagIds.has(tagId)) {
    selectedTagIds.delete(tagId);
  } else {
    selectedTagIds.add(tagId);
  }
  renderTagsChips();
}

/**
 * Render distance buttons (update selected state)
 * Preserves user-preset class while toggling selected state
 */
function renderDistanceButtons() {
  const buttons = editorDistances.querySelectorAll('.distance-btn');
  buttons.forEach((btn) => {
    const value = parseInt(btn.dataset.value, 10);
    const isUserPreset = btn.classList.contains('user-preset');

    if (selectedDistanceValues.includes(value)) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }

    // Ensure user-preset class is preserved
    if (isUserPreset && !btn.classList.contains('user-preset')) {
      btn.classList.add('user-preset');
    }
  });
}

/**
 * Toggle distance selection
 */
function toggleDistance(value) {
  const numValue = parseInt(value, 10);
  const index = selectedDistanceValues.indexOf(numValue);

  if (index >= 0) {
    selectedDistanceValues.splice(index, 1);
  } else {
    selectedDistanceValues.push(numValue);
  }

  // Sort distances
  selectedDistanceValues.sort((a, b) => a - b);

  renderDistanceButtons();
  renderSelectedDistances();
}

/**
 * Add custom distance
 */
function addCustomDistance() {
  const value = parseInt(customDistanceInput.value, 10);

  if (isNaN(value) || value < 1 || value > 1000) {
    showToast('Enter a valid distance (1-1000 km)', 'error');
    return;
  }

  if (!selectedDistanceValues.includes(value)) {
    selectedDistanceValues.push(value);
    selectedDistanceValues.sort((a, b) => a - b);
    renderDistanceButtons();
    renderSelectedDistances();
  }

  customDistanceInput.value = '';
}

/**
 * Remove a selected distance
 */
function removeDistance(value) {
  const numValue = parseInt(value, 10);
  const index = selectedDistanceValues.indexOf(numValue);

  if (index >= 0) {
    selectedDistanceValues.splice(index, 1);
    renderDistanceButtons();
    renderSelectedDistances();
  }
}

/**
 * Render selected distances chips
 */
function renderSelectedDistances() {
  selectedDistancesEl.innerHTML = '';

  if (selectedDistanceValues.length === 0) {
    return;
  }

  selectedDistanceValues.forEach((value) => {
    const chip = document.createElement('span');
    chip.className = 'selected-distance-chip';

    // Find label from available distances or use value + K
    const distObj = availableDistances.find(d => d.value === value);
    const label = distObj ? distObj.label : `${value}K`;

    chip.innerHTML = `${label} <span class="selected-distance-remove" data-value="${value}">&times;</span>`;

    chip.querySelector('.selected-distance-remove').addEventListener('click', (e) => {
      e.stopPropagation();
      removeDistance(value);
    });

    selectedDistancesEl.appendChild(chip);
  });
}

/**
 * Render saved screenshots with delete buttons
 */
function renderSavedScreenshots(media) {
  savedScreenshotsEl.innerHTML = '';

  // Filter for screenshots
  const screenshots = media.filter(m => m.type === 'screenshot' || m.type === 'Screenshot');

  // Render saved screenshots
  if (screenshots.length === 0 && pendingScreenshots.length === 0) {
    savedScreenshotsEl.innerHTML = '<div class="no-screenshots">No screenshots yet</div>';
    return;
  }

  screenshots.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'saved-screenshot-item';

    const img = document.createElement('img');
    img.src = item.thumbnail_url || item.file_url;
    img.alt = item.name || 'Screenshot';
    img.onerror = () => {
      div.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:10px;">Failed</div>';
    };

    div.appendChild(img);

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'screenshot-delete-btn';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.title = 'Delete screenshot';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteScreenshot(item.id);
    });
    div.appendChild(deleteBtn);

    // Click to open in lightbox modal
    div.addEventListener('click', () => {
      openScreenshotModal(item.file_url);
    });

    savedScreenshotsEl.appendChild(div);
  });

  // Render uploading screenshots (from upload queue)
  const uploadingForEvent = uploadQueue.filter(q =>
    q.eventId === currentMatchedEvent?.id &&
    q.status === 'uploading'
  );

  uploadingForEvent.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'saved-screenshot-item uploading';
    div.dataset.queueId = item.id;

    const img = document.createElement('img');
    img.src = item.thumbnail;
    img.alt = 'Uploading...';
    div.appendChild(img);

    // Overlay with progress
    const overlay = document.createElement('div');
    overlay.className = 'upload-overlay';
    overlay.innerHTML = `<span>${item.progress}%</span>`;
    div.appendChild(overlay);

    savedScreenshotsEl.appendChild(div);
  });

  // Render pending screenshots section if any
  if (pendingScreenshots.length > 0) {
    renderPendingScreenshots();
  }
}

/**
 * Render pending screenshots (for on_save mode)
 */
function renderPendingScreenshots() {
  // Create pending section if needed
  let pendingSection = savedScreenshotsEl.querySelector('.pending-screenshots-section');
  if (!pendingSection) {
    pendingSection = document.createElement('div');
    pendingSection.className = 'pending-screenshots-section';
    savedScreenshotsEl.appendChild(pendingSection);
  }

  pendingSection.innerHTML = '';

  // Header
  const header = document.createElement('div');
  header.className = 'pending-screenshots-header';
  header.innerHTML = `
    <span class="pending-screenshots-title">Pending Upload</span>
    <span class="pending-screenshots-count">${pendingScreenshots.length}</span>
  `;
  pendingSection.appendChild(header);

  // Grid
  const grid = document.createElement('div');
  grid.className = 'pending-screenshots-grid';

  pendingScreenshots.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'pending-screenshot-item';

    const img = document.createElement('img');
    img.src = item.data;
    img.alt = 'Pending screenshot';

    div.appendChild(img);

    // Pending badge
    const badge = document.createElement('span');
    badge.className = 'pending-badge';
    badge.textContent = 'Pending';
    div.appendChild(badge);

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'pending-screenshot-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove pending screenshot';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removePendingScreenshot(item.id);
    });
    div.appendChild(removeBtn);

    grid.appendChild(div);
  });

  pendingSection.appendChild(grid);
}

/**
 * Remove a pending screenshot
 */
function removePendingScreenshot(id) {
  pendingScreenshots = pendingScreenshots.filter(s => s.id !== id);
  // Re-render screenshots
  if (currentMatchedEvent) {
    renderSavedScreenshots(currentMatchedEvent.media || []);
  }
}

/**
 * Delete a saved screenshot via API
 */
async function deleteScreenshot(mediaId) {
  if (!currentMatchedEvent || !settings.apiUrl || !settings.apiToken) {
    showToast('Cannot delete - no event selected or API not configured', 'error');
    return;
  }

  // Confirm deletion
  if (!confirm('Are you sure you want to delete this screenshot?')) {
    return;
  }

  try {
    const response = await fetch(
      `${settings.apiUrl}/api/extension/events/${currentMatchedEvent.id}/screenshot/${mediaId}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${settings.apiToken}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Delete failed: ${response.status}`);
    }

    // Remove from local state
    if (currentMatchedEvent.media) {
      currentMatchedEvent.media = currentMatchedEvent.media.filter(m => m.id !== mediaId);
    }

    // Re-render
    renderSavedScreenshots(currentMatchedEvent.media || []);
    showToast('Screenshot deleted', 'success');

  } catch (error) {
    console.error('[EventAtlas] Error deleting screenshot:', error);
    showToast(error.message || 'Failed to delete screenshot', 'error');
  }
}

/**
 * Check if there are unsaved changes (pending screenshots)
 */
function hasUnsavedChanges() {
  return pendingScreenshots.length > 0;
}

/**
 * Show unsaved changes dialog
 */
function showUnsavedDialog(message) {
  if (message) {
    unsavedDialogText.textContent = message;
  } else {
    unsavedDialogText.textContent = 'You have pending screenshots that haven\'t been uploaded. What would you like to do?';
  }
  unsavedDialog.classList.add('visible');
}

/**
 * Hide unsaved changes dialog
 */
function hideUnsavedDialog() {
  unsavedDialog.classList.remove('visible');
  pendingUrlChange = null;
}

/**
 * Upload all pending screenshots
 */
async function uploadPendingScreenshots() {
  if (!currentMatchedEvent || pendingScreenshots.length === 0) {
    return true;
  }

  editorSaveBtn.disabled = true;
  editorSaveBtn.textContent = 'Uploading screenshots...';

  try {
    for (const pending of pendingScreenshots) {
      const response = await fetch(
        `${settings.apiUrl}/api/extension/events/${currentMatchedEvent.id}/screenshot`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${settings.apiToken}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image: pending.data,
            filename: pending.filename,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Upload failed: ${response.status}`);
      }

      const data = await response.json();

      // Add to current event's media
      if (data.media_asset) {
        if (!currentMatchedEvent.media) {
          currentMatchedEvent.media = [];
        }
        currentMatchedEvent.media.push(data.media_asset);
      }
    }

    // Clear pending screenshots
    pendingScreenshots = [];

    // Re-render
    renderSavedScreenshots(currentMatchedEvent.media || []);

    editorSaveBtn.textContent = 'Save Changes';
    editorSaveBtn.disabled = false;

    return true;
  } catch (error) {
    console.error('[EventAtlas] Error uploading pending screenshots:', error);
    showToast(error.message || 'Failed to upload screenshots', 'error');

    editorSaveBtn.textContent = 'Save Changes';
    editorSaveBtn.disabled = false;

    return false;
  }
}

/**
 * Discard all pending screenshots
 */
function discardPendingScreenshots() {
  pendingScreenshots = [];
  if (currentMatchedEvent) {
    renderSavedScreenshots(currentMatchedEvent.media || []);
  }
}

// ============================================================
// Upload Queue Functions
// ============================================================

/**
 * Generate a small thumbnail from base64 image data
 * Returns a scaled-down version for the queue display
 */
function generateThumbnail(imageData, maxSize = 96) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(maxSize / img.width, maxSize / img.height);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => {
      resolve(imageData); // Fallback to original if thumbnail fails
    };
    img.src = imageData;
  });
}

/**
 * Add item to upload queue and start upload
 */
async function addToUploadQueue(eventId, eventName, imageData, filename) {
  const id = generateId();
  const thumbnail = await generateThumbnail(imageData);

  const queueItem = {
    id,
    eventId,
    eventName,
    imageData,
    thumbnail,
    filename,
    status: 'uploading',
    progress: 0,
  };

  uploadQueue.push(queueItem);
  renderUploadQueue();

  // Re-render screenshots grid to show uploading item
  if (currentMatchedEvent && currentMatchedEvent.id === eventId) {
    renderSavedScreenshots(currentMatchedEvent.media || []);
  }

  // Start upload in background
  uploadQueueItem(queueItem);

  return queueItem;
}

/**
 * Upload a queue item with progress tracking using XMLHttpRequest
 */
function uploadQueueItem(queueItem) {
  const xhr = new XMLHttpRequest();

  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const progress = Math.round((e.loaded / e.total) * 100);
      updateQueueItemProgress(queueItem.id, progress);
    }
  });

  xhr.addEventListener('load', () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const data = JSON.parse(xhr.responseText);
        markQueueItemComplete(queueItem.id, data.media_asset);
      } catch {
        markQueueItemComplete(queueItem.id, null);
      }
    } else {
      let errorMessage = 'Upload failed';
      try {
        const errorData = JSON.parse(xhr.responseText);
        errorMessage = errorData.message || errorMessage;
      } catch {
        // Ignore parse errors
      }
      markQueueItemFailed(queueItem.id, errorMessage);
    }
  });

  xhr.addEventListener('error', () => {
    markQueueItemFailed(queueItem.id, 'Network error');
  });

  xhr.addEventListener('timeout', () => {
    markQueueItemFailed(queueItem.id, 'Upload timeout');
  });

  xhr.open('POST', `${settings.apiUrl}/api/extension/events/${queueItem.eventId}/screenshot`);
  xhr.setRequestHeader('Authorization', `Bearer ${settings.apiToken}`);
  xhr.setRequestHeader('Accept', 'application/json');
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 60000; // 60 second timeout

  xhr.send(JSON.stringify({
    image: queueItem.imageData,
    filename: queueItem.filename,
  }));
}

/**
 * Update progress for a queue item
 */
function updateQueueItemProgress(id, progress) {
  const item = uploadQueue.find(q => q.id === id);
  if (item) {
    item.progress = progress;
    updateQueueItemUI(id);

    // Also update grid overlay if visible
    const gridItem = savedScreenshotsEl?.querySelector(`[data-queue-id="${id}"] .upload-overlay span`);
    if (gridItem) {
      gridItem.textContent = `${progress}%`;
    }
  }
}

/**
 * Mark queue item as complete
 */
function markQueueItemComplete(id, mediaAsset) {
  const item = uploadQueue.find(q => q.id === id);
  if (item) {
    item.status = 'complete';
    item.progress = 100;
    item.mediaAsset = mediaAsset;
    item.completedAt = Date.now();
    updateQueueItemUI(id);

    // Add to current event's media if it's the same event
    if (currentMatchedEvent && currentMatchedEvent.id === item.eventId && mediaAsset) {
      if (!currentMatchedEvent.media) {
        currentMatchedEvent.media = [];
      }
      currentMatchedEvent.media.push(mediaAsset);
      renderSavedScreenshots(currentMatchedEvent.media);
    }

    // Remove from queue after animation completes (1.5s)
    setTimeout(() => {
      removeFromUploadQueue(id);
    }, 1500);
  }
}

/**
 * Mark queue item as failed
 */
function markQueueItemFailed(id, error) {
  const item = uploadQueue.find(q => q.id === id);
  if (item) {
    item.status = 'failed';
    item.error = error;
    updateQueueItemUI(id);
    showToast(`Upload failed: ${error}`, 'error');
  }
}

/**
 * Retry a failed upload
 */
function retryQueueItem(id) {
  const item = uploadQueue.find(q => q.id === id);
  if (item && item.status === 'failed') {
    item.status = 'uploading';
    item.progress = 0;
    item.error = null;
    updateQueueItemUI(id);
    uploadQueueItem(item);
  }
}

/**
 * Remove item from upload queue
 */
function removeFromUploadQueue(id) {
  uploadQueue = uploadQueue.filter(q => q.id !== id);
  renderUploadQueue();
}

/**
 * Render the entire upload queue UI
 */
function renderUploadQueue() {
  // Filter to only show active items (uploading or failed, or recently completed)
  const activeItems = uploadQueue.filter(q => q.status !== 'complete' || Date.now() - q.completedAt < 1500);

  // Show/hide queue based on content
  if (activeItems.length === 0) {
    uploadQueueEl.classList.remove('active');
    document.body.classList.remove('has-upload-queue');
    return;
  }

  uploadQueueEl.classList.add('active');
  document.body.classList.add('has-upload-queue');

  // Update count and title based on status
  const uploadingCount = uploadQueue.filter(q => q.status === 'uploading').length;
  const failedCount = uploadQueue.filter(q => q.status === 'failed').length;
  const queueTitle = uploadQueueEl.querySelector('.upload-queue-title');

  if (failedCount > 0 && uploadingCount === 0) {
    queueTitle.textContent = failedCount === 1 ? '1 upload failed' : `${failedCount} uploads failed`;
    uploadQueueCountEl.textContent = failedCount;
  } else if (uploadingCount > 0) {
    queueTitle.textContent = 'Uploading...';
    uploadQueueCountEl.textContent = uploadingCount;
  } else {
    queueTitle.textContent = 'Upload complete';
    uploadQueueCountEl.textContent = uploadQueue.length;
  }

  // Clear and rebuild items
  uploadQueueItemsEl.innerHTML = '';

  uploadQueue.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = `upload-queue-item ${item.status}`;
    itemEl.dataset.id = item.id;

    // Thumbnail image
    const img = document.createElement('img');
    img.src = item.thumbnail;
    img.alt = 'Uploading screenshot';
    itemEl.appendChild(img);

    // Progress ring (shown during upload)
    if (item.status === 'uploading') {
      const circumference = 2 * Math.PI * 10; // r=10
      const dashoffset = circumference - (item.progress / 100) * circumference;

      itemEl.innerHTML += `
        <svg class="progress-ring" width="24" height="24">
          <circle class="progress-ring-bg" cx="12" cy="12" r="10"/>
          <circle class="progress-ring-fill" cx="12" cy="12" r="10"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${dashoffset}"/>
        </svg>
      `;
    }

    // Check icon (shown on complete)
    const checkIcon = document.createElement('span');
    checkIcon.className = 'check-icon';
    checkIcon.textContent = '\u2714';
    itemEl.appendChild(checkIcon);

    // Retry button (shown on failure)
    if (item.status === 'failed') {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'retry-btn';
      retryBtn.innerHTML = '\u21bb';
      retryBtn.title = `Retry: ${item.error || 'Upload failed'}`;
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        retryQueueItem(item.id);
      });
      itemEl.appendChild(retryBtn);
    }

    // Event label
    const label = document.createElement('span');
    label.className = 'event-label';
    label.textContent = item.eventName || 'Event';
    label.title = item.eventName || 'Event';
    itemEl.appendChild(label);

    uploadQueueItemsEl.appendChild(itemEl);
  });
}

/**
 * Update a single queue item's UI (for progress updates)
 */
function updateQueueItemUI(id) {
  const item = uploadQueue.find(q => q.id === id);
  if (!item) return;

  const itemEl = uploadQueueItemsEl.querySelector(`[data-id="${id}"]`);
  if (!itemEl) {
    // Item not in DOM yet, do full render
    renderUploadQueue();
    return;
  }

  // Update class
  itemEl.className = `upload-queue-item ${item.status}`;

  // Update progress ring
  if (item.status === 'uploading') {
    const progressRing = itemEl.querySelector('.progress-ring-fill');
    if (progressRing) {
      const circumference = 2 * Math.PI * 10;
      const dashoffset = circumference - (item.progress / 100) * circumference;
      progressRing.setAttribute('stroke-dashoffset', dashoffset);
    }
  }
}

/**
 * Clear all items from upload queue (for testing/debug)
 */
function clearUploadQueue() {
  uploadQueue = [];
  renderUploadQueue();
}

// ============================================================
// End Upload Queue Functions
// ============================================================

/**
 * Clear validation errors from event editor fields
 */
function clearValidationErrors() {
  editorEventTypes.classList.remove('field-error');
  document.getElementById('eventTypeError').classList.remove('visible');
}

/**
 * Show validation error on a field
 */
function showFieldError(field, errorId) {
  field.classList.add('field-error');
  document.getElementById(errorId).classList.add('visible');
  field.focus();
}

/**
 * Save event changes to API
 */
async function saveEventChanges() {
  if (!currentMatchedEvent || !settings.apiUrl || !settings.apiToken) {
    showToast('Cannot save - no event selected or API not configured', 'error');
    return;
  }

  // Clear previous validation errors
  clearValidationErrors();

  // Validate required fields
  if (!selectedEventTypeId) {
    showFieldError(editorEventTypes, 'eventTypeError');
    showToast('Please select an event type', 'error');
    return;
  }

  editorSaveBtn.disabled = true;
  editorSaveBtn.textContent = 'Saving...';
  editorSaveBtn.classList.add('saving');

  try {
    // Upload pending screenshots first (if any)
    if (pendingScreenshots.length > 0) {
      editorSaveBtn.textContent = 'Uploading screenshots...';
      const uploadSuccess = await uploadPendingScreenshots();
      if (!uploadSuccess) {
        editorSaveBtn.textContent = 'Save Changes';
        editorSaveBtn.classList.remove('saving');
        editorSaveBtn.disabled = false;
        return;
      }
      editorSaveBtn.textContent = 'Saving...';
    }

    const payload = {
      event_type_id: selectedEventTypeId,
      tag_ids: Array.from(selectedTagIds),
      distances_km: selectedDistanceValues,
      notes: editorNotes.value || null,
    };

    const response = await fetch(`${settings.apiUrl}/api/extension/events/${currentMatchedEvent.id}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${settings.apiToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Save failed: ${response.status}`);
    }

    const data = await response.json();

    // Update current matched event with response
    if (data.event) {
      currentMatchedEvent = { ...currentMatchedEvent, ...data.event };
    }

    editorSaveBtn.textContent = 'Saved!';
    editorSaveBtn.classList.remove('saving');
    editorSaveBtn.classList.add('saved');
    showToast('Event updated successfully', 'success');

    setTimeout(() => {
      editorSaveBtn.textContent = 'Save Changes';
      editorSaveBtn.classList.remove('saved');
      editorSaveBtn.disabled = false;
    }, 1500);

  } catch (error) {
    console.error('[EventAtlas] Error saving event:', error);
    editorSaveBtn.textContent = 'Error';
    editorSaveBtn.classList.remove('saving');
    editorSaveBtn.classList.add('error');
    showToast(error.message || 'Failed to save changes', 'error');

    setTimeout(() => {
      editorSaveBtn.textContent = 'Save Changes';
      editorSaveBtn.classList.remove('error');
      editorSaveBtn.disabled = false;
    }, 2000);
  }
}

/**
 * Capture and upload screenshot for event
 * Respects the screenshotUploadTiming setting
 * Uses upload queue for immediate uploads with progress tracking
 */
async function captureAndUploadEventScreenshot() {
  console.log('[EventAtlas] captureAndUploadEventScreenshot called', {
    hasMatchedEvent: !!currentMatchedEvent,
    hasApiUrl: !!settings.apiUrl,
    hasApiToken: !!settings.apiToken,
  });

  if (!currentMatchedEvent || !settings.apiUrl || !settings.apiToken) {
    showToast('Cannot capture - no event selected or API not configured', 'error');
    return;
  }

  captureEventScreenshotBtn.disabled = true;
  captureEventScreenshotBtn.innerHTML = '<span>&#128247;</span> Capturing...';

  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.windowId) {
      throw new Error('No active tab found');
    }

    // Capture screenshot
    const screenshot = await captureScreenshot(tab.windowId);

    if (!screenshot) {
      throw new Error('Failed to capture screenshot');
    }

    const filename = `screenshot_${Date.now()}.png`;

    // Check upload timing setting
    if (settings.screenshotUploadTiming === 'on_save') {
      // Store locally as pending
      pendingScreenshots.push({
        id: generateId(),
        data: screenshot,
        filename: filename,
        capturedAt: new Date().toISOString(),
      });

      // Re-render to show pending screenshot
      renderSavedScreenshots(currentMatchedEvent.media || []);

      captureEventScreenshotBtn.innerHTML = '<span>&#10003;</span> Captured!';
      captureEventScreenshotBtn.classList.add('success');
      showToast('Screenshot captured (will upload on Save)', 'success');

      setTimeout(() => {
        captureEventScreenshotBtn.innerHTML = '<span>&#128247;</span> Screenshot';
        captureEventScreenshotBtn.classList.remove('success');
        captureEventScreenshotBtn.disabled = false;
      }, 1500);

      return;
    }

    // Immediate upload mode - use upload queue with progress
    // Store event info before adding to queue (in case user navigates away)
    const eventId = currentMatchedEvent.id;
    const eventName = currentMatchedEvent.name || 'Event';

    // Add to upload queue (optimistic UI - shows immediately)
    await addToUploadQueue(eventId, eventName, screenshot, filename);

    // Show quick success feedback on button
    captureEventScreenshotBtn.innerHTML = '<span>&#10003;</span> Queued!';
    captureEventScreenshotBtn.classList.add('success');
    showToast('Screenshot queued for upload', 'success');

    setTimeout(() => {
      captureEventScreenshotBtn.innerHTML = '<span>&#128247;</span> Screenshot';
      captureEventScreenshotBtn.classList.remove('success');
      captureEventScreenshotBtn.disabled = false;
    }, 1000);

  } catch (error) {
    console.error('[EventAtlas] Error capturing screenshot:', error);
    captureEventScreenshotBtn.innerHTML = '<span>&#128247;</span> Screenshot';
    captureEventScreenshotBtn.disabled = false;
    showToast(error.message || 'Failed to capture screenshot', 'error');
  }
}

// Event Editor Event Listeners
eventEditorAccordionHeader.addEventListener('click', toggleEventEditorAccordion);
editorSaveBtn.addEventListener('click', saveEventChanges);
addCustomDistanceBtn.addEventListener('click', addCustomDistance);

// Capture screenshot button in accordion - add defensive check
if (captureEventScreenshotBtn) {
  captureEventScreenshotBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent event from bubbling to accordion header
    console.log('[EventAtlas] Capture button clicked');
    captureAndUploadEventScreenshot();
  });
} else {
  console.error('[EventAtlas] captureEventScreenshotBtn not found in DOM');
}

// Capture HTML button in accordion - placeholder for future functionality
if (captureEventHtmlBtn) {
  captureEventHtmlBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // Prevent event from bubbling to accordion header
    console.log('[EventAtlas] Capture HTML button clicked');
    showToast('HTML capture coming soon', 'success');
  });
} else {
  console.error('[EventAtlas] captureEventHtmlBtn not found in DOM');
}

// Handle Enter key on custom distance input
customDistanceInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addCustomDistance();
  }
});

// Handle distance preset toggle chips in settings
if (distancePresetToggles) {
  distancePresetToggles.addEventListener('click', (e) => {
    const chip = e.target.closest('.distance-preset-chip');
    if (!chip) return;

    // Toggle enabled/disabled state
    const isCurrentlyEnabled = chip.classList.contains('enabled');
    chip.classList.toggle('enabled', !isCurrentlyEnabled);
    chip.classList.toggle('disabled', isCurrentlyEnabled);
  });
}

// Unsaved Changes Dialog Event Listeners
unsavedSaveBtn.addEventListener('click', async () => {
  hideUnsavedDialog();
  await saveEventChanges();
  // After save, proceed with the URL change
  lastKnownUrl = null; // Reset so next updateTabInfo works
  pendingScreenshots = []; // Clear any remaining pending (should be uploaded)
  await updateTabInfo();
});

unsavedDiscardBtn.addEventListener('click', async () => {
  hideUnsavedDialog();
  discardPendingScreenshots();
  lastKnownUrl = null; // Reset so next updateTabInfo works
  await updateTabInfo();
});

unsavedCancelBtn.addEventListener('click', () => {
  hideUnsavedDialog();
  // Keep the lastKnownUrl as is - user chose to stay
});

/**
 * Display version number from manifest in header
 */
function displayVersion() {
  const manifest = chrome.runtime.getManifest();
  const version = manifest.version;
  if (headerTitle) {
    headerTitle.textContent = `EventAtlas Capture (v${version})`;
  }
}

// Initialize
async function init() {
  // Display version in header
  displayVersion();

  await updateTabInfo();
  await loadFromStorage();

  // Load filter state
  await loadFilterState();

  // Sync with API in background (don't block UI)
  syncWithApi().then((result) => {
    if (result) {
      console.log('[EventAtlas] Sync completed:', {
        events: result.events?.length || 0,
        organizerLinks: result.organizer_links?.length || 0,
        syncedAt: result.synced_at,
      });
      // Refresh URL status now that we have sync data
      updateUrlStatus();
    }
  });

  // Apply settings to UI
  autoGroupSetting.checked = settings.autoGroupByDomain;
  screenshotDefaultSetting.checked = settings.captureScreenshotByDefault;

  // Apply API settings to UI
  apiUrlSetting.value = settings.apiUrl || '';
  apiTokenSetting.value = settings.apiToken || '';
  syncModeSetting.value = settings.syncMode || 'both';
  screenshotUploadTimingSetting.value = settings.screenshotUploadTiming || 'immediate';

  // Apply Event List settings to UI
  if (autoSwitchTabSetting) autoSwitchTabSetting.checked = settings.autoSwitchTab !== false;
  if (eventListRefreshIntervalSetting) eventListRefreshIntervalSetting.value = settings.eventListRefreshInterval || '0';

  // Apply filter state to UI
  if (filterMissingTags) filterMissingTags.checked = filterState.missingTags;
  if (filterMissingDistances) filterMissingDistances.checked = filterState.missingDistances;
  if (filterState.mode) {
    document.querySelectorAll('.filter-mode-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mode === filterState.mode);
    });
  }

  // Initialize "Starts from" dropdown with dynamic options
  updateStartsFromDropdown();

  // Show custom date input if a custom date is set
  const customDateContainer = document.getElementById('customDateContainer');
  const customDateInput = document.getElementById('filterCustomDate');
  if (filterState.startsFrom && !['this_month', 'next_month', '2_months', '3_months', '6_months'].includes(filterState.startsFrom)) {
    if (customDateContainer) customDateContainer.style.display = 'block';
    if (customDateInput) customDateInput.value = filterState.startsFrom;
  }

  // Setup background refresh timer
  setupEventListRefresh();

  // Apply distance presets to UI
  applyDistancePresetsToUI();

  // Update capture button visibility based on setting
  updateCaptureButtonsVisibility();

  renderBundlesList();
}

/**
 * Apply distance presets from settings to the UI toggle chips
 */
function applyDistancePresetsToUI() {
  const presets = getDistancePresets();
  const defaults = presets.defaults || {};
  const custom = presets.custom || [];

  // Update toggle chips based on saved defaults
  if (distancePresetToggles) {
    const chips = distancePresetToggles.querySelectorAll('.distance-preset-chip');
    chips.forEach((chip) => {
      const value = parseInt(chip.dataset.value, 10);
      const isEnabled = defaults[value] !== false; // Default to enabled if not set
      chip.classList.toggle('enabled', isEnabled);
      chip.classList.toggle('disabled', !isEnabled);
    });
  }

  // Update custom distances input
  if (customDistancePresetsSetting) {
    customDistancePresetsSetting.value = custom.join(', ');
  }
}

init();
