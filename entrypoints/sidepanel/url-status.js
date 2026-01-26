/**
 * EventAtlas Capture - URL Status Module
 *
 * Handles URL matching against EventAtlas and link discovery features.
 * Manages the page status indicator and link scanning/comparison.
 */

import { escapeRegex, escapeHtml, normalizeUrl } from './utils.js';
import { lookupUrl, normalizeBaseUrl } from './api.js';

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

// Module state
let settings = null;
let currentLinkDiscovery = null;
let extractedPageLinks = [];
let newDiscoveredLinks = [];
let selectedNewLinks = new Set();

// DOM element references (set during init)
let elements = {};

// Callbacks for external integrations
let callbacks = {
  showToast: null,
  showEventEditor: null,
  hideEventEditor: null,
  updateBundleUIVisibility: null,
  updateCaptureButtonsVisibility: null,
  hasUnsavedChanges: null,
  showUnsavedDialog: null,
};

// Last known URL for unsaved changes detection
let lastKnownUrl = null;
let pendingUrlChange = null;

/**
 * Initialize the URL status module
 * @param {Object} config - Configuration object
 * @param {Object} config.settings - Settings reference (will be updated externally)
 * @param {Object} config.elements - DOM element references
 * @param {Object} config.callbacks - Callback functions for external integrations
 */
export function initUrlStatus(config) {
  settings = config.settings;
  elements = config.elements;
  callbacks = { ...callbacks, ...config.callbacks };
}

/**
 * Update the settings reference
 * @param {Object} newSettings - New settings object
 */
export function updateSettings(newSettings) {
  settings = newSettings;
}

/**
 * Get the current link discovery state
 */
export function getCurrentLinkDiscovery() {
  return currentLinkDiscovery;
}

/**
 * Get the pending URL change
 */
export function getPendingUrlChange() {
  return pendingUrlChange;
}

/**
 * Set the pending URL change
 */
export function setPendingUrlChange(url) {
  pendingUrlChange = url;
}

/**
 * Get the last known URL
 */
export function getLastKnownUrl() {
  return lastKnownUrl;
}

/**
 * Set the last known URL
 */
export function setLastKnownUrl(url) {
  lastKnownUrl = url;
}

/**
 * Check if URL matches EventAtlas patterns
 * @param {string} url - URL to check
 * @returns {Object|null} Match result with type and eventId/eventIdOrSlug
 */
export function checkIfEventAtlasUrl(url) {
  // Build list of domains to check: known domains + settings.apiUrl
  const domainsToCheck = [...KNOWN_EVENTATLAS_DOMAINS];
  if (settings?.apiUrl) {
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
 * @param {number} eventId - Event ID
 * @returns {string|null} Admin URL or null
 */
export function buildAdminEditUrl(eventId) {
  if (!eventId) return null;
  // Prefer the production domain for admin links
  const baseUrl = 'https://www.eventatlas.co';
  return `${baseUrl}/admin/v2/events/${eventId}/edit`;
}

/**
 * Update UI with current tab info
 */
export async function updateTabInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      const newUrl = tab.url || '';

      // Check for unsaved changes when URL changes
      if (lastKnownUrl && lastKnownUrl !== newUrl && callbacks.hasUnsavedChanges?.()) {
        pendingUrlChange = newUrl;
        callbacks.showUnsavedDialog?.();
        // Don't update UI yet, wait for user decision
        return;
      }

      // Update last known URL
      lastKnownUrl = newUrl;

      if (elements.pageTitleEl) elements.pageTitleEl.textContent = tab.title || 'Unknown';
      if (elements.pageUrlEl) elements.pageUrlEl.textContent = newUrl;
    }
  } catch (err) {
    if (elements.pageTitleEl) elements.pageTitleEl.textContent = 'Unable to get tab info';
    console.error('Error getting tab info:', err);
  }

  // Update URL status after tab info is updated
  await updateUrlStatus();
}

/**
 * Render URL status details with optional admin link
 * @param {string} eventName - Event name to display
 * @param {number} eventId - Event ID for admin link
 */
export function renderUrlStatusDetails(eventName, eventId) {
  if (!elements.urlStatusDetails) return;

  elements.urlStatusDetails.innerHTML = '';

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

    elements.urlStatusDetails.appendChild(row);
  } else {
    elements.urlStatusDetails.textContent = eventName || '';
  }
}

/**
 * Update the combined page info badge and status section visibility
 * @param {string} type - Badge type (loading, event, no-match, link-discovery, content-item)
 * @param {string} text - Badge text
 * @param {string|null} icon - Badge icon character
 */
export function updatePageInfoBadge(type, text, icon = null) {
  if (elements.statusSection) elements.statusSection.style.display = 'flex';
  if (elements.pageInfoBadge) elements.pageInfoBadge.className = 'page-info-badge ' + type;
  if (elements.pageInfoBadgeText) elements.pageInfoBadgeText.textContent = text;
  if (icon && elements.pageInfoBadgeIcon) {
    elements.pageInfoBadgeIcon.textContent = icon;
  }
}

/**
 * Show or hide the View link under the status badge
 * @param {number|null} eventId - Event ID or null to hide
 */
export function updateStatusViewLink(eventId) {
  if (!elements.statusViewLink) return;

  if (eventId) {
    const adminUrl = buildAdminEditUrl(eventId);
    if (adminUrl) {
      elements.statusViewLink.href = adminUrl;
      elements.statusViewLink.style.display = 'inline';
      elements.statusViewLink.onclick = (e) => {
        e.preventDefault();
        window.open(adminUrl, '_blank');
      };
    } else {
      elements.statusViewLink.style.display = 'none';
    }
  } else {
    elements.statusViewLink.style.display = 'none';
  }
}

/**
 * Show or hide the bundle UI based on whether an event is matched
 * Note: status section visibility is controlled by updatePageInfoBadge/hidePageInfoStatus,
 * not here, to avoid conflicts with "no API configured" state
 * @param {boolean} isEventMatched - Whether an event is matched
 */
export function updateBundleUIVisibility(isEventMatched) {
  if (isEventMatched) {
    // Hide page info, status section, and bundle UI when event is matched
    // (page info is now shown in the event editor accordion header)
    if (elements.pageInfoSection) elements.pageInfoSection.style.display = 'none';
    if (elements.statusSection) elements.statusSection.style.display = 'none';
    if (elements.captureButtons) elements.captureButtons.style.display = 'none';
    if (elements.bundleSection) elements.bundleSection.style.display = 'none';
  } else {
    // Show page info and bundle UI when no event matched
    // Note: status section visibility is NOT changed here - it's controlled by
    // updatePageInfoBadge (shows) and hidePageInfoStatus (hides)
    if (elements.pageInfoSection) elements.pageInfoSection.style.display = 'block';
    if (elements.captureButtons) elements.captureButtons.style.display = 'block';
    if (elements.bundleSection) elements.bundleSection.style.display = 'block';
    // Also update the capture buttons visibility based on settings
    callbacks.updateCaptureButtonsVisibility?.();
  }
}

/**
 * Update the page info details section (legacy - kept for backward compatibility)
 * The actual display is now handled by updateStatusViewLink and the status section
 * @param {string} eventName - Event name
 * @param {number} eventId - Event ID
 */
export function updatePageInfoDetails(eventName, eventId) {
  // Legacy section is now always hidden - display handled by status section
  if (elements.pageInfoDetails) elements.pageInfoDetails.style.display = 'none';

  // Store values for legacy compatibility
  if (eventName && elements.pageInfoEventName) {
    elements.pageInfoEventName.textContent = eventName || '';
    elements.pageInfoEventName.title = eventName || '';
  }
}

/**
 * Hide page info badge and details
 */
export function hidePageInfoStatus() {
  if (elements.statusSection) elements.statusSection.style.display = 'none';
  if (elements.statusViewLink) elements.statusViewLink.style.display = 'none';
  if (elements.pageInfoDetails) elements.pageInfoDetails.style.display = 'none';
  // Show bundle UI when status is hidden
  updateBundleUIVisibility(false);
  // Also hide link discovery view
  hideLinkDiscoveryView();
}

/**
 * Update URL status indicator based on current tab URL
 */
export async function updateUrlStatus() {
  // Skip if no API configured
  if (!settings?.apiUrl || !settings?.apiToken) {
    hidePageInfoStatus();
    callbacks.hideEventEditor?.();
    return;
  }

  // Get current tab URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    hidePageInfoStatus();
    callbacks.hideEventEditor?.();
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
        callbacks.showEventEditor?.(result.event);
        hideLinkDiscoveryView();
      } else {
        // EventAtlas URL but no match found (maybe event deleted)
        updatePageInfoBadge('no-match', 'EventAtlas Page', '\u25CB');
        updateStatusViewLink(null);
        updateBundleUIVisibility(false);
        callbacks.hideEventEditor?.();
        hideLinkDiscoveryView();
      }
    } catch (error) {
      console.error('[EventAtlas] Status update error:', error);
      hidePageInfoStatus();
      callbacks.hideEventEditor?.();
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
      callbacks.hideEventEditor?.();
      hideLinkDiscoveryView();
    } else if (result.match_type === 'event') {
      updatePageInfoBadge('event', 'Known Event', '\u2713');
      updateStatusViewLink(result.event?.id);
      updateBundleUIVisibility(true);
      // Show event editor
      callbacks.showEventEditor?.(result.event);
      hideLinkDiscoveryView();
    } else if (result.match_type === 'link_discovery') {
      updatePageInfoBadge('link-discovery', 'Discovery', '\u2295');
      updateStatusViewLink(null);
      updateBundleUIVisibility(false);
      callbacks.hideEventEditor?.();
      // Show the link discovery view with enhanced data
      showLinkDiscoveryView(result.link_discovery);
    } else if (result.match_type === 'content_item') {
      updatePageInfoBadge('content-item', 'Scraped', '\u25D0');
      updateStatusViewLink(null);
      updateBundleUIVisibility(false);
      callbacks.hideEventEditor?.();
      hideLinkDiscoveryView();
    }
  } catch (error) {
    console.error('[EventAtlas] Status update error:', error);
    hidePageInfoStatus();
    callbacks.hideEventEditor?.();
    hideLinkDiscoveryView();
  }
}

// ============================================================================
// Link Discovery Functions
// ============================================================================

/**
 * Show the link discovery view with data from lookup response
 * @param {Object} linkDiscoveryData - Link discovery data from API
 */
export function showLinkDiscoveryView(linkDiscoveryData) {
  currentLinkDiscovery = linkDiscoveryData;

  // Update header info
  if (elements.discoverySourceName) {
    elements.discoverySourceName.textContent = linkDiscoveryData.organizer_name || 'Unknown Source';
  }

  // Show/hide API badge
  if (elements.discoveryApiBadge) {
    elements.discoveryApiBadge.style.display = linkDiscoveryData.has_api_endpoint ? 'inline-block' : 'none';
  }

  // Show last scraped date
  if (elements.discoveryLastScraped) {
    if (linkDiscoveryData.last_scraped_at) {
      const date = new Date(linkDiscoveryData.last_scraped_at);
      elements.discoveryLastScraped.textContent = `Last scraped: ${date.toLocaleDateString()}`;
    } else {
      elements.discoveryLastScraped.textContent = 'Never scraped';
    }
  }

  // Reset state
  extractedPageLinks = [];
  newDiscoveredLinks = [];
  selectedNewLinks = new Set();
  if (elements.linkComparisonResults) {
    elements.linkComparisonResults.style.display = 'none';
  }

  // Show the view
  if (elements.linkDiscoveryView) {
    elements.linkDiscoveryView.style.display = 'block';
  }
}

/**
 * Hide the link discovery view
 */
export function hideLinkDiscoveryView() {
  if (elements.linkDiscoveryView) {
    elements.linkDiscoveryView.style.display = 'none';
  }
  currentLinkDiscovery = null;
}

/**
 * Scan the current page for links using chrome.scripting
 */
export async function scanPageForLinks() {
  if (!currentLinkDiscovery) return;

  const btn = elements.scanPageLinksBtn;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="scan-btn-icon">\u23F3</span> Scanning...';
  }

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

    if (btn) {
      btn.innerHTML = '<span class="scan-btn-icon">\uD83D\uDD04</span> Rescan Page';
    }
  } catch (error) {
    console.error('[EventAtlas] Error scanning page:', error);
    callbacks.showToast?.('Failed to scan page for links', 'error');
    if (btn) {
      btn.innerHTML = '<span class="scan-btn-icon">\uD83D\uDD0D</span> Scan Page for Links';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Function injected into page to extract links
 * @param {string|null} urlPattern - Regex pattern to filter links
 * @returns {string[]} Array of normalized URLs
 */
export function extractLinksFromPage(urlPattern) {
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
export function compareLinksAndRender() {
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
 * @param {Array} childLinks - Known child links from API
 */
export function renderLinkComparison(childLinks) {
  // Update counts
  if (elements.newLinksCount) elements.newLinksCount.textContent = newDiscoveredLinks.length;
  if (elements.knownLinksCount) elements.knownLinksCount.textContent = childLinks.length;

  // Render new links with checkboxes
  if (elements.newLinksList) {
    elements.newLinksList.innerHTML = newDiscoveredLinks
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
    elements.newLinksList.querySelectorAll('.new-link-checkbox').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        if (e.target.checked) {
          selectedNewLinks.add(e.target.dataset.url);
        } else {
          selectedNewLinks.delete(e.target.dataset.url);
        }
        updateSelectedLinksCount();
      });
    });
  }

  // Setup select all
  if (elements.selectAllNewLinks) {
    elements.selectAllNewLinks.checked = newDiscoveredLinks.length > 0;
    elements.selectAllNewLinks.disabled = newDiscoveredLinks.length === 0;
  }

  // Render known links (read-only)
  if (elements.knownLinksList) {
    elements.knownLinksList.innerHTML = childLinks.map((link) => `<div class="link-item known-link">${escapeHtml(link.url)}</div>`).join('');
  }

  updateSelectedLinksCount();
  if (elements.linkComparisonResults) {
    elements.linkComparisonResults.style.display = 'block';
  }
}

/**
 * Update the selected links count and button visibility
 */
export function updateSelectedLinksCount() {
  const count = selectedNewLinks.size;
  if (elements.selectedLinksCountEl) elements.selectedLinksCountEl.textContent = count;
  if (elements.addNewLinksBtn) {
    elements.addNewLinksBtn.style.display = count > 0 ? 'block' : 'none';
    elements.addNewLinksBtn.disabled = count === 0;
  }
}

/**
 * Add selected new links to the pipeline via API
 */
export async function addNewLinksToPipeline() {
  const linksToAdd = Array.from(selectedNewLinks);
  if (linksToAdd.length === 0 || !currentLinkDiscovery) return;

  const btn = elements.addNewLinksBtn;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Adding...';
  }

  try {
    const response = await fetch(`${normalizeBaseUrl(settings.apiUrl)}/api/extension/add-discovered-links`, {
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
    callbacks.showToast?.(`Added ${data.created_count} new links to pipeline`);

    // Refresh the lookup to get updated child links
    await updateUrlStatus();
  } catch (error) {
    console.error('[EventAtlas] Error adding links:', error);
    callbacks.showToast?.('Error adding links: ' + error.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `Add <span id="selectedLinksCount">${selectedNewLinks.size}</span> Selected Links to Pipeline`;
    }
  }
}

/**
 * Toggle all new links selection
 * @param {boolean} selectAll - Whether to select all
 */
export function toggleSelectAllNewLinks(selectAll) {
  if (selectAll) {
    selectedNewLinks = new Set(newDiscoveredLinks);
  } else {
    selectedNewLinks.clear();
  }

  // Update checkboxes
  if (elements.newLinksList) {
    elements.newLinksList.querySelectorAll('.new-link-checkbox').forEach((cb) => {
      cb.checked = selectAll;
    });
  }

  updateSelectedLinksCount();
}
