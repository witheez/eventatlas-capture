/**
 * EventAtlas Capture - Side Panel Script
 *
 * Handles side panel UI interactions, preview display, and bundle storage
 * for captured page data. Supports multi-page bundling with persistence.
 * Uses accordion-style bundles with drag-and-drop between bundles.
 */

import { formatBytes, getDomain, normalizeUrl, escapeRegex, escapeHtml, generateId } from './utils.js';
import { syncWithApi, lookupUrl, testApiConnection, fetchTags, fetchEventTypes, fetchDistances } from './api.js';
import {
  saveToStorage as saveToStorageRaw,
  loadFromStorage as loadFromStorageRaw,
  clearAllStorage as clearAllStorageRaw,
  saveFilterState as saveFilterStateRaw,
  loadFilterState as loadFilterStateRaw,
} from './storage.js';
import {
  initUploadQueue,
  getUploadQueue,
  generateThumbnail,
  addToUploadQueue,
  uploadQueueItem,
  updateQueueItemProgress,
  markQueueItemComplete,
  markQueueItemFailed,
  retryQueueItem,
  removeFromUploadQueue,
  renderUploadQueue,
  updateQueueItemUI,
  clearUploadQueue,
} from './upload-queue.js';
import { initEventEditor } from './event-editor.js';

// Storage keys
const STORAGE_KEY = 'eventatlas_capture_data';
const OLD_STORAGE_KEY = 'eventatlas_capture_bundle'; // Legacy key for migration
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
const DEFAULT_FILTER_STATE = {
  missingTags: false,
  missingDistances: false,
  mode: 'any',
  startsFrom: null, // 'this_month', 'next_month', '2_months', '3_months', '6_months', or ISO date string
};
let filterState = { ...DEFAULT_FILTER_STATE };

// Storage key for filter state persistence
const FILTER_STATE_KEY = 'eventatlas_filter_state';

// Storage wrapper functions that bind to module state
async function saveToStorage() {
  await saveToStorageRaw(STORAGE_KEY, { bundles, settings });
}

async function loadFromStorage() {
  const result = await loadFromStorageRaw(
    STORAGE_KEY,
    OLD_STORAGE_KEY,
    DEFAULT_SETTINGS,
    { migrateOldDistancePresets, getDomain, generateId }
  );
  bundles = result.bundles;
  settings = result.settings;
  if (result.migrated) {
    await saveToStorage();
  }
  return result.bundles.length > 0 || result.migrated;
}

async function clearAllStorage() {
  bundles = [];
  await clearAllStorageRaw(STORAGE_KEY, settings);
}

async function saveFilterState() {
  await saveFilterStateRaw(FILTER_STATE_KEY, filterState);
}

async function loadFilterState() {
  filterState = await loadFilterStateRaw(FILTER_STATE_KEY, DEFAULT_FILTER_STATE);
}

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

// Event Editor module instance (initialized in init())
let eventEditorModule = null;

// DOM Elements - Screenshot Upload Timing Setting
const screenshotUploadTimingSetting = document.getElementById('screenshotUploadTiming');

// DOM Elements - Unsaved Changes Dialog
const unsavedDialog = document.getElementById('unsavedDialog');
const unsavedDialogText = document.getElementById('unsavedDialogText');
const unsavedSaveBtn = document.getElementById('unsavedSaveBtn');
const unsavedDiscardBtn = document.getElementById('unsavedDiscardBtn');
const unsavedCancelBtn = document.getElementById('unsavedCancelBtn');

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
      const result = await lookupUrl(tab.url, settings);
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
    const result = await lookupUrl(tab.url, settings);

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
    const syncResult = await syncWithApi(settings);
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
    syncWithApi(settings).then((result) => {
      if (result) {
        updateUrlStatus();
      }
    });
  }
});

testConnectionBtn.addEventListener('click', async () => {
  const apiUrl = apiUrlSetting.value.trim();
  const apiToken = apiTokenSetting.value.trim();

  // Show loading state
  testConnectionBtn.disabled = true;
  connectionStatus.textContent = 'Testing...';
  connectionStatus.className = 'connection-status loading';

  const result = await testApiConnection(apiUrl, apiToken);

  connectionStatus.textContent = result.message;
  connectionStatus.className = result.success ? 'connection-status success' : 'connection-status error';
  testConnectionBtn.disabled = false;
});

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

// Note: fetchTags, fetchEventTypes, fetchDistances moved to api.js
// They are imported and called with settings parameter

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

// Event editor functions are now in event-editor.js module
// Wrapper functions that delegate to the eventEditor instance

function showEventEditor(event) {
  return eventEditorModule.showEventEditor(event);
}

function hideEventEditor() {
  return eventEditorModule.hideEventEditor();
}

function hasUnsavedChanges() {
  return eventEditorModule.hasUnsavedChanges();
}

function showUnsavedDialog(message) {
  return eventEditorModule.showUnsavedDialog(message);
}

function hideUnsavedDialog() {
  return eventEditorModule.hideUnsavedDialog();
}

function saveEventChanges() {
  return eventEditorModule.saveEventChanges();
}

function discardPendingScreenshots() {
  return eventEditorModule.discardPendingScreenshots();
}

function renderSavedScreenshots(media) {
  return eventEditorModule.renderSavedScreenshots(media);
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

// Event Editor Event Listeners are now set up in the eventEditor module via setupEventListeners()
// Screenshot capture buttons remain here as they use functions in sidepanel.js

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

// Custom distance input keydown listener is now in the eventEditor module

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

  // Initialize event editor module
  eventEditorModule = initEventEditor({
    elements: {
      eventEditor: document.getElementById('eventEditor'),
      eventEditorAccordionHeader: document.getElementById('eventEditorAccordionHeader'),
      eventEditorChevron: document.getElementById('eventEditorChevron'),
      eventEditorContent: document.getElementById('eventEditorContent'),
      editorEventName: document.getElementById('editorEventName'),
      editorPageTitle: document.getElementById('editorPageTitle'),
      editorPageUrl: document.getElementById('editorPageUrl'),
      editorBadge: document.getElementById('editorBadge'),
      editorViewLink: document.getElementById('editorViewLink'),
      editorLoading: document.getElementById('editorLoading'),
      editorContent: document.getElementById('editorContent'),
      editorEventTypes: document.getElementById('editorEventTypes'),
      editorTags: document.getElementById('editorTags'),
      editorDistances: document.getElementById('editorDistances'),
      customDistanceInput: document.getElementById('customDistanceInput'),
      addCustomDistanceBtn: document.getElementById('addCustomDistanceBtn'),
      selectedDistancesEl: document.getElementById('selectedDistances'),
      editorNotes: document.getElementById('editorNotes'),
      editorSaveBtn: document.getElementById('editorSaveBtn'),
      captureEventScreenshotBtn: document.getElementById('captureEventScreenshotBtn'),
      captureEventHtmlBtn: document.getElementById('captureEventHtmlBtn'),
      savedScreenshotsEl: document.getElementById('savedScreenshots'),
      pageTitleEl: document.getElementById('pageTitle'),
      pageUrlEl: document.getElementById('pageUrl'),
      unsavedDialog: document.getElementById('unsavedDialog'),
      unsavedDialogText: document.getElementById('unsavedDialogText'),
      unsavedSaveBtn: document.getElementById('unsavedSaveBtn'),
      unsavedDiscardBtn: document.getElementById('unsavedDiscardBtn'),
      unsavedCancelBtn: document.getElementById('unsavedCancelBtn'),
    },
    getSettings: () => settings,
    getState: () => ({
      currentMatchedEvent,
      availableTags,
      availableEventTypes,
      availableDistances,
      selectedEventTypeId,
      selectedTagIds,
      selectedDistanceValues,
      eventEditorExpanded,
      pendingScreenshots,
      pendingUrlChange,
      uploadQueue: getUploadQueue(),
    }),
    setState: (updates) => {
      if ('currentMatchedEvent' in updates) currentMatchedEvent = updates.currentMatchedEvent;
      if ('availableTags' in updates) availableTags = updates.availableTags;
      if ('availableEventTypes' in updates) availableEventTypes = updates.availableEventTypes;
      if ('availableDistances' in updates) availableDistances = updates.availableDistances;
      if ('selectedEventTypeId' in updates) selectedEventTypeId = updates.selectedEventTypeId;
      if ('selectedTagIds' in updates) selectedTagIds = updates.selectedTagIds;
      if ('selectedDistanceValues' in updates) selectedDistanceValues = updates.selectedDistanceValues;
      if ('eventEditorExpanded' in updates) eventEditorExpanded = updates.eventEditorExpanded;
      if ('pendingScreenshots' in updates) pendingScreenshots = updates.pendingScreenshots;
      if ('pendingUrlChange' in updates) pendingUrlChange = updates.pendingUrlChange;
    },
    showToast,
    buildAdminEditUrl,
    captureScreenshot,
    openScreenshotModal,
    mergeDistancesWithPresets,
  });
  eventEditorModule.setupEventListeners();

  // Initialize upload queue module
  initUploadQueue({
    queueEl: document.getElementById('uploadQueue'),
    countEl: document.getElementById('uploadQueueCount'),
    itemsEl: document.getElementById('uploadQueueItems'),
    getSettings: () => settings,
    getCurrentMatchedEvent: () => currentMatchedEvent,
    setCurrentMatchedEventMedia: (media) => {
      if (currentMatchedEvent) {
        currentMatchedEvent.media = media;
      }
    },
    renderSavedScreenshots: renderSavedScreenshots,
    showToast: showToast,
  });

  await updateTabInfo();
  await loadFromStorage();

  // Load filter state
  await loadFilterState();

  // Sync with API in background (don't block UI)
  syncWithApi(settings).then((result) => {
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
