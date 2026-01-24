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

// DOM Elements - Views
const bundlesView = document.getElementById('bundlesView');
const detailView = document.getElementById('detailView');
const backNav = document.getElementById('backNav');
const backNavText = document.getElementById('backNavText');

// DOM Elements - Settings
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const autoGroupSetting = document.getElementById('autoGroupSetting');
const screenshotDefaultSetting = document.getElementById('screenshotDefaultSetting');

// DOM Elements - API Settings
const apiUrlSetting = document.getElementById('apiUrlSetting');
const apiTokenSetting = document.getElementById('apiTokenSetting');
const toggleTokenVisibility = document.getElementById('toggleTokenVisibility');
const syncModeSetting = document.getElementById('syncModeSetting');
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

// DOM Elements - URL Status
const urlStatusContainer = document.getElementById('urlStatusContainer');
const urlStatusBadge = document.getElementById('urlStatusBadge');
const urlStatusDetails = document.getElementById('urlStatusDetails');

// DOM Elements - Event Editor
const eventEditor = document.getElementById('eventEditor');
const editorEventName = document.getElementById('editorEventName');
const editorLoading = document.getElementById('editorLoading');
const editorContent = document.getElementById('editorContent');
const editorEventType = document.getElementById('editorEventType');
const editorTags = document.getElementById('editorTags');
const editorDistances = document.getElementById('editorDistances');
const customDistanceInput = document.getElementById('customDistanceInput');
const addCustomDistanceBtn = document.getElementById('addCustomDistanceBtn');
const selectedDistancesEl = document.getElementById('selectedDistances');
const editorNotes = document.getElementById('editorNotes');
const editorSaveBtn = document.getElementById('editorSaveBtn');
const captureEventScreenshotBtn = document.getElementById('captureEventScreenshotBtn');
const savedScreenshotsEl = document.getElementById('savedScreenshots');

// Event Editor State
let currentMatchedEvent = null;
let availableTags = [];
let availableEventTypes = [];
let availableDistances = [];
let selectedTagIds = new Set();
let selectedDistanceValues = [];

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
 * Check if a URL is an EventAtlas URL (our own admin or frontend)
 * Returns { type: 'admin' | 'frontend', eventId: number } or null
 */
function checkIfEventAtlasUrl(url) {
  const apiUrl = settings.apiUrl;
  if (!apiUrl) return null;

  try {
    // Normalize the API URL for matching
    const escapedApiUrl = escapeRegex(apiUrl.replace(/\/$/, ''));

    // Check admin event URLs: /admin/v2/events/{id} or /admin/v2/events/{id}/edit
    const adminMatch = url.match(new RegExp(`${escapedApiUrl}/admin/v2/events/(\\d+)`));
    if (adminMatch) {
      return { type: 'admin', eventId: parseInt(adminMatch[1], 10) };
    }

    // Check frontend event URLs: /events/{id-or-slug}
    const frontendMatch = url.match(new RegExp(`${escapedApiUrl}/events/([^/]+)`));
    if (frontendMatch) {
      return { type: 'frontend', eventIdOrSlug: frontendMatch[1] };
    }
  } catch (e) {
    console.warn('[EventAtlas] Error checking EventAtlas URL:', e);
  }

  return null;
}

/**
 * Build admin edit URL for an event
 */
function buildAdminEditUrl(eventId) {
  if (!settings.apiUrl || !eventId) return null;
  const baseUrl = settings.apiUrl.replace(/\/$/, '');
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
      pageTitleEl.textContent = tab.title || 'Unknown';
      pageUrlEl.textContent = tab.url || '';
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
 * Update URL status indicator based on current tab URL
 */
async function updateUrlStatus() {
  // Skip if no API configured
  if (!settings.apiUrl || !settings.apiToken) {
    urlStatusContainer.style.display = 'none';
    hideEventEditor();
    return;
  }

  // Get current tab URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    urlStatusContainer.style.display = 'none';
    hideEventEditor();
    return;
  }

  // Check if this is an EventAtlas URL first
  const eventAtlasMatch = checkIfEventAtlasUrl(tab.url);
  if (eventAtlasMatch) {
    // Show loading state
    urlStatusContainer.style.display = 'block';
    urlStatusBadge.className = 'url-status-badge loading';
    urlStatusBadge.textContent = '\u22EF Checking...';
    urlStatusDetails.textContent = '';

    // For EventAtlas URLs, we can fetch event details directly
    // Still use lookup API which will match, but we know it's our own page
    try {
      const result = await lookupUrl(tab.url);
      if (result && result.match_type === 'event' && result.event) {
        urlStatusBadge.className = 'url-status-badge event';
        urlStatusBadge.textContent = '\u2713 EventAtlas Event';
        renderUrlStatusDetails(result.event.title, result.event.id);
        showEventEditor(result.event);
      } else {
        // EventAtlas URL but no match found (maybe event deleted)
        urlStatusBadge.className = 'url-status-badge no-match';
        urlStatusBadge.textContent = '\u25CB EventAtlas Page';
        urlStatusDetails.textContent = eventAtlasMatch.type === 'admin' ? 'Admin page' : 'Event page';
        hideEventEditor();
      }
    } catch (error) {
      console.error('[EventAtlas] Status update error:', error);
      urlStatusContainer.style.display = 'none';
      hideEventEditor();
    }
    return;
  }

  // Show loading state for external URLs
  urlStatusContainer.style.display = 'block';
  urlStatusBadge.className = 'url-status-badge loading';
  urlStatusBadge.textContent = '\u22EF Checking...';
  urlStatusDetails.textContent = '';

  try {
    const result = await lookupUrl(tab.url);

    if (!result || result.match_type === 'no_match') {
      urlStatusBadge.className = 'url-status-badge no-match';
      urlStatusBadge.textContent = '\u25CB Not in EventAtlas';
      urlStatusDetails.textContent = 'Capture this page to add it';
      hideEventEditor();
    } else if (result.match_type === 'event') {
      urlStatusBadge.className = 'url-status-badge event';
      urlStatusBadge.textContent = '\u2713 Known Event';
      renderUrlStatusDetails(result.event?.title, result.event?.id);
      // Show event editor
      showEventEditor(result.event);
    } else if (result.match_type === 'link_discovery') {
      urlStatusBadge.className = 'url-status-badge link-discovery';
      urlStatusBadge.textContent = '\u2295 Discovery Page';
      urlStatusDetails.textContent = result.organizer_link?.organizer_name || '';
      hideEventEditor();
    } else if (result.match_type === 'content_item') {
      urlStatusBadge.className = 'url-status-badge content-item';
      urlStatusBadge.textContent = '\u25D0 Scraped';
      urlStatusDetails.textContent = 'Scraped but not yet processed';
      hideEventEditor();
    }
  } catch (error) {
    console.error('[EventAtlas] Status update error:', error);
    urlStatusContainer.style.display = 'none';
    hideEventEditor();
  }
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

  // Save to storage
  await saveToStorage();

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
  availableDistances = distances;

  // Populate event types dropdown
  editorEventType.innerHTML = '<option value="">-- Select type --</option>';
  eventTypes.forEach((type) => {
    const option = document.createElement('option');
    option.value = type.id;
    option.textContent = type.name;
    editorEventType.appendChild(option);
  });

  // Populate distances buttons
  editorDistances.innerHTML = '';
  distances.forEach((dist) => {
    const btn = document.createElement('button');
    btn.className = 'distance-btn';
    btn.dataset.value = dist.value;
    btn.textContent = dist.label;
    btn.addEventListener('click', () => toggleDistance(dist.value));
    editorDistances.appendChild(btn);
  });
}

/**
 * Show event editor with matched event data
 */
async function showEventEditor(event) {
  currentMatchedEvent = event;

  // Show editor and loading state
  eventEditor.classList.add('visible');
  editorLoading.style.display = 'flex';
  editorContent.style.display = 'none';

  // Set event name
  editorEventName.textContent = event.title || event.name || 'Untitled Event';

  // Load options if not already loaded
  if (availableEventTypes.length === 0 || availableTags.length === 0) {
    await loadEditorOptions();
  }

  // Set current values from event
  editorEventType.value = event.event_type_id || '';

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
    chip.appendChild(document.createTextNode(tag.name));

    chip.addEventListener('click', () => toggleTag(tag.id));
    editorTags.appendChild(chip);
  });
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
 */
function renderDistanceButtons() {
  const buttons = editorDistances.querySelectorAll('.distance-btn');
  buttons.forEach((btn) => {
    const value = parseInt(btn.dataset.value, 10);
    if (selectedDistanceValues.includes(value)) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
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
 * Render saved screenshots
 */
function renderSavedScreenshots(media) {
  savedScreenshotsEl.innerHTML = '';

  // Filter for screenshots
  const screenshots = media.filter(m => m.type === 'screenshot' || m.type === 'Screenshot');

  if (screenshots.length === 0) {
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

    // Click to open in modal or new tab
    div.addEventListener('click', () => {
      window.open(item.file_url, '_blank');
    });

    savedScreenshotsEl.appendChild(div);
  });
}

/**
 * Clear validation errors from event editor fields
 */
function clearValidationErrors() {
  editorEventType.classList.remove('field-error');
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
  const eventTypeId = editorEventType.value;
  if (!eventTypeId) {
    showFieldError(editorEventType, 'eventTypeError');
    showToast('Please select an event type', 'error');
    return;
  }

  editorSaveBtn.disabled = true;
  editorSaveBtn.textContent = 'Saving...';
  editorSaveBtn.classList.add('saving');

  try {
    const payload = {
      event_type_id: editorEventType.value ? parseInt(editorEventType.value, 10) : null,
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
 */
async function captureAndUploadEventScreenshot() {
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

    // Upload to API
    captureEventScreenshotBtn.innerHTML = '<span>&#128247;</span> Uploading...';

    const response = await fetch(`${settings.apiUrl}/api/extension/events/${currentMatchedEvent.id}/screenshot`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.apiToken}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: screenshot,
        filename: `screenshot_${Date.now()}.png`,
      }),
    });

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
      renderSavedScreenshots(currentMatchedEvent.media);
    }

    captureEventScreenshotBtn.innerHTML = '<span>&#10003;</span> Uploaded!';
    captureEventScreenshotBtn.classList.add('success');
    showToast('Screenshot uploaded successfully', 'success');

    setTimeout(() => {
      captureEventScreenshotBtn.innerHTML = '<span>&#128247;</span> Capture';
      captureEventScreenshotBtn.classList.remove('success');
      captureEventScreenshotBtn.disabled = false;
    }, 1500);

  } catch (error) {
    console.error('[EventAtlas] Error capturing screenshot:', error);
    captureEventScreenshotBtn.innerHTML = '<span>&#128247;</span> Capture';
    captureEventScreenshotBtn.disabled = false;
    showToast(error.message || 'Failed to capture screenshot', 'error');
  }
}

// Event Editor Event Listeners
editorSaveBtn.addEventListener('click', saveEventChanges);
addCustomDistanceBtn.addEventListener('click', addCustomDistance);
captureEventScreenshotBtn.addEventListener('click', captureAndUploadEventScreenshot);

// Clear validation error when event type is selected
editorEventType.addEventListener('change', () => {
  editorEventType.classList.remove('field-error');
  document.getElementById('eventTypeError').classList.remove('visible');
});

// Handle Enter key on custom distance input
customDistanceInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addCustomDistance();
  }
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

  // Update capture button visibility based on setting
  updateCaptureButtonsVisibility();

  renderBundlesList();
}

init();
