/**
 * EventAtlas Capture - URL Status Module
 *
 * Handles URL matching against EventAtlas and link discovery features.
 * Manages the page status indicator and link scanning/comparison.
 */

import { escapeRegex, escapeHtml, normalizeUrl } from './utils';
import { lookupUrl } from './api';
import type { Settings } from './storage';
import type { LookupResult, LinkDiscoveryData } from './api';

/**
 * Known EventAtlas domains (production, staging, local)
 * These are checked in addition to settings.apiUrl
 */
const KNOWN_EVENTATLAS_DOMAINS: string[] = [
  'https://www.eventatlas.co',
  'https://eventatlas.co',
  'https://eventatlasco-staging.up.railway.app',
  'https://ongoingevents-production.up.railway.app',
  'http://eventatlas.test',
  'https://eventatlas.test',
];

// Type definitions
interface UrlStatusElements {
  pageTitleEl?: HTMLElement | null;
  pageUrlEl?: HTMLElement | null;
  statusSection?: HTMLElement | null;
  pageInfoBadge?: HTMLElement | null;
  pageInfoBadgeText?: HTMLElement | null;
  pageInfoBadgeIcon?: HTMLElement | null;
  statusViewLink?: HTMLAnchorElement | null;
  urlStatusDetails?: HTMLElement | null;
  pageInfoSection?: HTMLElement | null;
  pageInfoDetails?: HTMLElement | null;
  pageInfoEventName?: HTMLElement | null;
  captureButtons?: HTMLElement | null;
  bundleSection?: HTMLElement | null;
  linkDiscoveryView?: HTMLElement | null;
  discoverySourceName?: HTMLElement | null;
  discoveryApiBadge?: HTMLElement | null;
  discoveryLastScraped?: HTMLElement | null;
  scanPageLinksBtn?: HTMLButtonElement | null;
  linkComparisonResults?: HTMLElement | null;
  newLinksCount?: HTMLElement | null;
  knownLinksCount?: HTMLElement | null;
  newLinksList?: HTMLElement | null;
  knownLinksList?: HTMLElement | null;
  selectAllNewLinks?: HTMLInputElement | null;
  selectedLinksCountEl?: HTMLElement | null;
  addNewLinksBtn?: HTMLButtonElement | null;
}

interface UrlStatusCallbacks {
  showToast?: ((message: string, type?: string) => void) | null;
  showEventEditor?: ((event: { id: number; title?: string; name?: string }) => void) | null;
  hideEventEditor?: (() => void) | null;
  updateBundleUIVisibility?: ((visible: boolean) => void) | null;
  updateCaptureButtonsVisibility?: (() => void) | null;
  hasUnsavedChanges?: (() => boolean) | null;
  showUnsavedDialog?: (() => void) | null;
}

interface UrlStatusConfig {
  settings: Settings;
  elements: UrlStatusElements;
  callbacks?: UrlStatusCallbacks;
}

interface EventAtlasUrlMatch {
  type: 'admin' | 'frontend';
  eventId?: number;
  eventIdOrSlug?: string;
}

interface ChildLink {
  url: string;
}

// Module state
let settings: Settings | null = null;
let currentLinkDiscovery: LinkDiscoveryData | null = null;
let extractedPageLinks: string[] = [];
let newDiscoveredLinks: string[] = [];
let selectedNewLinks = new Set<string>();

// DOM element references (set during init)
let elements: UrlStatusElements = {};

// Callbacks for external integrations
let callbacks: UrlStatusCallbacks = {
  showToast: null,
  showEventEditor: null,
  hideEventEditor: null,
  updateBundleUIVisibility: null,
  updateCaptureButtonsVisibility: null,
  hasUnsavedChanges: null,
  showUnsavedDialog: null,
};

// Last known URL for unsaved changes detection
let lastKnownUrl: string | null = null;
let pendingUrlChange: string | null = null;

/**
 * Initialize the URL status module
 */
export function initUrlStatus(config: UrlStatusConfig): void {
  settings = config.settings;
  elements = config.elements;
  callbacks = { ...callbacks, ...config.callbacks };
}

/**
 * Update the settings reference
 */
export function updateSettings(newSettings: Settings): void {
  settings = newSettings;
}

/**
 * Get the current link discovery state
 */
export function getCurrentLinkDiscovery(): LinkDiscoveryData | null {
  return currentLinkDiscovery;
}

/**
 * Get the pending URL change
 */
export function getPendingUrlChange(): string | null {
  return pendingUrlChange;
}

/**
 * Set the pending URL change
 */
export function setPendingUrlChange(url: string | null): void {
  pendingUrlChange = url;
}

/**
 * Get the last known URL
 */
export function getLastKnownUrl(): string | null {
  return lastKnownUrl;
}

/**
 * Set the last known URL
 */
export function setLastKnownUrl(url: string | null): void {
  lastKnownUrl = url;
}

/**
 * Check if URL matches EventAtlas patterns
 */
export function checkIfEventAtlasUrl(url: string): EventAtlasUrlMatch | null {
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
 */
export function buildAdminEditUrl(eventId: number | undefined | null): string | null {
  if (!eventId) return null;
  // Prefer the production domain for admin links
  const baseUrl = 'https://www.eventatlas.co';
  return `${baseUrl}/admin/v2/events/${eventId}/edit`;
}

/**
 * Update UI with current tab info
 */
export async function updateTabInfo(): Promise<void> {
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
 */
export function renderUrlStatusDetails(eventName: string, eventId: number | undefined): void {
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
 */
export function updatePageInfoBadge(type: string, text: string, icon: string | null = null): void {
  if (elements.statusSection) elements.statusSection.style.display = 'flex';
  if (elements.pageInfoBadge) elements.pageInfoBadge.className = 'page-info-badge ' + type;
  if (elements.pageInfoBadgeText) elements.pageInfoBadgeText.textContent = text;
  if (icon && elements.pageInfoBadgeIcon) {
    elements.pageInfoBadgeIcon.textContent = icon;
  }
}

/**
 * Show or hide the View link under the status badge
 */
export function updateStatusViewLink(eventId: number | null | undefined): void {
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
 */
export function updateBundleUIVisibility(isEventMatched: boolean): void {
  if (isEventMatched) {
    if (elements.pageInfoSection) elements.pageInfoSection.style.display = 'none';
    if (elements.statusSection) elements.statusSection.style.display = 'none';
    if (elements.captureButtons) elements.captureButtons.style.display = 'none';
    if (elements.bundleSection) elements.bundleSection.style.display = 'none';
  } else {
    if (elements.pageInfoSection) elements.pageInfoSection.style.display = 'block';
    if (elements.captureButtons) elements.captureButtons.style.display = 'block';
    if (elements.bundleSection) elements.bundleSection.style.display = 'block';
    callbacks.updateCaptureButtonsVisibility?.();
  }
}

/**
 * Update the page info details section (legacy - kept for backward compatibility)
 */
export function updatePageInfoDetails(eventName: string, eventId: number | undefined): void {
  if (elements.pageInfoDetails) elements.pageInfoDetails.style.display = 'none';

  if (eventName && elements.pageInfoEventName) {
    elements.pageInfoEventName.textContent = eventName || '';
    elements.pageInfoEventName.title = eventName || '';
  }
}

/**
 * Hide page info badge and details
 */
export function hidePageInfoStatus(): void {
  if (elements.statusSection) elements.statusSection.style.display = 'none';
  if (elements.statusViewLink) elements.statusViewLink.style.display = 'none';
  if (elements.pageInfoDetails) elements.pageInfoDetails.style.display = 'none';
  updateBundleUIVisibility(false);
  hideLinkDiscoveryView();
}

/**
 * Update URL status indicator based on current tab URL
 */
export async function updateUrlStatus(): Promise<void> {
  if (!settings?.apiUrl || !settings?.apiToken) {
    hidePageInfoStatus();
    callbacks.hideEventEditor?.();
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
    hidePageInfoStatus();
    callbacks.hideEventEditor?.();
    return;
  }

  const eventAtlasMatch = checkIfEventAtlasUrl(tab.url);
  if (eventAtlasMatch) {
    updatePageInfoBadge('loading', 'Checking...', '\u22EF');
    updateStatusViewLink(null);
    updateBundleUIVisibility(false);

    try {
      const result = await lookupUrl(tab.url, settings);
      if (result && result.match_type === 'event' && 'event' in result && result.event) {
        updatePageInfoBadge('event', 'EventAtlas Event', '\u2713');
        updateStatusViewLink(result.event.id);
        updateBundleUIVisibility(true);
        callbacks.showEventEditor?.(result.event as { id: number; title?: string; name?: string });
        hideLinkDiscoveryView();
      } else {
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
    } else if (result.match_type === 'event' && 'event' in result) {
      updatePageInfoBadge('event', 'Known Event', '\u2713');
      updateStatusViewLink(result.event?.id);
      updateBundleUIVisibility(true);
      callbacks.showEventEditor?.(result.event as { id: number; title?: string; name?: string });
      hideLinkDiscoveryView();
    } else if (result.match_type === 'link_discovery' && 'link_discovery' in result) {
      updatePageInfoBadge('link-discovery', 'Discovery', '\u2295');
      updateStatusViewLink(null);
      updateBundleUIVisibility(false);
      callbacks.hideEventEditor?.();
      showLinkDiscoveryView(result.link_discovery as LinkDiscoveryData);
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
 */
export function showLinkDiscoveryView(linkDiscoveryData: LinkDiscoveryData): void {
  currentLinkDiscovery = linkDiscoveryData;

  if (elements.discoverySourceName) {
    elements.discoverySourceName.textContent = linkDiscoveryData.organizer_name || 'Unknown Source';
  }

  if (elements.discoveryApiBadge) {
    elements.discoveryApiBadge.style.display = linkDiscoveryData.has_api_endpoint ? 'inline-block' : 'none';
  }

  if (elements.discoveryLastScraped) {
    if (linkDiscoveryData.last_scraped_at) {
      const date = new Date(linkDiscoveryData.last_scraped_at);
      elements.discoveryLastScraped.textContent = `Last scraped: ${date.toLocaleDateString()}`;
    } else {
      elements.discoveryLastScraped.textContent = 'Never scraped';
    }
  }

  extractedPageLinks = [];
  newDiscoveredLinks = [];
  selectedNewLinks = new Set();
  if (elements.linkComparisonResults) {
    elements.linkComparisonResults.style.display = 'none';
  }

  if (elements.linkDiscoveryView) {
    elements.linkDiscoveryView.style.display = 'block';
  }
}

/**
 * Hide the link discovery view
 */
export function hideLinkDiscoveryView(): void {
  if (elements.linkDiscoveryView) {
    elements.linkDiscoveryView.style.display = 'none';
  }
  currentLinkDiscovery = null;
}

/**
 * Scan the current page for links using chrome.scripting
 */
export async function scanPageForLinks(): Promise<void> {
  if (!currentLinkDiscovery) return;

  const btn = elements.scanPageLinksBtn;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="scan-btn-icon">\u23F3</span> Scanning...';
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: extractLinksFromPage,
      args: [currentLinkDiscovery.url_pattern],
    });

    extractedPageLinks = (results[0]?.result as string[]) || [];

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
 */
export function extractLinksFromPage(urlPattern: string | null): string[] {
  const allLinks = document.querySelectorAll('a[href]');
  const uniqueUrls = new Set<string>();

  allLinks.forEach((a) => {
    const href = (a as HTMLAnchorElement).href;
    if (href && href.startsWith('http')) {
      try {
        const url = new URL(href);
        let normalized = url.origin + url.pathname.replace(/\/$/, '');

        if (urlPattern) {
          try {
            const regex = new RegExp(urlPattern, 'i');
            if (regex.test(href)) {
              uniqueUrls.add(normalized);
            }
          } catch {
            uniqueUrls.add(normalized);
          }
        } else {
          uniqueUrls.add(normalized);
        }
      } catch {
        // Invalid URL, skip
      }
    }
  });

  return Array.from(uniqueUrls);
}

/**
 * Compare extracted links with known child links and render results
 */
export function compareLinksAndRender(): void {
  if (!currentLinkDiscovery) return;

  const knownUrls = new Set<string>();
  const childLinks = currentLinkDiscovery.child_links || [];

  childLinks.forEach((link) => {
    const normalized = normalizeUrl(link.url);
    knownUrls.add(normalized);
  });

  newDiscoveredLinks = extractedPageLinks.filter((url) => {
    const normalized = normalizeUrl(url);
    return !knownUrls.has(normalized);
  });

  selectedNewLinks = new Set(newDiscoveredLinks);

  renderLinkComparison(childLinks);
}

/**
 * Render the link comparison results
 */
export function renderLinkComparison(childLinks: ChildLink[]): void {
  if (elements.newLinksCount) elements.newLinksCount.textContent = String(newDiscoveredLinks.length);
  if (elements.knownLinksCount) elements.knownLinksCount.textContent = String(childLinks.length);

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

    elements.newLinksList.querySelectorAll('.new-link-checkbox').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const checkbox = e.target as HTMLInputElement;
        if (checkbox.checked) {
          selectedNewLinks.add(checkbox.dataset.url!);
        } else {
          selectedNewLinks.delete(checkbox.dataset.url!);
        }
        updateSelectedLinksCount();
      });
    });
  }

  if (elements.selectAllNewLinks) {
    elements.selectAllNewLinks.checked = newDiscoveredLinks.length > 0;
    elements.selectAllNewLinks.disabled = newDiscoveredLinks.length === 0;
  }

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
export function updateSelectedLinksCount(): void {
  const count = selectedNewLinks.size;
  if (elements.selectedLinksCountEl) elements.selectedLinksCountEl.textContent = String(count);
  if (elements.addNewLinksBtn) {
    elements.addNewLinksBtn.style.display = count > 0 ? 'block' : 'none';
    elements.addNewLinksBtn.disabled = count === 0;
  }
}

/**
 * Add selected new links to the pipeline via API
 */
export async function addNewLinksToPipeline(): Promise<void> {
  const linksToAdd = Array.from(selectedNewLinks);
  if (linksToAdd.length === 0 || !currentLinkDiscovery || !settings) return;

  const btn = elements.addNewLinksBtn;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Adding...';
  }

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
      const errorData = await response.json().catch(() => ({})) as { message?: string };
      throw new Error(errorData.message || `HTTP ${response.status}`);
    }

    const data = await response.json() as { created_count: number };
    callbacks.showToast?.(`Added ${data.created_count} new links to pipeline`);

    await updateUrlStatus();
  } catch (error) {
    console.error('[EventAtlas] Error adding links:', error);
    callbacks.showToast?.('Error adding links: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `Add <span id="selectedLinksCount">${selectedNewLinks.size}</span> Selected Links to Pipeline`;
    }
  }
}

/**
 * Toggle all new links selection
 */
export function toggleSelectAllNewLinks(selectAll: boolean): void {
  if (selectAll) {
    selectedNewLinks = new Set(newDiscoveredLinks);
  } else {
    selectedNewLinks.clear();
  }

  if (elements.newLinksList) {
    elements.newLinksList.querySelectorAll('.new-link-checkbox').forEach((cb) => {
      (cb as HTMLInputElement).checked = selectAll;
    });
  }

  updateSelectedLinksCount();
}
