/**
 * EventAtlas Capture - Event List Functions
 *
 * Handles Event List tab UI: filtering, fetching, rendering, navigation.
 * Uses a factory pattern to receive dependencies from sidepanel.js.
 */

import { escapeHtml, fixUrl } from './utils';
import {
  fetchEventList as apiFetchEventList,
  markEventVisited as apiMarkEventVisited,
} from './api';
import type { Settings, FilterState } from './storage';

// Type definitions
export interface EventListEvent {
  id: number;
  name: string;
  start_datetime?: string;
  primary_url?: string;
  primary_link_id?: number;
  event_type?: string;
  tags?: string[];
  distances?: number[];
  missing?: string[];
}

interface EventListElements {
  tabNavigation: HTMLElement | null;
  bundlesView: HTMLElement | null;
  eventListView: HTMLElement | null;
  eventListContainer: HTMLElement | null;
  eventListLoading: HTMLElement | null;
  eventListEmpty: HTMLElement | null;
  backNav: HTMLElement | null;
  filterMissingTags: HTMLInputElement | null;
  filterMissingDistances: HTMLInputElement | null;
  autoSwitchTabSetting: HTMLInputElement | null;
  eventListRefreshIntervalSetting: HTMLSelectElement | null;
}

interface EventListState {
  activeTab: string;
  eventListCache: EventListEvent[];
  eventListLastFetched: number;
  filterState: FilterState;
}

interface EventListDependencies {
  elements: EventListElements;
  getSettings: () => Settings;
  getState: <K extends keyof EventListState>(
    key?: K
  ) => K extends undefined ? EventListState : EventListState[K];
  setState: <K extends keyof EventListState>(key: K, value: EventListState[K]) => void;
  saveFilterState: () => Promise<void>;
  saveToStorage: () => Promise<void>;
}

// ========================================
// Pure Functions (no dependencies)
// ========================================

/**
 * Format missing badges HTML
 */
export function formatMissingBadges(missing: string[]): string {
  return missing.map((m) => `<span class="missing-badge">${escapeHtml(m)}</span>`).join('');
}

/**
 * Format event type badge
 */
export function formatEventType(eventType: string | undefined): string {
  if (!eventType) return '';
  return `<span class="meta-badge meta-type">${escapeHtml(eventType)}</span>`;
}

/**
 * Format tags with "1 tag + x more" pattern
 */
export function formatTags(tags: string[]): string {
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
export function formatDistances(distances: number[]): string {
  if (!distances || distances.length === 0) return '';
  const formatted = distances.map((d) => `${d}km`).join(', ');
  return `<span class="meta-badge meta-distance">${escapeHtml(formatted)}</span>`;
}

/**
 * Format a date as "Jan 1, 2026"
 */
export function formatEventDate(dateString: string): string {
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
 */
export function getFirstOfMonth(monthsOffset: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + monthsOffset);
  date.setDate(1);
  return date.toISOString().split('T')[0];
}

/**
 * Get a month label like "Jan 2026"
 */
export function getMonthLabel(monthsOffset: number): string {
  const date = new Date();
  date.setMonth(date.getMonth() + monthsOffset);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Build the "Starts from" filter options with dynamic month labels
 */
export function buildStartsFromOptions(): { value: string; label: string }[] {
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
export function getStartsFromDate(presetOrDate: string | null): string | null {
  if (!presetOrDate) return null;

  switch (presetOrDate) {
    case 'this_month':
      return getFirstOfMonth(0);
    case 'next_month':
      return getFirstOfMonth(1);
    case '2_months':
      return getFirstOfMonth(2);
    case '3_months':
      return getFirstOfMonth(3);
    case '6_months':
      return getFirstOfMonth(6);
    default:
      // Assume it's an ISO date string
      if (/^\d{4}-\d{2}-\d{2}$/.test(presetOrDate)) {
        return presetOrDate;
      }
      return null;
  }
}

// ========================================
// Stateful Functions (require dependencies)
// ========================================

interface EventListAPI {
  switchMainTab: (tabName: string) => void;
  fetchEventList: () => Promise<void>;
  renderEventList: () => void;
  updateStartsFromDropdown: () => void;
  showEventListLoading: () => void;
  showEventListEmpty: (message?: string) => void;
  navigateToEvent: (event: EventListEvent) => Promise<void>;
  setupEventListRefresh: () => void;
  setupEventListeners: () => void;
}

/**
 * Initialize the event list module with dependencies
 */
export function initEventList(deps: EventListDependencies): EventListAPI {
  const { elements, getSettings, getState, setState, saveFilterState } = deps;

  // Extract DOM elements for convenience
  const {
    tabNavigation,
    bundlesView,
    eventListView,
    eventListContainer,
    eventListLoading,
    eventListEmpty,
    backNav,
    filterMissingTags,
    filterMissingDistances,
    autoSwitchTabSetting,
    eventListRefreshIntervalSetting,
  } = elements;

  // Local state reference
  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Switch between main tabs (Current / Event List)
   */
  function switchMainTab(tabName: string): void {
    setState('activeTab', tabName);

    // Update tab buttons
    if (tabNavigation) {
      tabNavigation.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.classList.toggle('active', (btn as HTMLElement).dataset.tab === tabName);
      });
    }

    // Toggle views
    if (bundlesView) bundlesView.style.display = tabName === 'current' ? 'block' : 'none';
    if (eventListView) eventListView.style.display = tabName === 'event-list' ? 'block' : 'none';

    // Hide back nav when on event list
    if (backNav) backNav.classList.remove('visible');

    // Fetch event list if switching to it and cache is empty/stale
    const cache = getState('eventListCache');
    if (tabName === 'event-list' && cache.length === 0) {
      fetchEventList();
    }
  }

  /**
   * Fetch event list from API
   */
  async function fetchEventList(): Promise<void> {
    const settings = getSettings();
    const filterState = getState('filterState');

    if (!settings.apiUrl || !settings.apiToken) {
      showEventListEmpty('Please configure API settings');
      return;
    }

    showEventListLoading();

    try {
      const startsFromDate = getStartsFromDate(filterState.startsFrom);

      const result = await apiFetchEventList(settings, {
        missingTags: filterState.missingTags,
        missingDistances: filterState.missingDistances,
        filterMode: filterState.mode,
        startsFrom: startsFromDate,
      });

      if (!result.ok) {
        throw new Error(result.error || 'Failed to fetch event list');
      }

      setState('eventListCache', result.data?.events || []);
      setState('eventListLastFetched', Date.now());

      renderEventList();
    } catch (error) {
      console.error('[EventAtlas] Event list fetch error:', error);
      showEventListEmpty('Error loading events');
    }
  }

  /**
   * Clear all children from an element
   */
  function clearChildren(el: HTMLElement): void {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  /**
   * Render the event list
   */
  function renderEventList(): void {
    if (!eventListContainer) return;

    const cache = getState('eventListCache');

    if (eventListLoading) eventListLoading.style.display = 'none';
    clearChildren(eventListContainer);

    if (cache.length === 0) {
      if (eventListEmpty) {
        eventListEmpty.textContent = 'No events match your filters';
        eventListEmpty.style.display = 'block';
      }
      return;
    }

    if (eventListEmpty) eventListEmpty.style.display = 'none';

    cache.forEach((event) => {
      const startDate = event.start_datetime ? formatEventDate(event.start_datetime) : '';
      const eventUrl = fixUrl(event.primary_url || '');

      // Create event list item using Preact rendering via render module
      // For now, use the existing HTML container which will be populated by Preact
      // This module is being deprecated in favor of Preact components
      const item = eventListContainer.ownerDocument.createElement('div');
      item.className = 'event-list-item';

      // Header
      const header = item.ownerDocument.createElement('div');
      header.className = 'event-list-item-header';

      const title = item.ownerDocument.createElement('div');
      title.className = 'event-list-item-title';
      title.textContent = event.name;
      header.appendChild(title);

      if (startDate) {
        const dateEl = item.ownerDocument.createElement('div');
        dateEl.className = 'event-list-item-date';
        dateEl.textContent = startDate;
        header.appendChild(dateEl);
      }
      item.appendChild(header);

      // URL row
      const urlRow = item.ownerDocument.createElement('div');
      urlRow.className = 'event-list-item-url-row';

      const urlEl = item.ownerDocument.createElement('div');
      urlEl.className = 'event-list-item-url';
      urlEl.textContent = eventUrl;
      urlRow.appendChild(urlEl);

      const copyBtn = item.ownerDocument.createElement('button');
      copyBtn.className = 'copy-url-btn';
      copyBtn.title = 'Copy URL';
      copyBtn.textContent = '\u{1F4CB}';
      copyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(eventUrl).then(() => {
          copyBtn.textContent = '\u2713';
          setTimeout(() => {
            copyBtn.textContent = '\u{1F4CB}';
          }, 1500);
        });
      });
      urlRow.appendChild(copyBtn);
      item.appendChild(urlRow);

      // Meta badges
      const meta = item.ownerDocument.createElement('div');
      meta.className = 'event-list-item-meta';

      if (event.event_type) {
        const typeBadge = item.ownerDocument.createElement('span');
        typeBadge.className = 'meta-badge meta-type';
        typeBadge.textContent = event.event_type;
        meta.appendChild(typeBadge);
      }

      if (event.tags && event.tags.length > 0) {
        const tagBadge = item.ownerDocument.createElement('span');
        tagBadge.className = 'meta-badge meta-tag';
        tagBadge.textContent = event.tags[0];
        meta.appendChild(tagBadge);

        if (event.tags.length > 1) {
          const moreSpan = item.ownerDocument.createElement('span');
          moreSpan.className = 'meta-more';
          moreSpan.textContent = `+${event.tags.length - 1}`;
          meta.appendChild(moreSpan);
        }
      }

      if (event.distances && event.distances.length > 0) {
        const distBadge = item.ownerDocument.createElement('span');
        distBadge.className = 'meta-badge meta-distance';
        distBadge.textContent = event.distances.map((d) => `${d}km`).join(', ');
        meta.appendChild(distBadge);
      }
      item.appendChild(meta);

      // Missing badges
      if (event.missing && event.missing.length > 0) {
        const missingDiv = item.ownerDocument.createElement('div');
        missingDiv.className = 'event-list-item-missing';
        event.missing.forEach((m) => {
          const badge = item.ownerDocument.createElement('span');
          badge.className = 'missing-badge';
          badge.textContent = m;
          missingDiv.appendChild(badge);
        });
        item.appendChild(missingDiv);
      }

      item.addEventListener('click', () => navigateToEvent(event));
      eventListContainer.appendChild(item);
    });
  }

  /**
   * Update the "Starts from" dropdown options
   */
  function updateStartsFromDropdown(): void {
    const dropdown = document.getElementById('filterStartsFrom') as HTMLSelectElement | null;
    if (!dropdown) return;

    const filterState = getState('filterState');
    const options = buildStartsFromOptions();

    // Clear existing options
    clearChildren(dropdown);

    // Create option elements
    options.forEach((opt) => {
      const optionEl = dropdown.ownerDocument.createElement('option');
      optionEl.value = opt.value;
      optionEl.textContent = opt.label;
      dropdown.appendChild(optionEl);
    });

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
  function showEventListLoading(): void {
    if (eventListContainer) clearChildren(eventListContainer);
    if (eventListEmpty) eventListEmpty.style.display = 'none';
    if (eventListLoading) eventListLoading.style.display = 'block';
  }

  /**
   * Show empty state for event list
   */
  function showEventListEmpty(message?: string): void {
    if (eventListContainer) clearChildren(eventListContainer);
    if (eventListLoading) eventListLoading.style.display = 'none';
    if (eventListEmpty) {
      eventListEmpty.textContent = message || 'No events match your filters';
      eventListEmpty.style.display = 'block';
    }
  }

  /**
   * Navigate to an event URL and optionally switch to Current tab
   */
  async function navigateToEvent(event: EventListEvent): Promise<void> {
    const settings = getSettings();

    // Mark as visited if we have the link ID
    if (event.primary_link_id && settings.apiUrl && settings.apiToken) {
      try {
        await apiMarkEventVisited(settings, event.primary_link_id);
      } catch (e) {
        console.warn('[EventAtlas] Failed to mark visit:', e);
      }
    }

    // Navigate browser to URL (with www. fix for domains that need it)
    if (event.primary_url) {
      chrome.tabs.update({ url: fixUrl(event.primary_url) });
    }

    // Auto-switch to Current tab if enabled
    if (settings.autoSwitchTab) {
      switchMainTab('current');
    }
  }

  /**
   * Setup background refresh timer for event list
   */
  function setupEventListRefresh(): void {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }

    const settings = getSettings();
    const interval = (settings.eventListRefreshInterval || 0) * 60 * 1000;

    if (interval > 0) {
      refreshTimer = setInterval(() => {
        const activeTab = getState('activeTab');
        if (activeTab === 'event-list') {
          fetchEventList();
        }
      }, interval);
    }
  }

  /**
   * Setup event listeners for event list tab
   */
  function setupEventListeners(): void {
    // Tab navigation
    if (tabNavigation) {
      tabNavigation.querySelectorAll('.tab-btn').forEach((btn) => {
        btn.addEventListener('click', () =>
          switchMainTab((btn as HTMLElement).dataset.tab || 'current')
        );
      });
    }

    // Missing tags filter
    if (filterMissingTags) {
      filterMissingTags.addEventListener('change', async (e) => {
        const filterState = getState('filterState');
        filterState.missingTags = (e.target as HTMLInputElement).checked;
        setState('filterState', filterState);
        await saveFilterState();
        fetchEventList();
      });
    }

    // Missing distances filter
    if (filterMissingDistances) {
      filterMissingDistances.addEventListener('change', async (e) => {
        const filterState = getState('filterState');
        filterState.missingDistances = (e.target as HTMLInputElement).checked;
        setState('filterState', filterState);
        await saveFilterState();
        fetchEventList();
      });
    }

    // Starts from filter dropdown
    const filterStartsFrom = document.getElementById(
      'filterStartsFrom'
    ) as HTMLSelectElement | null;
    const customDateInput = document.getElementById('filterCustomDate') as HTMLInputElement | null;
    const customDateContainer = document.getElementById(
      'customDateContainer'
    ) as HTMLElement | null;

    if (filterStartsFrom) {
      filterStartsFrom.addEventListener('change', async (e) => {
        const value = (e.target as HTMLSelectElement).value;
        const filterState = getState('filterState');
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
          setState('filterState', filterState);
          await saveFilterState();
          fetchEventList();
        }
      });
    }

    if (customDateInput) {
      customDateInput.addEventListener('change', async (e) => {
        const filterState = getState('filterState');
        filterState.startsFrom = (e.target as HTMLInputElement).value || null;
        setState('filterState', filterState);
        await saveFilterState();
        fetchEventList();
      });
    }

    // Filter mode toggle
    document.querySelectorAll('.filter-mode-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        document.querySelectorAll('.filter-mode-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const filterState = getState('filterState');
        filterState.mode = (btn as HTMLElement).dataset.mode || 'and';
        setState('filterState', filterState);
        await saveFilterState();
        fetchEventList();
      });
    });

    // Event List Settings listeners
    if (autoSwitchTabSetting) {
      autoSwitchTabSetting.addEventListener('change', async () => {
        const settings = getSettings();
        settings.autoSwitchTab = autoSwitchTabSetting.checked;
        deps.saveToStorage();
      });
    }

    if (eventListRefreshIntervalSetting) {
      eventListRefreshIntervalSetting.addEventListener('change', async () => {
        const settings = getSettings();
        settings.eventListRefreshInterval = parseInt(eventListRefreshIntervalSetting.value, 10);
        deps.saveToStorage();
        setupEventListRefresh();
      });
    }
  }

  // Return public API
  return {
    switchMainTab,
    fetchEventList,
    renderEventList,
    updateStartsFromDropdown,
    showEventListLoading,
    showEventListEmpty,
    navigateToEvent,
    setupEventListRefresh,
    setupEventListeners,
  };
}
