/**
 * EventAtlas Capture - Page Capture Functions
 *
 * Handles page capture functionality including screenshots, duplicate detection,
 * and page movement between bundles. Uses a factory pattern to receive dependencies
 * from sidepanel.js.
 */

import { getDomain } from './utils.js';
import { syncWithApi } from './api.js';

/**
 * Initialize the capture module with dependencies
 * @param {Object} deps - Dependencies from sidepanel.js
 * @returns {Object} Public API for capture module
 */
export function initCapture(deps) {
  const {
    // DOM elements
    elements,
    // Settings getter
    getSettings,
    // State getters/setters
    getState,
    setState,
    // Bundle functions
    getBundleById,
    getCurrentBundle,
    createBundle,
    addCaptureToBundle,
    findDuplicateInBundle,
    findBundleForDomain,
    // UI functions
    showToast,
    showErrorMessage,
    hideErrorMessage,
    showDuplicateDialog,
    hideDuplicateDialog,
    renderBundlesList,
    renderScreenshot,
    switchView,
    // Storage
    saveToStorage,
    // Editor functions
    updateUrlStatus,
    loadEditorOptions,
    renderTagsChips,
    renderDistanceButtons,
    renderSelectedDistances,
  } = deps;

  // Extract DOM elements for convenience
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

  // ============================================================
  // Screenshot Capture
  // ============================================================

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

  // ============================================================
  // Button State Management
  // ============================================================

  /**
   * Update capture buttons visibility based on screenshot default setting
   */
  function updateCaptureButtonsVisibility() {
    const settings = getSettings();
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
      captureNoScreenshotBtn.innerHTML = `<span class="capture-btn-icon">&#128196;</span> ${text}`;
    } else {
      captureNoScreenshotBtn.innerHTML = '<span class="capture-btn-icon">&#128196;</span> Capture Page';
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

  // ============================================================
  // Page Capture
  // ============================================================

  /**
   * Capture page content
   * @param {boolean} includeScreenshot - Whether to capture a screenshot
   */
  async function capturePage(includeScreenshot = true) {
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
        const bundles = state.bundles;
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

      // Add to bundle
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
    const state = getState();

    if (!bundle || state.currentPageIndex === null || state.currentPageIndex >= bundle.pages.length) {
      showToast('No capture selected', 'error');
      return;
    }

    const capture = bundle.pages[state.currentPageIndex];

    // Already has screenshot
    if (capture.screenshot) {
      showToast('Screenshot already exists', 'error');
      return;
    }

    // Disable button while capturing
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
      addScreenshotBtn.innerHTML = '<span class="capture-btn-icon">&#128248;</span> Add Screenshot';
    }
  }

  // ============================================================
  // Duplicate Handling
  // ============================================================

  /**
   * Handle duplicate replace
   */
  async function handleDuplicateReplace() {
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

  /**
   * Handle duplicate skip
   */
  function handleDuplicateSkip() {
    hideDuplicateDialog();
    showToast('Page skipped (already in bundle)', 'success');
    setState({ pendingCapture: null });
  }

  // ============================================================
  // Page Movement
  // ============================================================

  /**
   * Move page to another bundle (from detail view dropdown)
   */
  async function movePageToBundle(targetBundleId) {
    const state = getState();
    if (!targetBundleId || !state.currentBundleId || state.currentPageIndex === null) return;

    const sourceBundle = getCurrentBundle();
    const targetBundle = getBundleById(targetBundleId);
    if (!sourceBundle || !targetBundle) return;

    // Check target bundle limit (use constant from main module)
    const MAX_BUNDLE_PAGES = 20;
    if (targetBundle.pages.length >= MAX_BUNDLE_PAGES) {
      showToast(`Target bundle is full (${MAX_BUNDLE_PAGES} pages max)`, 'error');
      return;
    }

    // Remove from source and add to target
    const page = sourceBundle.pages.splice(state.currentPageIndex, 1)[0];
    targetBundle.pages.push(page);

    // Expand target bundle
    targetBundle.expanded = true;

    await saveToStorage();

    // Go back to bundles view
    switchView('bundles');
    renderBundlesList();

    showToast(`Moved to "${targetBundle.name}"`, 'success');
  }

  // ============================================================
  // Page Data Refresh
  // ============================================================

  /**
   * Refresh page data - reload lookup, tags, event types, and distances from API
   */
  async function refreshPageData() {
    if (refreshBtn.classList.contains('loading')) return; // Prevent double-click

    refreshBtn.classList.add('loading');
    const settings = getSettings();

    try {
      // Clear cached editor options to force reload
      setState({
        availableTags: [],
        availableEventTypes: [],
        availableDistances: [],
      });

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
      const state = getState();
      if (state.currentMatchedEvent) {
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

  // ============================================================
  // Return Public API
  // ============================================================

  return {
    // Error detection
    isConnectionError,

    // Screenshot
    captureScreenshot,

    // Button state
    updateCaptureButtonsVisibility,
    setCaptureButtonsState,
    setCaptureButtonsClass,

    // Capture actions
    capturePage,
    addScreenshotToCurrentCapture,

    // Duplicate handling
    handleDuplicateReplace,
    handleDuplicateSkip,

    // Page movement
    movePageToBundle,

    // Refresh
    refreshPageData,
  };
}
