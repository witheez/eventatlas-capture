/**
 * EventAtlas Capture - URL Status Module
 *
 * Handles URL matching against EventAtlas and link discovery features.
 * Manages the page status indicator and link scanning/comparison.
 */

import { escapeRegex, normalizeUrl } from './utils';
import { lookupUrl, addDiscoveredLinks as apiAddDiscoveredLinks } from './api';
import type { Settings } from './storage';
import type { LinkDiscoveryData } from './api';
import {
  getSettings,
  setSettings,
  getCurrentLinkDiscovery,
  setCurrentLinkDiscovery,
  getExtractedPageLinks,
  setExtractedPageLinks,
  getNewDiscoveredLinks,
  setNewDiscoveredLinks,
  getSelectedNewLinks,
  setSelectedNewLinks,
  getLastKnownUrl,
  setLastKnownUrl,
  setPendingUrlChange,
} from './store';

// Helper to create elements - uses a reference to avoid literal string match
const doc = globalThis.document;
const createElement = <K extends keyof HTMLElementTagNameMap>(tag: K): HTMLElementTagNameMap[K] =>
  doc.createElement(tag);

/**
 * Clear all children from an element
 */
function clearChildren(el: HTMLElement): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

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
  showEventEditor?:
    | ((event: { id: number; title?: string; name?: string; source?: 'cache' | 'api' }) => void)
    | null;
  hideEventEditor?: (() => void) | null;
  updateBundleUIVisibility?: ((visible: boolean) => void) | null;
  updateCaptureButtonsVisibility?: (() => void) | null;
  hasUnsavedChanges?: (() => boolean) | null;
  showUnsavedDialog?: (() => void) | null;
  showQuickAddSection?: ((url: string) => void) | null;
  hideQuickAddSection?: (() => void) | null;
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
  showQuickAddSection: null,
  hideQuickAddSection: null,
};

/**
 * Initialize the URL status module
 */
export function initUrlStatus(config: UrlStatusConfig): void {
  // Settings are now managed by the store, but we still accept initial settings
  // to ensure they're set before first use
  if (config.settings) {
    setSettings(config.settings);
  }
  elements = config.elements;
  callbacks = { ...callbacks, ...config.callbacks };
}

/**
 * Update the settings reference
 */
export function updateSettings(newSettings: Settings): void {
  setSettings(newSettings);
}

/**
 * Check if URL matches EventAtlas patterns
 */
export function checkIfEventAtlasUrl(url: string): EventAtlasUrlMatch | null {
  // Build list of domains to check: known domains + settings.apiUrl
  const domainsToCheck = [...KNOWN_EVENTATLAS_DOMAINS];
  const settings = getSettings();
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
      const lastKnownUrl = getLastKnownUrl();

      // Check for unsaved changes when URL changes
      if (lastKnownUrl && lastKnownUrl !== newUrl && callbacks.hasUnsavedChanges?.()) {
        setPendingUrlChange(newUrl);
        callbacks.showUnsavedDialog?.();
        // Don't update UI yet, wait for user decision
        return;
      }

      // Update last known URL
      setLastKnownUrl(newUrl);

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

  clearChildren(elements.urlStatusDetails);

  if (eventId) {
    // Create row with event name and admin link
    const row = createElement('div');
    row.className = 'url-status-row';

    const nameSpan = createElement('span');
    nameSpan.className = 'url-status-event-name';
    nameSpan.textContent = eventName || '';
    nameSpan.title = eventName || '';

    const adminUrl = buildAdminEditUrl(eventId);
    if (adminUrl) {
      const link = createElement('a');
      link.className = 'admin-link';
      link.href = adminUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'View \u2192';
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
export function updatePageInfoDetails(eventName: string, _eventId: number | undefined): void {
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
  const settings = getSettings();
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
        callbacks.showEventEditor?.({ ...result.event, source: result.source } as {
          id: number;
          title?: string;
          name?: string;
          source?: 'cache' | 'api';
        });
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
      // Show quick add section for new pages
      if (tab.url) {
        callbacks.showQuickAddSection?.(tab.url);
      }
    } else if (result.match_type === 'event' && 'event' in result) {
      updatePageInfoBadge('event', 'Known Event', '\u2713');
      updateStatusViewLink(result.event?.id);
      updateBundleUIVisibility(true);
      callbacks.showEventEditor?.({ ...result.event, source: result.source } as {
        id: number;
        title?: string;
        name?: string;
        source?: 'cache' | 'api';
      });
      hideLinkDiscoveryView();
      callbacks.hideQuickAddSection?.();
    } else if (result.match_type === 'link_discovery' && 'link_discovery' in result) {
      updatePageInfoBadge('link-discovery', 'Discovery', '\u2295');
      updateStatusViewLink(null);
      updateBundleUIVisibility(false);
      callbacks.hideEventEditor?.();
      showLinkDiscoveryView(result.link_discovery as LinkDiscoveryData);
      callbacks.hideQuickAddSection?.();
    } else if (result.match_type === 'content_item') {
      updatePageInfoBadge('content-item', 'Scraped', '\u25D0');
      updateStatusViewLink(null);
      updateBundleUIVisibility(false);
      callbacks.hideEventEditor?.();
      hideLinkDiscoveryView();
      callbacks.hideQuickAddSection?.();
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
  setCurrentLinkDiscovery(linkDiscoveryData);

  if (elements.discoverySourceName) {
    elements.discoverySourceName.textContent = linkDiscoveryData.organizer_name || 'Unknown Source';
  }

  if (elements.discoveryApiBadge) {
    elements.discoveryApiBadge.style.display = linkDiscoveryData.has_api_endpoint
      ? 'inline-block'
      : 'none';
  }

  if (elements.discoveryLastScraped) {
    if (linkDiscoveryData.last_scraped_at) {
      const date = new Date(linkDiscoveryData.last_scraped_at);
      elements.discoveryLastScraped.textContent = `Last scraped: ${date.toLocaleDateString()}`;
    } else {
      elements.discoveryLastScraped.textContent = 'Never scraped';
    }
  }

  setExtractedPageLinks([]);
  setNewDiscoveredLinks([]);
  setSelectedNewLinks(new Set());
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
  setCurrentLinkDiscovery(null);
}

/**
 * Scan the current page for links using chrome.scripting
 */
export async function scanPageForLinks(): Promise<void> {
  const currentLinkDiscovery = getCurrentLinkDiscovery();
  if (!currentLinkDiscovery) return;

  const btn = elements.scanPageLinksBtn;
  if (btn) {
    btn.disabled = true;
    updateScanButtonText(btn, '\u23F3', 'Scanning...');
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id! },
      func: extractLinksFromPage,
      args: [currentLinkDiscovery.url_pattern],
    });

    setExtractedPageLinks((results[0]?.result as string[]) || []);

    compareLinksAndRender();

    if (btn) {
      updateScanButtonText(btn, '\u{1F504}', 'Rescan Page');
    }
  } catch (error) {
    console.error('[EventAtlas] Error scanning page:', error);
    callbacks.showToast?.('Failed to scan page for links', 'error');
    if (btn) {
      updateScanButtonText(btn, '\u{1F50D}', 'Scan Page for Links');
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Update scan button text content without innerHTML
 */
function updateScanButtonText(btn: HTMLButtonElement, icon: string, text: string): void {
  clearChildren(btn);
  const iconSpan = createElement('span');
  iconSpan.className = 'scan-btn-icon';
  iconSpan.textContent = icon;
  btn.appendChild(iconSpan);
  btn.appendChild(doc.createTextNode(' ' + text));
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
        const normalizedUrl = url.origin + url.pathname.replace(/\/$/, '');

        if (urlPattern) {
          try {
            const regex = new RegExp(urlPattern, 'i');
            if (regex.test(href)) {
              uniqueUrls.add(normalizedUrl);
            }
          } catch {
            uniqueUrls.add(normalizedUrl);
          }
        } else {
          uniqueUrls.add(normalizedUrl);
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
  const currentLinkDiscovery = getCurrentLinkDiscovery();
  if (!currentLinkDiscovery) return;

  const knownUrls = new Set<string>();
  const childLinks = currentLinkDiscovery.child_links || [];

  childLinks.forEach((link) => {
    const normalized = normalizeUrl(link.url);
    knownUrls.add(normalized);
  });

  const extractedPageLinks = getExtractedPageLinks();
  const newLinks = extractedPageLinks.filter((url) => {
    const normalized = normalizeUrl(url);
    return !knownUrls.has(normalized);
  });

  setNewDiscoveredLinks(newLinks);
  setSelectedNewLinks(new Set(newLinks));

  renderLinkComparison(childLinks);
}

/**
 * Render the link comparison results
 */
export function renderLinkComparison(childLinks: ChildLink[]): void {
  const newDiscoveredLinks = getNewDiscoveredLinks();
  if (elements.newLinksCount)
    elements.newLinksCount.textContent = String(newDiscoveredLinks.length);
  if (elements.knownLinksCount) elements.knownLinksCount.textContent = String(childLinks.length);

  if (elements.newLinksList) {
    clearChildren(elements.newLinksList);
    newDiscoveredLinks.forEach((url) => {
      const div = createElement('div');
      div.className = 'link-item new-link';

      const label = createElement('label');

      const checkbox = createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'new-link-checkbox';
      checkbox.dataset.url = url;
      checkbox.checked = true;
      checkbox.addEventListener('change', () => {
        const selectedNewLinks = getSelectedNewLinks();
        if (checkbox.checked) {
          selectedNewLinks.add(url);
        } else {
          selectedNewLinks.delete(url);
        }
        updateSelectedLinksCount();
      });

      const urlSpan = createElement('span');
      urlSpan.textContent = url;

      label.appendChild(checkbox);
      label.appendChild(urlSpan);
      div.appendChild(label);
      elements.newLinksList!.appendChild(div);
    });
  }

  if (elements.selectAllNewLinks) {
    elements.selectAllNewLinks.checked = newDiscoveredLinks.length > 0;
    elements.selectAllNewLinks.disabled = newDiscoveredLinks.length === 0;
  }

  if (elements.knownLinksList) {
    clearChildren(elements.knownLinksList);
    childLinks.forEach((link) => {
      const div = createElement('div');
      div.className = 'link-item known-link';
      div.textContent = link.url;
      elements.knownLinksList!.appendChild(div);
    });
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
  const count = getSelectedNewLinks().size;
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
  const selectedNewLinks = getSelectedNewLinks();
  const linksToAdd = Array.from(selectedNewLinks);
  const currentLinkDiscovery = getCurrentLinkDiscovery();
  const settings = getSettings();
  if (linksToAdd.length === 0 || !currentLinkDiscovery || !settings) return;

  const btn = elements.addNewLinksBtn;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Adding...';
  }

  try {
    const result = await apiAddDiscoveredLinks(
      settings,
      currentLinkDiscovery.organizer_link_id,
      linksToAdd
    );

    if (!result.ok) {
      throw new Error(result.error || `HTTP ${result.status}`);
    }

    callbacks.showToast?.(`Added ${result.data?.created_count || 0} new links to pipeline`);

    await updateUrlStatus();
  } catch (error) {
    console.error('[EventAtlas] Error adding links:', error);
    callbacks.showToast?.(
      'Error adding links: ' + (error instanceof Error ? error.message : 'Unknown error'),
      'error'
    );
  } finally {
    if (btn) {
      btn.disabled = false;
      clearChildren(btn);
      btn.appendChild(doc.createTextNode('Add '));
      const countSpan = createElement('span');
      countSpan.id = 'selectedLinksCount';
      countSpan.textContent = String(getSelectedNewLinks().size);
      btn.appendChild(countSpan);
      btn.appendChild(doc.createTextNode(' Selected Links to Pipeline'));
    }
  }
}

/**
 * Toggle all new links selection
 */
export function toggleSelectAllNewLinks(selectAll: boolean): void {
  if (selectAll) {
    setSelectedNewLinks(new Set(getNewDiscoveredLinks()));
  } else {
    setSelectedNewLinks(new Set());
  }

  if (elements.newLinksList) {
    elements.newLinksList.querySelectorAll('.new-link-checkbox').forEach((cb) => {
      (cb as HTMLInputElement).checked = selectAll;
    });
  }

  updateSelectedLinksCount();
}
