/**
 * EventAtlas Capture - Page Capture Functions
 *
 * Handles page capture functionality including screenshots, duplicate detection,
 * and page movement between bundles. Uses a factory pattern to receive dependencies
 * from sidepanel.js.
 */

import { getDomain } from './utils';
import { syncWithApi } from './api';
import type { Settings, Bundle, Capture } from './storage';

// Type definitions
interface CaptureState {
  bundles: Bundle[];
  currentBundleId: string | null;
  currentPageIndex: number | null;
  pendingCapture: {
    capture: Capture;
    bundleId: string;
    duplicateIndex: number;
  } | null;
  availableTags: unknown[];
  availableEventTypes: unknown[];
  availableDistances: unknown[];
  currentMatchedEvent: { id: number; media?: unknown[] } | null;
}

interface CaptureElements {
  captureBtn: HTMLButtonElement;
  captureBtnGroup: HTMLElement;
  captureNoScreenshotBtn: HTMLButtonElement;
  captureWithScreenshotBtn: HTMLButtonElement;
  addScreenshotBtn: HTMLButtonElement;
  refreshBtn: HTMLElement;
}

interface CaptureDependencies {
  elements: CaptureElements;
  getSettings: () => Settings;
  getState: () => CaptureState;
  setState: (updates: Partial<CaptureState>) => void;
  getBundleById: (id: string) => Bundle | undefined;
  getCurrentBundle: () => Bundle | null;
  createBundle: (name?: string) => Bundle | null;
  addCaptureToBundle: (bundleId: string, capture: Capture, replaceIndex?: number) => Promise<boolean>;
  findDuplicateInBundle: (bundleId: string, url: string) => number;
  findBundleForDomain: (domain: string) => Bundle | undefined;
  showToast: (message: string, type?: string) => void;
  showErrorMessage: (title: string, message: string) => void;
  hideErrorMessage: () => void;
  showDuplicateDialog: (existingTitle: string) => void;
  hideDuplicateDialog: () => void;
  renderBundlesList: () => void;
  renderScreenshot: (capture: Capture) => void;
  switchView: (view: string) => void;
  saveToStorage: () => Promise<void>;
  updateUrlStatus: () => Promise<void>;
  loadEditorOptions: () => Promise<void>;
  renderTagsChips: () => void;
  renderDistanceButtons: () => void;
  renderSelectedDistances: () => void;
}

interface CaptureAPI {
  isConnectionError: (error: unknown) => boolean;
  captureScreenshot: (windowId: number) => Promise<string | null>;
  updateCaptureButtonsVisibility: () => void;
  setCaptureButtonsState: (disabled: boolean, text: string) => void;
  setCaptureButtonsClass: (className: string, add: boolean) => void;
  capturePage: (includeScreenshot?: boolean) => Promise<void>;
  addScreenshotToCurrentCapture: () => Promise<void>;
  handleDuplicateReplace: () => Promise<void>;
  handleDuplicateSkip: () => void;
  movePageToBundle: (targetBundleId: string) => Promise<void>;
  refreshPageData: () => Promise<void>;
}

/**
 * Initialize the capture module with dependencies
 */
export function initCapture(deps: CaptureDependencies): CaptureAPI {
  const {
    elements,
    getSettings,
    getState,
    setState,
    getBundleById,
    getCurrentBundle,
    createBundle,
    addCaptureToBundle,
    findDuplicateInBundle,
    findBundleForDomain,
    showToast,
    showErrorMessage,
    hideErrorMessage,
    showDuplicateDialog,
    hideDuplicateDialog,
    renderBundlesList,
    renderScreenshot,
    switchView,
    saveToStorage,
    updateUrlStatus,
    loadEditorOptions,
    renderTagsChips,
    renderDistanceButtons,
    renderSelectedDistances,
  } = deps;

  const {
    captureBtn,
    captureBtnGroup,
    captureNoScreenshotBtn,
    captureWithScreenshotBtn,
    addScreenshotBtn,
    refreshBtn,
  } = elements;

  // ============================================================
  // Error Detection
  // ============================================================

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

  // ============================================================
  // Screenshot Capture
  // ============================================================

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

  // ============================================================
  // Button State Management
  // ============================================================

  function updateCaptureButtonsVisibility(): void {
    const settings = getSettings();
    if (settings.captureScreenshotByDefault) {
      captureBtn.style.display = 'block';
      captureBtnGroup.style.display = 'none';
    } else {
      captureBtn.style.display = 'none';
      captureBtnGroup.style.display = 'flex';
    }
  }

  function setCaptureButtonsState(disabled: boolean, text: string): void {
    captureBtn.disabled = disabled;
    captureBtn.textContent = text;

    captureNoScreenshotBtn.disabled = disabled;
    captureWithScreenshotBtn.disabled = disabled;

    if (text !== 'Capture Page') {
      captureNoScreenshotBtn.innerHTML = `<span class="capture-btn-icon">&#128196;</span> ${text}`;
    } else {
      captureNoScreenshotBtn.innerHTML = '<span class="capture-btn-icon">&#128196;</span> Capture Page';
    }
  }

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

  // ============================================================
  // Page Capture
  // ============================================================

  async function capturePage(includeScreenshot = true): Promise<void> {
    const state = getState();
    const settings = getSettings();

    setCaptureButtonsState(true, 'Capturing...');
    hideErrorMessage();
    hideDuplicateDialog();

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id) {
        throw new Error('No active tab found');
      }

      if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
        throw new Error('Cannot capture Chrome system pages');
      }

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'capture' }) as Capture & { error?: string };

      if (includeScreenshot && tab.windowId) {
        const screenshot = await captureScreenshot(tab.windowId);
        if (screenshot) {
          response.screenshot = screenshot;
        }
      }

      if (response.error) {
        throw new Error(response.error);
      }

      const domain = getDomain(response.url);
      let targetBundle: Bundle | null = null;

      if (settings.autoGroupByDomain) {
        targetBundle = findBundleForDomain(domain) || null;
      }

      if (!targetBundle) {
        const bundles = state.bundles;
        const bundleName = settings.autoGroupByDomain ? domain : `Bundle ${bundles.length + 1}`;
        targetBundle = createBundle(bundleName);
        if (!targetBundle) {
          setCaptureButtonsState(false, 'Capture Page');
          return;
        }
      }

      const duplicateIndex = findDuplicateInBundle(targetBundle.id, response.url);

      if (duplicateIndex >= 0) {
        const existingPage = targetBundle.pages[duplicateIndex];
        setState({
          pendingCapture: {
            capture: response,
            bundleId: targetBundle.id,
            duplicateIndex,
          },
        });
        showDuplicateDialog(existingPage.editedTitle || existingPage.title);

        setCaptureButtonsState(false, 'Capture Page');
        return;
      }

      const success = await addCaptureToBundle(targetBundle.id, response);

      if (success) {
        setCaptureButtonsState(true, 'Added!');
        setCaptureButtonsClass('success', true);
        const bundles = getState().bundles;
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

  async function addScreenshotToCurrentCapture(): Promise<void> {
    const bundle = getCurrentBundle();
    const state = getState();

    if (!bundle || state.currentPageIndex === null || state.currentPageIndex >= bundle.pages.length) {
      showToast('No capture selected', 'error');
      return;
    }

    const capture = bundle.pages[state.currentPageIndex];

    if (capture.screenshot) {
      showToast('Screenshot already exists', 'error');
      return;
    }

    addScreenshotBtn.disabled = true;
    addScreenshotBtn.innerHTML = '<span class="capture-btn-icon">&#128248;</span> Capturing...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.windowId) {
        throw new Error('No active tab found');
      }

      const screenshot = await captureScreenshot(tab.windowId);

      if (!screenshot) {
        throw new Error('Failed to capture screenshot');
      }

      capture.screenshot = screenshot;
      await saveToStorage();

      renderScreenshot(capture);

      showToast('Screenshot added', 'success');
    } catch (err) {
      console.error('Add screenshot error:', err);
      showToast((err instanceof Error ? err.message : null) || 'Failed to add screenshot', 'error');
    } finally {
      addScreenshotBtn.disabled = false;
      addScreenshotBtn.innerHTML = '<span class="capture-btn-icon">&#128248;</span> Add Screenshot';
    }
  }

  // ============================================================
  // Duplicate Handling
  // ============================================================

  async function handleDuplicateReplace(): Promise<void> {
    const state = getState();
    const pendingCapture = state.pendingCapture;
    if (!pendingCapture) return;

    const { capture, bundleId, duplicateIndex } = pendingCapture;
    hideDuplicateDialog();

    const success = await addCaptureToBundle(bundleId, capture, duplicateIndex);
    if (success) {
      showToast('Replaced existing page in bundle', 'success');
    }

    setState({ pendingCapture: null });
  }

  function handleDuplicateSkip(): void {
    hideDuplicateDialog();
    showToast('Page skipped (already in bundle)', 'success');
    setState({ pendingCapture: null });
  }

  // ============================================================
  // Page Movement
  // ============================================================

  async function movePageToBundle(targetBundleId: string): Promise<void> {
    const state = getState();
    if (!targetBundleId || !state.currentBundleId || state.currentPageIndex === null) return;

    const sourceBundle = getCurrentBundle();
    const targetBundle = getBundleById(targetBundleId);
    if (!sourceBundle || !targetBundle) return;

    const MAX_BUNDLE_PAGES = 20;
    if (targetBundle.pages.length >= MAX_BUNDLE_PAGES) {
      showToast(`Target bundle is full (${MAX_BUNDLE_PAGES} pages max)`, 'error');
      return;
    }

    const page = sourceBundle.pages.splice(state.currentPageIndex, 1)[0];
    targetBundle.pages.push(page);

    targetBundle.expanded = true;

    await saveToStorage();

    switchView('bundles');
    renderBundlesList();

    showToast(`Moved to "${targetBundle.name}"`, 'success');
  }

  // ============================================================
  // Page Data Refresh
  // ============================================================

  async function refreshPageData(): Promise<void> {
    if (refreshBtn.classList.contains('loading')) return;

    refreshBtn.classList.add('loading');
    const settings = getSettings();

    try {
      setState({
        availableTags: [],
        availableEventTypes: [],
        availableDistances: [],
      });

      const syncResult = await syncWithApi(settings);
      if (syncResult) {
        console.log('[EventAtlas] Refresh - Sync completed:', {
          events: syncResult.events?.length || 0,
          organizerLinks: syncResult.organizer_links?.length || 0,
        });
      }

      await updateUrlStatus();

      const state = getState();
      if (state.currentMatchedEvent) {
        await loadEditorOptions();
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

  // ============================================================
  // Return Public API
  // ============================================================

  return {
    isConnectionError,
    captureScreenshot,
    updateCaptureButtonsVisibility,
    setCaptureButtonsState,
    setCaptureButtonsClass,
    capturePage,
    addScreenshotToCurrentCapture,
    handleDuplicateReplace,
    handleDuplicateSkip,
    movePageToBundle,
    refreshPageData,
  };
}
