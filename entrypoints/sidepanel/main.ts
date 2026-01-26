/**
 * EventAtlas Capture - Side Panel Script
 *
 * Handles side panel UI interactions, preview display, and bundle storage
 * for captured page data. Supports multi-page bundling with persistence.
 * Uses accordion-style bundles with drag-and-drop between bundles.
 */

import { formatBytes, getDomain, normalizeUrl, escapeRegex, escapeHtml, generateId, fixUrl } from './utils';
import { syncWithApi, lookupUrl, testApiConnection, fetchTags, fetchEventTypes, fetchDistances } from './api';
import type { Settings, Bundle, Capture, FilterState, DistancePreset } from './storage';
import {
  saveToStorage as saveToStorageRaw,
  loadFromStorage as loadFromStorageRaw,
  clearAllStorage as clearAllStorageRaw,
  saveFilterState as saveFilterStateRaw,
  loadFilterState as loadFilterStateRaw,
} from './storage';
import {
  initUploadQueue,
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
} from './upload-queue';
import { initEventEditor } from './event-editor';
import type { EventEditorAPI, MatchedEvent, PendingScreenshot } from './event-editor';
import { initCapture } from './capture';
// Import centralized state store
import {
  DEFAULT_SETTINGS,
  DEFAULT_FILTER_STATE,
  // Core data
  getBundles,
  setBundles,
  getBundleById,
  getSettings,
  setSettings,
  getFilterState,
  setFilterState,
  // View state
  getCurrentView,
  setCurrentView,
  getCurrentBundleId,
  setCurrentBundleId,
  getCurrentBundle,
  getCurrentPageIndex,
  setCurrentPageIndex,
  getActiveTab,
  setActiveTab,
  // Detail view state
  getSelectedImages,
  setSelectedImages,
  getTextExpanded,
  setTextExpanded,
  // Pending operations
  getPendingCapture,
  setPendingCapture,
  getDraggedPage,
  setDraggedPage,
  // Event list state
  getEventListCache,
  setEventListCache,
  getEventListLastFetched,
  setEventListLastFetched,
  getEventListRefreshTimer,
  setEventListRefreshTimer,
  // Event editor state
  getCurrentMatchedEvent,
  setCurrentMatchedEvent,
  getAvailableTags,
  setAvailableTags,
  getAvailableEventTypes,
  setAvailableEventTypes,
  getAvailableDistances,
  setAvailableDistances,
  getSelectedEventTypeId,
  setSelectedEventTypeId,
  getSelectedTagIds,
  setSelectedTagIds,
  getSelectedDistanceValues,
  setSelectedDistanceValues,
  getEventEditorExpanded,
  setEventEditorExpanded,
  getPendingScreenshots,
  setPendingScreenshots,
  // URL tracking
  getLastKnownUrl,
  setLastKnownUrl,
  getPendingUrlChange,
  setPendingUrlChange,
  // Types
  type EventListItem,
  type Tag,
  type EventType,
  type Distance,
  type DraggedPage,
  type PendingCaptureData,
} from './store';

// Import pure functions from event-list.js (no state dependencies)
import {
  formatMissingBadges,
  formatEventType,
  formatTags,
  formatDistances,
  formatEventDate,
  getFirstOfMonth,
  getMonthLabel,
  buildStartsFromOptions,
  getStartsFromDate,
} from './event-list';

// Import URL status module functions
import {
  initUrlStatus,
  updateSettings as updateUrlStatusSettings,
  checkIfEventAtlasUrl,
  buildAdminEditUrl,
  updateTabInfo,
  updateUrlStatus,
  hideLinkDiscoveryView,
  scanPageForLinks,
  addNewLinksToPipeline,
  toggleSelectAllNewLinks,
} from './url-status';

// Storage keys
const STORAGE_KEY = 'eventatlas_capture_data';
const OLD_STORAGE_KEY = 'eventatlas_capture_bundle'; // Legacy key for migration
const SYNC_DATA_KEY = 'eventatlas_sync_data';
const MAX_BUNDLE_PAGES = 20;
const MAX_BUNDLES = 50;

// Storage key for filter state persistence
const FILTER_STATE_KEY = 'eventatlas_filter_state';

// Storage wrapper functions that use centralized store
async function saveToStorage(): Promise<void> {
  await saveToStorageRaw(STORAGE_KEY, { bundles: getBundles(), settings: getSettings() });
}

async function loadFromStorage(): Promise<boolean> {
  const result = await loadFromStorageRaw(
    STORAGE_KEY,
    OLD_STORAGE_KEY,
    DEFAULT_SETTINGS,
    { migrateOldDistancePresets, getDomain, generateId }
  );
  setBundles(result.bundles);
  setSettings(result.settings);
  if (result.migrated) {
    await saveToStorage();
  }
  return result.bundles.length > 0 || result.migrated;
}

async function clearAllStorage(): Promise<void> {
  setBundles([]);
  await clearAllStorageRaw(STORAGE_KEY, getSettings());
}

async function saveFilterState(): Promise<void> {
  await saveFilterStateRaw(FILTER_STATE_KEY, getFilterState());
}

async function loadFilterState(): Promise<void> {
  setFilterState(await loadFilterStateRaw(FILTER_STATE_KEY, DEFAULT_FILTER_STATE));
}

// DOM Elements - Views
const bundlesView = document.getElementById('bundlesView') as HTMLElement;
const detailView = document.getElementById('detailView') as HTMLElement;
const backNav = document.getElementById('backNav') as HTMLElement;
const backNavText = document.getElementById('backNavText') as HTMLElement;
const tabNavigation = document.getElementById('tabNavigation') as HTMLElement | null;

// DOM Elements - Event List View
const eventListView = document.getElementById('eventListView') as HTMLElement | null;
const eventListContainer = document.getElementById('eventListContainer') as HTMLElement | null;
const eventListLoading = document.getElementById('eventListLoading') as HTMLElement | null;
const eventListEmpty = document.getElementById('eventListEmpty') as HTMLElement | null;
const filterMissingTags = document.getElementById('filterMissingTags') as HTMLInputElement | null;
const filterMissingDistances = document.getElementById('filterMissingDistances') as HTMLInputElement | null;
const refreshEventListBtn = document.getElementById('refreshEventList') as HTMLButtonElement | null;

// DOM Elements - Event List Settings
const autoSwitchTabSetting = document.getElementById('autoSwitchTabSetting') as HTMLInputElement | null;
const eventListRefreshIntervalSetting = document.getElementById('eventListRefreshInterval') as HTMLSelectElement | null;

// DOM Elements - Settings
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const refreshBtn = document.getElementById('refreshBtn') as HTMLElement;
const settingsPanel = document.getElementById('settingsPanel') as HTMLElement;
const autoGroupSetting = document.getElementById('autoGroupSetting') as HTMLInputElement;
const screenshotDefaultSetting = document.getElementById('screenshotDefaultSetting') as HTMLInputElement;

// DOM Elements - API Settings
const apiUrlSetting = document.getElementById('apiUrlSetting') as HTMLInputElement;
const apiTokenSetting = document.getElementById('apiTokenSetting') as HTMLInputElement;
const toggleTokenVisibility = document.getElementById('toggleTokenVisibility') as HTMLButtonElement;
const syncModeSetting = document.getElementById('syncModeSetting') as HTMLSelectElement;
const customDistancePresetsSetting = document.getElementById('customDistancePresets') as HTMLInputElement;
const distancePresetToggles = document.getElementById('distancePresetToggles') as HTMLElement | null;
const saveSettingsBtn = document.getElementById('saveSettingsBtn') as HTMLButtonElement;
const testConnectionBtn = document.getElementById('testConnectionBtn') as HTMLButtonElement;
const connectionStatus = document.getElementById('connectionStatus') as HTMLElement;

// DOM Elements - Bundles view
const pageTitleEl = document.getElementById('pageTitle') as HTMLElement;
const pageUrlEl = document.getElementById('pageUrl') as HTMLElement;
const captureBtn = document.getElementById('captureBtn') as HTMLButtonElement;
const captureBtnGroup = document.getElementById('captureBtnGroup') as HTMLElement;
const captureNoScreenshotBtn = document.getElementById('captureNoScreenshotBtn') as HTMLButtonElement;
const captureWithScreenshotBtn = document.getElementById('captureWithScreenshotBtn') as HTMLButtonElement;
const captureBadge = document.getElementById('captureBadge') as HTMLElement;
const bundlesList = document.getElementById('bundlesList') as HTMLElement;
const bundlesCount = document.getElementById('bundlesCount') as HTMLElement;
const newBundleBtn = document.getElementById('newBundleBtn') as HTMLButtonElement;
const clearAllBundlesBtn = document.getElementById('clearAllBundlesBtn') as HTMLButtonElement;

// DOM Elements - Error/Dialog
const errorMessageEl = document.getElementById('errorMessage') as HTMLElement;
const errorTitleEl = document.getElementById('errorTitle') as HTMLElement;
const errorHintEl = document.getElementById('errorHint') as HTMLElement;
const duplicateDialog = document.getElementById('duplicateDialog') as HTMLElement;
const duplicateText = document.getElementById('duplicateText') as HTMLElement;
const duplicateReplace = document.getElementById('duplicateReplace') as HTMLButtonElement;
const duplicateSkip = document.getElementById('duplicateSkip') as HTMLButtonElement;

// DOM Elements - Detail view
const previewEl = document.getElementById('preview') as HTMLElement;
const htmlSizeStat = document.getElementById('htmlSizeStat') as HTMLElement;
const textSizeStat = document.getElementById('textSizeStat') as HTMLElement;
const imageSizeStat = document.getElementById('imageSizeStat') as HTMLElement;
const editTitle = document.getElementById('editTitle') as HTMLInputElement;
const editUrl = document.getElementById('editUrl') as HTMLInputElement;
const screenshotSection = document.getElementById('screenshotSection') as HTMLElement;
const screenshotBadge = document.getElementById('screenshotBadge') as HTMLElement;
const screenshotContainer = document.getElementById('screenshotContainer') as HTMLElement;
const screenshotPlaceholder = document.getElementById('screenshotPlaceholder') as HTMLElement;
const screenshotThumb = document.getElementById('screenshotThumb') as HTMLImageElement;
const screenshotModal = document.getElementById('screenshotModal') as HTMLElement;
const screenshotModalClose = document.getElementById('screenshotModalClose') as HTMLElement;
const screenshotModalImg = document.getElementById('screenshotModalImg') as HTMLImageElement;
const addScreenshotBtn = document.getElementById('addScreenshotBtn') as HTMLButtonElement;
const textPreview = document.getElementById('textPreview') as HTMLElement;
const textCharCount = document.getElementById('textCharCount') as HTMLElement;
const textToggle = document.getElementById('textToggle') as HTMLElement;
const imageGallery = document.getElementById('imageGallery') as HTMLElement;
const imageSelectedCount = document.getElementById('imageSelectedCount') as HTMLElement;
const metadataSection = document.getElementById('metadataSection') as HTMLElement;
const metadataList = document.getElementById('metadataList') as HTMLElement;
const includeHtml = document.getElementById('includeHtml') as HTMLInputElement;
const includeImages = document.getElementById('includeImages') as HTMLInputElement;
const includeScreenshot = document.getElementById('includeScreenshot') as HTMLInputElement;
const moveBundleSelect = document.getElementById('moveBundleSelect') as HTMLSelectElement;
const copyBtn = document.getElementById('copyBtn') as HTMLButtonElement;
const removeBtn = document.getElementById('removeBtn') as HTMLButtonElement;

// DOM Elements - Toast
const toastEl = document.getElementById('toast') as HTMLElement;

// DOM Elements - Header
const headerTitle = document.getElementById('headerTitle') as HTMLElement | null;

// DOM Elements - URL Status (legacy, kept for compatibility)
const urlStatusContainer = document.getElementById('urlStatusContainer') as HTMLElement | null;
const urlStatusBadge = document.getElementById('urlStatusBadge') as HTMLElement | null;
const urlStatusDetails = document.getElementById('urlStatusDetails') as HTMLElement | null;

// DOM Elements - Combined Page Info
const pageInfoSection = document.getElementById('pageInfoSection') as HTMLElement | null;
const statusSection = document.getElementById('statusSection') as HTMLElement | null;
const pageInfoBadge = document.getElementById('pageInfoBadge') as HTMLElement | null;
const pageInfoBadgeIcon = document.getElementById('pageInfoBadgeIcon') as HTMLElement | null;
const pageInfoBadgeText = document.getElementById('pageInfoBadgeText') as HTMLElement | null;
const statusViewLink = document.getElementById('statusViewLink') as HTMLAnchorElement | null;
const pageInfoDetails = document.getElementById('pageInfoDetails') as HTMLElement | null;
const pageInfoEventName = document.getElementById('pageInfoEventName') as HTMLElement | null;
const pageInfoAdminLink = document.getElementById('pageInfoAdminLink') as HTMLAnchorElement | null;

// DOM Elements - Bundle Section (for conditional visibility)
const captureButtons = document.getElementById('captureButtons') as HTMLElement | null;
const bundleSection = document.querySelector('.bundle-section') as HTMLElement | null;

// DOM Elements - Link Discovery View
const linkDiscoveryView = document.getElementById('linkDiscoveryView') as HTMLElement | null;
const discoverySourceName = document.getElementById('discoverySourceName') as HTMLElement | null;
const discoveryApiBadge = document.getElementById('discoveryApiBadge') as HTMLElement | null;
const discoveryLastScraped = document.getElementById('discoveryLastScraped') as HTMLElement | null;
const scanPageLinksBtn = document.getElementById('scanPageLinks') as HTMLButtonElement | null;
const linkComparisonResults = document.getElementById('linkComparisonResults') as HTMLElement | null;
const newLinksCount = document.getElementById('newLinksCount') as HTMLElement | null;
const knownLinksCount = document.getElementById('knownLinksCount') as HTMLElement | null;
const newLinksList = document.getElementById('newLinksList') as HTMLElement | null;
const knownLinksList = document.getElementById('knownLinksList') as HTMLElement | null;
const selectAllNewLinks = document.getElementById('selectAllNewLinks') as HTMLInputElement | null;
const addNewLinksBtn = document.getElementById('addNewLinksBtn') as HTMLButtonElement | null;
const selectedLinksCountEl = document.getElementById('selectedLinksCount') as HTMLElement | null;

// DOM Elements - Event Editor
const eventEditor = document.getElementById('eventEditor') as HTMLElement | null;
const eventEditorAccordionHeader = document.getElementById('eventEditorAccordionHeader') as HTMLElement | null;
const eventEditorChevron = document.getElementById('eventEditorChevron') as HTMLElement | null;
const eventEditorContent = document.getElementById('eventEditorContent') as HTMLElement | null;
const editorEventName = document.getElementById('editorEventName') as HTMLElement | null;
const editorPageTitle = document.getElementById('editorPageTitle') as HTMLElement | null;
const editorPageUrl = document.getElementById('editorPageUrl') as HTMLElement | null;
const editorBadge = document.getElementById('editorBadge') as HTMLElement | null;
const editorViewLink = document.getElementById('editorViewLink') as HTMLAnchorElement | null;
const editorLoading = document.getElementById('editorLoading') as HTMLElement | null;
const editorContent = document.getElementById('editorContent') as HTMLElement | null;
const editorEventTypes = document.getElementById('editorEventTypes') as HTMLElement | null;
const editorTags = document.getElementById('editorTags') as HTMLElement | null;
const editorDistances = document.getElementById('editorDistances') as HTMLElement | null;
const customDistanceInput = document.getElementById('customDistanceInput') as HTMLInputElement | null;
const addCustomDistanceBtn = document.getElementById('addCustomDistanceBtn') as HTMLButtonElement | null;
const selectedDistancesEl = document.getElementById('selectedDistances') as HTMLElement | null;
const editorNotes = document.getElementById('editorNotes') as HTMLTextAreaElement | null;
const editorSaveBtn = document.getElementById('editorSaveBtn') as HTMLButtonElement | null;
const captureEventScreenshotBtn = document.getElementById('captureEventScreenshotBtn') as HTMLButtonElement | null;
const captureEventHtmlBtn = document.getElementById('captureEventHtmlBtn') as HTMLButtonElement | null;
const savedScreenshotsEl = document.getElementById('savedScreenshots') as HTMLElement | null;

// Module instances (initialized in init())
let eventEditorModule: EventEditorAPI | null = null;
let captureModule: ReturnType<typeof initCapture> | null = null;

// DOM Elements - Screenshot Upload Timing Setting
const screenshotUploadTimingSetting = document.getElementById('screenshotUploadTiming') as HTMLSelectElement;

// DOM Elements - Unsaved Changes Dialog
const unsavedDialog = document.getElementById('unsavedDialog') as HTMLElement;
const unsavedDialogText = document.getElementById('unsavedDialogText') as HTMLElement;
const unsavedSaveBtn = document.getElementById('unsavedSaveBtn') as HTMLButtonElement;
const unsavedDiscardBtn = document.getElementById('unsavedDiscardBtn') as HTMLButtonElement;
const unsavedCancelBtn = document.getElementById('unsavedCancelBtn') as HTMLButtonElement;

// checkIfEventAtlasUrl and buildAdminEditUrl are imported from url-status.js

/**
 * Show toast notification
 */
function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  toastEl.textContent = message;
  toastEl.className = 'toast visible ' + type;
  setTimeout(() => {
    toastEl.classList.remove('visible');
  }, 2500);
}

/**
 * Show error message box
 */
function showErrorMessage(title: string, hint: string): void {
  errorTitleEl.textContent = title;
  errorHintEl.textContent = hint;
  errorMessageEl.classList.add('visible');
}

/**
 * Hide error message box
 */
function hideErrorMessage(): void {
  errorMessageEl.classList.remove('visible');
}

/**
 * Show duplicate URL dialog
 */
function showDuplicateDialog(existingTitle: string): void {
  duplicateText.textContent = `"${existingTitle}" is already in the bundle.`;
  duplicateDialog.classList.add('visible');
}

/**
 * Hide duplicate URL dialog
 */
function hideDuplicateDialog(): void {
  duplicateDialog.classList.remove('visible');
  setPendingCapture(null);
}

// URL status functions are imported from url-status.js:
// updateTabInfo, updateUrlStatus, hideLinkDiscoveryView, scanPageForLinks, addNewLinksToPipeline, etc.

/**
 * Update capture buttons visibility based on screenshot default setting
 */
function updateCaptureButtonsVisibility(): void {
  if (getSettings().captureScreenshotByDefault) {
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
function switchView(view: 'bundles' | 'detail'): void {
  setCurrentView(view);

  // Hide all views
  bundlesView.classList.remove('active');
  detailView.classList.remove('active');
  backNav.classList.remove('visible');

  if (view === 'bundles') {
    bundlesView.classList.add('active');
    setCurrentPageIndex(null);
  } else if (view === 'detail') {
    detailView.classList.add('active');
    backNav.classList.add('visible');
    backNavText.textContent = 'Back to Bundles';
  }
}

/**
 * Update header badge - total pages across all bundles
 */
function updateBadge(): void {
  const totalPages = getBundles().reduce((sum, b) => sum + (b.pages?.length || 0), 0);
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
function toggleBundleExpanded(bundleId: string): void {
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
function clearChildren(element: HTMLElement): void {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

/**
 * Render the bundles list with accordion (Main View)
 */
function renderBundlesList(): void {
  clearChildren(bundlesList);
  updateBadge();

  const bundles = getBundles();
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
function createAccordionBundle(bundle: Bundle): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'accordion-bundle' + (bundle.expanded ? ' expanded' : '');
  wrapper.dataset.bundleId = bundle.id;

  // Header
  const header = document.createElement('div');
  header.className = 'accordion-header';

  // Chevron
  const chevron = document.createElement('span');
  chevron.className = 'accordion-chevron';
  chevron.innerHTML = '&#9654;'; // >

  // Icon
  const icon = document.createElement('span');
  icon.className = 'accordion-icon';
  icon.textContent = '\u{1F4C1}';

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
  copyBundleBtn.innerHTML = '&#128203;'; // clipboard
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
function createAccordionPageItem(bundleId: string, capture: Capture, index: number): HTMLElement {
  const item = document.createElement('div');
  item.className = 'accordion-page';
  item.draggable = true;
  item.dataset.bundleId = bundleId;
  item.dataset.pageIndex = String(index);

  // Drag handle
  const dragHandle = document.createElement('span');
  dragHandle.className = 'accordion-page-drag';
  dragHandle.innerHTML = '&#8942;&#8942;'; // dots

  // Thumbnail - prefer screenshot, then first image, then icon
  const thumb = document.createElement('div');
  thumb.className = 'accordion-page-thumb';

  const thumbUrl = capture.screenshot || capture.images?.[0] || capture.selectedImages?.[0];
  if (thumbUrl) {
    const img = document.createElement('img');
    img.src = thumbUrl;
    img.alt = '';
    img.onerror = () => {
      thumb.textContent = '\u{1F4C4}';
    };
    thumb.appendChild(img);
  } else {
    thumb.textContent = '\u{1F4C4}';
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
    const target = e.target as HTMLElement;
    if (target.closest('.accordion-page-remove') || target.closest('.accordion-page-drag')) {
      return;
    }
    currentBundleId = bundleId;
    viewPageDetail(index);
  });

  // Drag events
  item.addEventListener('dragstart', (e) => {
    draggedPage = { bundleId, pageIndex: index };
    item.classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({ bundleId, pageIndex: index }));
    }
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
function setupBundleDropZone(bundleElement: HTMLElement, bundleId: string): void {
  bundleElement.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (draggedPage && draggedPage.bundleId !== bundleId) {
      bundleElement.classList.add('drag-over');
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'move';
      }
    }
  });

  bundleElement.addEventListener('dragleave', (e) => {
    // Only remove if we're actually leaving the bundle element
    if (!bundleElement.contains(e.relatedTarget as Node)) {
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
async function movePageBetweenBundles(sourceBundleId: string, pageIndex: number, targetBundleId: string): Promise<void> {
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
function viewPageDetail(index: number): void {
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
function populateMoveBundleSelect(): void {
  clearChildren(moveBundleSelect);

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '-- Select bundle --';
  moveBundleSelect.appendChild(defaultOption);

  const currentBundleId = getCurrentBundleId();
  getBundles().forEach((bundle) => {
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
function renderDetailPreview(capture: Capture): void {
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
  const isTextExpanded = getTextExpanded();
  textPreview.textContent = isTextExpanded ? fullText : previewText + (fullText.length > 500 ? '...' : '');
  textCharCount.textContent = `${fullText.length.toLocaleString()} chars`;
  textToggle.style.display = fullText.length > 500 ? 'block' : 'none';
  textToggle.textContent = isTextExpanded ? 'Show less' : 'Show more';

  // Image gallery
  renderImageGallery(capture);

  // Metadata
  renderMetadata(capture);
}

/**
 * Render screenshot section
 */
function renderScreenshot(capture: Capture): void {
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
function openScreenshotModal(screenshotSrc: string): void {
  screenshotModalImg.src = screenshotSrc;
  screenshotModal.classList.add('visible');
}

/**
 * Close screenshot modal
 */
function closeScreenshotModal(): void {
  screenshotModal.classList.remove('visible');
  screenshotModalImg.src = '';
}

/**
 * Render image gallery
 */
function renderImageGallery(capture: Capture): void {
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
function updateImageCount(capture: Capture): void {
  const total = capture.images?.length || 0;
  const selected = selectedImages.size;
  imageSelectedCount.textContent = `${selected}/${total} selected`;
}

/**
 * Render metadata section
 */
function renderMetadata(capture: Capture): void {
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
function saveCurrentDetail(): void {
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

interface ExportData {
  url: string;
  title: string;
  text: string;
  metadata: Record<string, string>;
  capturedAt: string;
  html?: string;
  images?: string[];
  screenshot?: string;
}

/**
 * Build export data for a single capture
 */
function buildExportData(capture: Capture): ExportData {
  const exportData: ExportData = {
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
async function copySingleToClipboard(): Promise<void> {
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
async function copyBundleToClipboard(bundleId: string): Promise<void> {
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
async function removePageFromBundle(bundleId: string, index: number): Promise<void> {
  const bundle = getBundleById(bundleId);
  if (!bundle || index < 0 || index >= bundle.pages.length) return;

  const removed = bundle.pages.splice(index, 1)[0];
  await saveToStorage();

  const currentBundleId = getCurrentBundleId();
  const currentPageIndex = getCurrentPageIndex();

  // If we're viewing the removed item in detail view, go back to bundles
  if (getCurrentView() === 'detail' && currentBundleId === bundleId && currentPageIndex === index) {
    switchView('bundles');
  } else if (getCurrentView() === 'detail' && currentBundleId === bundleId && currentPageIndex !== null && currentPageIndex > index) {
    // Adjust index if we removed something before current view
    setCurrentPageIndex(currentPageIndex - 1);
  }

  renderBundlesList();
  showToast(`Removed "${removed.title || 'page'}" from bundle`, 'success');
}

/**
 * Remove current page from bundle (from detail view)
 */
async function removeCurrentFromBundle(): Promise<void> {
  const currentBundleId = getCurrentBundleId();
  const currentPageIndex = getCurrentPageIndex();
  if (currentBundleId && currentPageIndex !== null) {
    await removePageFromBundle(currentBundleId, currentPageIndex);
  }
}

/**
 * Delete an entire bundle
 */
async function deleteBundle(bundleId: string): Promise<void> {
  const bundles = getBundles();
  const index = bundles.findIndex((b) => b.id === bundleId);
  if (index === -1) return;

  const removed = bundles.splice(index, 1)[0];
  await saveToStorage();

  // If viewing detail of deleted bundle, go back to bundles list
  if (getCurrentBundleId() === bundleId) {
    switchView('bundles');
  }

  renderBundlesList();
  showToast(`Deleted "${removed.name || 'bundle'}"`, 'success');
}

/**
 * Clear all bundles
 */
async function clearAllBundles(): Promise<void> {
  if (getBundles().length === 0) {
    showToast('No bundles to clear', 'error');
    return;
  }

  setBundles([]);
  await saveToStorage();

  switchView('bundles');
  renderBundlesList();
  showToast('All bundles cleared', 'success');
}

/**
 * Find duplicate URL in a specific bundle
 */
function findDuplicateInBundle(bundleId: string, url: string): number {
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
function findBundleForDomain(domain: string): Bundle | undefined {
  return getBundles().find((b) => b.name === domain);
}

/**
 * Create a new bundle
 */
function createBundle(name?: string): Bundle | null {
  const bundles = getBundles();
  if (bundles.length >= MAX_BUNDLES) {
    showToast(`Bundle limit reached (${MAX_BUNDLES} max)`, 'error');
    return null;
  }

  const newBundle: Bundle = {
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
async function addCaptureToBundle(bundleId: string, capture: Capture, replaceIndex: number = -1): Promise<boolean> {
  const bundle = getBundleById(bundleId);
  if (!bundle) return false;

  // Prepare capture data
  const captureData: Capture = {
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
function isConnectionError(error: unknown): boolean {
  const errorMessage = error instanceof Error ? error.message : String(error);
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
async function captureScreenshot(windowId: number): Promise<string | null> {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'captureScreenshot',
      windowId: windowId,
    }) as { error?: string; screenshot?: string };

    if (response.error) {
      console.warn('[EventAtlas Capture] Screenshot capture failed:', response.error);
      return null;
    }

    return response.screenshot || null;
  } catch (error) {
    console.warn('[EventAtlas Capture] Screenshot capture failed:', error);
    return null;
  }
}

/**
 * Set capture buttons state (disabled/enabled and text)
 */
function setCaptureButtonsState(disabled: boolean, text: string): void {
  // Single button (screenshot default ON)
  captureBtn.disabled = disabled;
  captureBtn.textContent = text;

  // Dual buttons (screenshot default OFF)
  captureNoScreenshotBtn.disabled = disabled;
  captureWithScreenshotBtn.disabled = disabled;

  if (text !== 'Capture Page') {
    // Update button text for both modes
    captureNoScreenshotBtn.innerHTML = `<span class="capture-btn-icon">\u{1F4C4}</span> ${text}`;
  } else {
    captureNoScreenshotBtn.innerHTML = '<span class="capture-btn-icon">\u{1F4C4}</span> Capture Page';
  }
}

/**
 * Add/remove class from all capture buttons
 */
function setCaptureButtonsClass(className: string, add: boolean): void {
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
 */
async function capturePage(includeScreenshot: boolean = true): Promise<void> {
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
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'capture' }) as Capture & { error?: string };

    // Capture screenshot if requested
    if (includeScreenshot && tab.windowId) {
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
    let targetBundle: Bundle | null = null;
    const settings = getSettings();

    if (settings.autoGroupByDomain) {
      // Try to find existing bundle for this domain
      targetBundle = findBundleForDomain(domain) || null;
    }

    if (!targetBundle) {
      // Create new bundle
      const bundleName = settings.autoGroupByDomain ? domain : `Bundle ${getBundles().length + 1}`;
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
      setPendingCapture({
        capture: response,
        bundleId: targetBundle.id,
        duplicateIndex,
      });
      showDuplicateDialog(existingPage.editedTitle || existingPage.title);

      setCaptureButtonsState(false, 'Capture Page');
      return;
    }

    // Add to bundle
    const success = await addCaptureToBundle(targetBundle.id, response);

    if (success) {
      setCaptureButtonsState(true, 'Added!');
      setCaptureButtonsClass('success', true);
      const totalPages = getBundles().reduce((sum, b) => sum + (b.pages?.length || 0), 0);
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
      showToast(err instanceof Error ? err.message : 'Capture failed', 'error');
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
async function addScreenshotToCurrentCapture(): Promise<void> {
  const bundle = getCurrentBundle();
  const currentPageIndex = getCurrentPageIndex();
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
  addScreenshotBtn.innerHTML = '<span class="capture-btn-icon">\u{1F4F8}</span> Capturing...';

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
    showToast((err instanceof Error ? err.message : null) || 'Failed to add screenshot', 'error');
  } finally {
    addScreenshotBtn.disabled = false;
    addScreenshotBtn.innerHTML = '<span class="capture-btn-icon">\u{1F4F8}</span> Add Screenshot';
  }
}

/**
 * Handle duplicate replace
 */
async function handleDuplicateReplace(): Promise<void> {
  const pendingCapture = getPendingCapture();
  if (!pendingCapture) return;

  const { capture, bundleId, duplicateIndex } = pendingCapture;
  hideDuplicateDialog();

  const success = await addCaptureToBundle(bundleId, capture, duplicateIndex);
  if (success) {
    showToast('Replaced existing page in bundle', 'success');
  }

  setPendingCapture(null);
}

/**
 * Handle duplicate skip
 */
function handleDuplicateSkip(): void {
  hideDuplicateDialog();
  showToast('Page skipped (already in bundle)', 'success');
  setPendingCapture(null);
}

/**
 * Move page to another bundle (from detail view dropdown)
 */
async function movePageToBundle(targetBundleId: string): Promise<void> {
  const currentBundleId = getCurrentBundleId();
  const currentPageIndex = getCurrentPageIndex();
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
async function refreshPageData(): Promise<void> {
  if (refreshBtn.classList.contains('loading')) return; // Prevent double-click

  refreshBtn.classList.add('loading');

  try {
    // Clear cached editor options to force reload
    setAvailableTags([]);
    setAvailableEventTypes([]);
    setAvailableDistances([]);

    // Sync with API (refresh local cache)
    const syncResult = await syncWithApi(getSettings());
    if (syncResult) {
      console.log('[EventAtlas] Refresh - Sync completed:', {
        events: syncResult.events?.length || 0,
        organizerLinks: syncResult.organizer_links?.length || 0,
      });
    }

    // Update URL status (will call lookup API and potentially show event editor)
    await updateUrlStatus();

    // If we have an event editor visible, reload its options
    if (getCurrentMatchedEvent() && eventEditorModule) {
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
  const settings = getSettings();
  settings.autoGroupByDomain = autoGroupSetting.checked;
  await saveToStorage();
});

screenshotDefaultSetting.addEventListener('change', async () => {
  const settings = getSettings();
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
  const eyeIcon = toggleTokenVisibility.querySelector('.eye-icon');
  if (eyeIcon) {
    eyeIcon.textContent = isPassword ? '\u{1F648}' : '\u{1F441}';
  }
  toggleTokenVisibility.title = isPassword ? 'Hide token' : 'Show token';
});

// Save Settings button - saves all API settings at once
saveSettingsBtn.addEventListener('click', async () => {
  const settings = getSettings();
  // Collect values from form
  settings.apiUrl = apiUrlSetting.value.trim();
  settings.apiToken = apiTokenSetting.value.trim();
  settings.syncMode = syncModeSetting.value as 'bulk_only' | 'realtime_only' | 'both';
  settings.screenshotUploadTiming = screenshotUploadTimingSetting.value as 'immediate' | 'on_save';

  // Collect distance presets from toggle chips
  const defaults: Record<number, boolean> = {};
  if (distancePresetToggles) {
    const chips = distancePresetToggles.querySelectorAll('.distance-preset-chip');
    chips.forEach((chip) => {
      const value = parseInt((chip as HTMLElement).dataset.value || '0', 10);
      defaults[value] = chip.classList.contains('enabled');
    });
  }

  // Parse custom distances from input
  const customString = customDistancePresetsSetting.value.trim();
  const customDistances: number[] = [];
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
    setAvailableDistances([]);
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
    toggleSelectAllNewLinks((e.target as HTMLInputElement).checked);
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
function switchMainTab(tabName: 'current' | 'event-list'): void {
  setActiveTab(tabName);

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
  if (tabName === 'event-list' && getEventListCache().length === 0) {
    fetchEventList();
  }
}

/**
 * Fetch event list from API
 */
async function fetchEventList(): Promise<void> {
  const settings = getSettings();
  if (!settings.apiUrl || !settings.apiToken) {
    showEventListEmpty('Please configure API settings');
    return;
  }

  showEventListLoading();

  try {
    const params = new URLSearchParams();
    const filterState = getFilterState();
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

    const data = await response.json() as { events?: EventListItem[] };
    setEventListCache(data.events || []);
    setEventListLastFetched(Date.now());

    renderEventList();
  } catch (error) {
    console.error('[EventAtlas] Event list fetch error:', error);
    showEventListEmpty('Error loading events');
  }
}

/**
 * Render the event list
 */
function renderEventList(): void {
  if (!eventListContainer) return;

  if (eventListLoading) eventListLoading.style.display = 'none';
  eventListContainer.innerHTML = '';

  const eventListCache = getEventListCache();
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
    const eventUrl = fixUrl(event.primary_url || '');
    item.innerHTML = `
      <div class="event-list-item-header">
        <div class="event-list-item-title">${escapeHtml(event.name)}</div>
        ${startDate ? `<div class="event-list-item-date">${escapeHtml(startDate)}</div>` : ''}
      </div>
      <div class="event-list-item-url-row">
        <div class="event-list-item-url">${escapeHtml(eventUrl)}</div>
        <button class="copy-url-btn" title="Copy URL">\u{1F4CB}</button>
      </div>
      <div class="event-list-item-meta">
        ${formatEventType(event.event_type)}
        ${formatTags(event.tags || [])}
        ${formatDistances(event.distances || [])}
      </div>
      <div class="event-list-item-missing">${formatMissingBadges(event.missing || [])}</div>
    `;

    // Copy button handler
    const copyBtnEl = item.querySelector('.copy-url-btn') as HTMLButtonElement;
    copyBtnEl.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(eventUrl).then(() => {
        copyBtnEl.textContent = '\u2713';
        setTimeout(() => { copyBtnEl.textContent = '\u{1F4CB}'; }, 1500);
      });
    });

    item.addEventListener('click', () => navigateToEvent(event));
    eventListContainer.appendChild(item);
  });
}

// Pure format functions imported from event-list.js:
// formatMissingBadges, formatEventType, formatTags, formatDistances,
// formatEventDate, getFirstOfMonth, getMonthLabel, buildStartsFromOptions, getStartsFromDate

/**
 * Update the "Starts from" dropdown options
 */
function updateStartsFromDropdown(): void {
  const dropdown = document.getElementById('filterStartsFrom') as HTMLSelectElement | null;
  if (!dropdown) return;

  const options = buildStartsFromOptions();
  dropdown.innerHTML = options.map(opt =>
    `<option value="${opt.value}">${escapeHtml(opt.label)}</option>`
  ).join('');

  // Set current value
  const filterState = getFilterState();
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
  if (eventListContainer) eventListContainer.innerHTML = '';
  if (eventListEmpty) eventListEmpty.style.display = 'none';
  if (eventListLoading) eventListLoading.style.display = 'block';
}

/**
 * Show empty state for event list
 */
function showEventListEmpty(message: string): void {
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
async function navigateToEvent(event: EventListItem): Promise<void> {
  const settings = getSettings();
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
  const existingTimer = getEventListRefreshTimer();
  if (existingTimer) {
    clearInterval(existingTimer);
    setEventListRefreshTimer(null);
  }

  const settings = getSettings();
  const interval = (settings.eventListRefreshInterval || 0) * 60 * 1000;

  if (interval > 0) {
    const timer = setInterval(() => {
      if (getActiveTab() === 'event-list') {
        fetchEventList();
      }
    }, interval);
    setEventListRefreshTimer(timer);
  }
}

// Event Listeners - Tab Navigation
if (tabNavigation) {
  tabNavigation.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => switchMainTab((btn as HTMLElement).dataset.tab as 'current' | 'event-list'));
  });
}

// Event Listeners - Event List Filters
if (filterMissingTags) {
  filterMissingTags.addEventListener('change', async (e) => {
    const filterState = getFilterState();
    filterState.missingTags = (e.target as HTMLInputElement).checked;
    await saveFilterState();
    fetchEventList();
  });
}

if (filterMissingDistances) {
  filterMissingDistances.addEventListener('change', async (e) => {
    const filterState = getFilterState();
    filterState.missingDistances = (e.target as HTMLInputElement).checked;
    await saveFilterState();
    fetchEventList();
  });
}

// Starts from filter dropdown
const filterStartsFrom = document.getElementById('filterStartsFrom') as HTMLSelectElement | null;
const customDateInput = document.getElementById('filterCustomDate') as HTMLInputElement | null;
const customDateContainer = document.getElementById('customDateContainer') as HTMLElement | null;

if (filterStartsFrom) {
  filterStartsFrom.addEventListener('change', async (e) => {
    const value = (e.target as HTMLSelectElement).value;
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
      const filterState = getFilterState();
      filterState.startsFrom = value || null;
      await saveFilterState();
      fetchEventList();
    }
  });
}

if (customDateInput) {
  customDateInput.addEventListener('change', async (e) => {
    const filterState = getFilterState();
    filterState.startsFrom = (e.target as HTMLInputElement).value || null;
    await saveFilterState();
    fetchEventList();
  });
}

// Filter mode toggle
document.querySelectorAll('.filter-mode-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.filter-mode-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const filterState = getFilterState();
    filterState.mode = (btn as HTMLElement).dataset.mode as 'any' | 'all';
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
    const settings = getSettings();
    settings.autoSwitchTab = autoSwitchTabSetting.checked;
    await saveToStorage();
  });
}

if (eventListRefreshIntervalSetting) {
  eventListRefreshIntervalSetting.addEventListener('change', async () => {
    const settings = getSettings();
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
function migrateOldDistancePresets(presetsString: string): DistancePreset {
  const result: DistancePreset = {
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
function getDistancePresets(): DistancePreset {
  const settings = getSettings();
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
function getCustomDistances(): number[] {
  const presets = getDistancePresets();

  // If we have the array already, return it
  if (Array.isArray(presets.custom)) {
    return presets.custom;
  }

  // Parse from comma-separated string (legacy or from input)
  const customString = customDistancePresetsSetting?.value || '';
  if (!customString.trim()) return [];

  const customDistances: number[] = [];
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
function mergeDistancesWithPresets(globalDistances: Distance[]): Distance[] {
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

function showEventEditor(event: MatchedEvent): void {
  if (eventEditorModule) {
    eventEditorModule.showEventEditor(event);
  }
}

function hideEventEditor(): void {
  if (eventEditorModule) {
    eventEditorModule.hideEventEditor();
  }
}

function hasUnsavedChanges(): boolean {
  return eventEditorModule ? eventEditorModule.hasUnsavedChanges() : false;
}

function showUnsavedDialog(message: string): void {
  if (eventEditorModule) {
    eventEditorModule.showUnsavedDialog(message);
  }
}

function hideUnsavedDialog(): void {
  if (eventEditorModule) {
    eventEditorModule.hideUnsavedDialog();
  }
}

function saveEventChanges(): Promise<void> {
  return eventEditorModule ? eventEditorModule.saveEventChanges() : Promise.resolve();
}

function discardPendingScreenshots(): void {
  if (eventEditorModule) {
    eventEditorModule.discardPendingScreenshots();
  }
}

function renderSavedScreenshots(media: unknown[]): void {
  if (eventEditorModule) {
    eventEditorModule.renderSavedScreenshots(media);
  }
}

function loadEditorOptions(): Promise<void> {
  return eventEditorModule ? eventEditorModule.loadEditorOptions() : Promise.resolve();
}

function renderTagsChips(): void {
  if (eventEditorModule) {
    eventEditorModule.renderTagsChips();
  }
}

function renderDistanceButtons(): void {
  if (eventEditorModule) {
    eventEditorModule.renderDistanceButtons();
  }
}

function renderSelectedDistances(): void {
  if (eventEditorModule) {
    eventEditorModule.renderSelectedDistances();
  }
}

/**
 * Capture and upload screenshot for event
 * Respects the screenshotUploadTiming setting
 * Uses upload queue for immediate uploads with progress tracking
 */
async function captureAndUploadEventScreenshot(): Promise<void> {
  const currentMatchedEvent = getCurrentMatchedEvent();
  const settings = getSettings();
  console.log('[EventAtlas] captureAndUploadEventScreenshot called', {
    hasMatchedEvent: !!currentMatchedEvent,
    hasApiUrl: !!settings.apiUrl,
    hasApiToken: !!settings.apiToken,
  });

  if (!currentMatchedEvent || !settings.apiUrl || !settings.apiToken) {
    showToast('Cannot capture - no event selected or API not configured', 'error');
    return;
  }

  if (!captureEventScreenshotBtn) return;

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
      const pendingScreenshots = getPendingScreenshots();
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
    if (captureEventScreenshotBtn) {
      captureEventScreenshotBtn.innerHTML = '<span>&#128247;</span> Screenshot';
      captureEventScreenshotBtn.disabled = false;
    }
    showToast((error instanceof Error ? error.message : null) || 'Failed to capture screenshot', 'error');
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
    const chip = (e.target as HTMLElement).closest('.distance-preset-chip') as HTMLElement | null;
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
  setLastKnownUrl(null); // Reset so next updateTabInfo works
  setPendingScreenshots([]); // Clear any remaining pending (should be uploaded)
  await updateTabInfo();
});

unsavedDiscardBtn.addEventListener('click', async () => {
  hideUnsavedDialog();
  discardPendingScreenshots();
  setLastKnownUrl(null); // Reset so next updateTabInfo works
  await updateTabInfo();
});

unsavedCancelBtn.addEventListener('click', () => {
  hideUnsavedDialog();
  // Keep the lastKnownUrl as is - user chose to stay
});

/**
 * Display version number from manifest in header
 */
function displayVersion(): void {
  const manifest = chrome.runtime.getManifest();
  const version = manifest.version;
  if (headerTitle) {
    headerTitle.textContent = `EventAtlas Capture (v${version})`;
  }
}

// Initialize
async function init(): Promise<void> {
  // Display version in header
  displayVersion();

  // Initialize event editor module
  eventEditorModule = initEventEditor({
    elements: {
      eventEditor: document.getElementById('eventEditor') as HTMLElement,
      eventEditorAccordionHeader: document.getElementById('eventEditorAccordionHeader') as HTMLElement,
      eventEditorChevron: document.getElementById('eventEditorChevron') as HTMLElement,
      eventEditorContent: document.getElementById('eventEditorContent') as HTMLElement,
      editorEventName: document.getElementById('editorEventName') as HTMLElement,
      editorPageTitle: document.getElementById('editorPageTitle') as HTMLElement,
      editorPageUrl: document.getElementById('editorPageUrl') as HTMLElement,
      editorBadge: document.getElementById('editorBadge') as HTMLElement,
      editorViewLink: document.getElementById('editorViewLink') as HTMLAnchorElement,
      editorLoading: document.getElementById('editorLoading') as HTMLElement,
      editorContent: document.getElementById('editorContent') as HTMLElement,
      editorEventTypes: document.getElementById('editorEventTypes') as HTMLElement,
      editorTags: document.getElementById('editorTags') as HTMLElement,
      editorDistances: document.getElementById('editorDistances') as HTMLElement,
      customDistanceInput: document.getElementById('customDistanceInput') as HTMLInputElement,
      addCustomDistanceBtn: document.getElementById('addCustomDistanceBtn') as HTMLButtonElement,
      selectedDistancesEl: document.getElementById('selectedDistances') as HTMLElement,
      editorNotes: document.getElementById('editorNotes') as HTMLTextAreaElement,
      editorSaveBtn: document.getElementById('editorSaveBtn') as HTMLButtonElement,
      captureEventScreenshotBtn: document.getElementById('captureEventScreenshotBtn') as HTMLButtonElement,
      captureEventHtmlBtn: document.getElementById('captureEventHtmlBtn') as HTMLButtonElement,
      savedScreenshotsEl: document.getElementById('savedScreenshots') as HTMLElement,
      pageTitleEl: document.getElementById('pageTitle') as HTMLElement,
      pageUrlEl: document.getElementById('pageUrl') as HTMLElement,
      unsavedDialog: document.getElementById('unsavedDialog') as HTMLElement,
      unsavedDialogText: document.getElementById('unsavedDialogText') as HTMLElement,
      unsavedSaveBtn: document.getElementById('unsavedSaveBtn') as HTMLButtonElement,
      unsavedDiscardBtn: document.getElementById('unsavedDiscardBtn') as HTMLButtonElement,
      unsavedCancelBtn: document.getElementById('unsavedCancelBtn') as HTMLButtonElement,
    },
    getSettings: () => getSettings(),
    getState: () => ({
      currentMatchedEvent: getCurrentMatchedEvent(),
      availableTags: getAvailableTags(),
      availableEventTypes: getAvailableEventTypes(),
      availableDistances: getAvailableDistances(),
      selectedEventTypeId: getSelectedEventTypeId(),
      selectedTagIds: getSelectedTagIds(),
      selectedDistanceValues: getSelectedDistanceValues(),
      eventEditorExpanded: getEventEditorExpanded(),
      pendingScreenshots: getPendingScreenshots(),
      pendingUrlChange: getPendingUrlChange(),
      uploadQueue: [],
    }),
    setState: (updates: Partial<{
      currentMatchedEvent: MatchedEvent | null;
      availableTags: Tag[];
      availableEventTypes: EventType[];
      availableDistances: Distance[];
      selectedEventTypeId: number | null;
      selectedTagIds: Set<number>;
      selectedDistanceValues: number[];
      eventEditorExpanded: boolean;
      pendingScreenshots: PendingScreenshot[];
      pendingUrlChange: string | null;
    }>) => {
      if ('currentMatchedEvent' in updates) setCurrentMatchedEvent(updates.currentMatchedEvent ?? null);
      if ('availableTags' in updates) setAvailableTags(updates.availableTags ?? []);
      if ('availableEventTypes' in updates) setAvailableEventTypes(updates.availableEventTypes ?? []);
      if ('availableDistances' in updates) setAvailableDistances(updates.availableDistances ?? []);
      if ('selectedEventTypeId' in updates) setSelectedEventTypeId(updates.selectedEventTypeId ?? null);
      if ('selectedTagIds' in updates) setSelectedTagIds(updates.selectedTagIds ?? new Set());
      if ('selectedDistanceValues' in updates) setSelectedDistanceValues(updates.selectedDistanceValues ?? []);
      if ('eventEditorExpanded' in updates) setEventEditorExpanded(updates.eventEditorExpanded ?? true);
      if ('pendingScreenshots' in updates) setPendingScreenshots(updates.pendingScreenshots ?? []);
      if ('pendingUrlChange' in updates) setPendingUrlChange(updates.pendingUrlChange ?? null);
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
    queueEl: document.getElementById('uploadQueue') as HTMLElement,
    countEl: document.getElementById('uploadQueueCount') as HTMLElement,
    itemsEl: document.getElementById('uploadQueueItems') as HTMLElement,
    getSettings: () => getSettings(),
    getCurrentMatchedEvent: () => getCurrentMatchedEvent(),
    setCurrentMatchedEventMedia: (media: unknown[]) => {
      const currentMatchedEvent = getCurrentMatchedEvent();
      if (currentMatchedEvent) {
        currentMatchedEvent.media = media;
      }
    },
    renderSavedScreenshots: renderSavedScreenshots,
    showToast: showToast,
  });

  // Initialize URL status module
  initUrlStatus({
    settings: getSettings(),
    elements: {
      pageTitleEl,
      pageUrlEl,
      urlStatusDetails,
      statusSection,
      pageInfoBadge,
      pageInfoBadgeIcon,
      pageInfoBadgeText,
      statusViewLink,
      pageInfoSection,
      pageInfoDetails,
      pageInfoEventName,
      captureButtons,
      bundleSection,
      linkDiscoveryView,
      discoverySourceName,
      discoveryApiBadge,
      discoveryLastScraped,
      scanPageLinksBtn,
      linkComparisonResults,
      newLinksCount,
      knownLinksCount,
      newLinksList,
      knownLinksList,
      selectAllNewLinks,
      addNewLinksBtn,
      selectedLinksCountEl,
    },
    callbacks: {
      showToast,
      showEventEditor,
      hideEventEditor,
      updateCaptureButtonsVisibility,
      hasUnsavedChanges,
      showUnsavedDialog,
    },
  });

  await updateTabInfo();
  await loadFromStorage();

  // Update url-status module with loaded settings (fixes stale reference)
  updateUrlStatusSettings(getSettings());

  // Load filter state
  await loadFilterState();

  // Sync with API in background (don't block UI)
  const settings = getSettings();
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
  if (eventListRefreshIntervalSetting) eventListRefreshIntervalSetting.value = String(settings.eventListRefreshInterval || 0);

  // Apply filter state to UI
  const filterState = getFilterState();
  if (filterMissingTags) filterMissingTags.checked = filterState.missingTags;
  if (filterMissingDistances) filterMissingDistances.checked = filterState.missingDistances;
  if (filterState.mode) {
    document.querySelectorAll('.filter-mode-btn').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.mode === filterState.mode);
    });
  }

  // Initialize "Starts from" dropdown with dynamic options
  updateStartsFromDropdown();

  // Show custom date input if a custom date is set
  const customDateContainerInit = document.getElementById('customDateContainer') as HTMLElement | null;
  const customDateInputInit = document.getElementById('filterCustomDate') as HTMLInputElement | null;
  if (filterState.startsFrom && !['this_month', 'next_month', '2_months', '3_months', '6_months'].includes(filterState.startsFrom)) {
    if (customDateContainerInit) customDateContainerInit.style.display = 'block';
    if (customDateInputInit) customDateInputInit.value = filterState.startsFrom;
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
function applyDistancePresetsToUI(): void {
  const presets = getDistancePresets();
  const defaults = presets.defaults || {};
  const custom = presets.custom || [];

  // Update toggle chips based on saved defaults
  if (distancePresetToggles) {
    const chips = distancePresetToggles.querySelectorAll('.distance-preset-chip');
    chips.forEach((chip) => {
      const value = parseInt((chip as HTMLElement).dataset.value || '0', 10);
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
