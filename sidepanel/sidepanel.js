/**
 * EventAtlas Capture - Side Panel Script
 *
 * Handles side panel UI interactions, preview display, and bundle storage
 * for captured page data. Supports multi-page bundling with persistence.
 */

// Storage key for bundle data
const BUNDLE_STORAGE_KEY = 'eventatlas_capture_bundle';
const MAX_BUNDLE_PAGES = 20;

// Bundle state - array of captures
let bundle = [];

// Current view state
let currentView = 'bundle'; // 'bundle' or 'detail'
let currentDetailIndex = null;

// Detail view state
let selectedImages = new Set();
let textExpanded = false;

// Pending capture for duplicate handling
let pendingCapture = null;

// DOM Elements - Views
const bundleView = document.getElementById('bundleView');
const detailView = document.getElementById('detailView');
const backNav = document.getElementById('backNav');

// DOM Elements - Bundle view
const pageTitleEl = document.getElementById('pageTitle');
const pageUrlEl = document.getElementById('pageUrl');
const captureBtn = document.getElementById('captureBtn');
const captureBadge = document.getElementById('captureBadge');
const bundleSection = document.getElementById('bundleSection');
const bundleList = document.getElementById('bundleList');
const bundleCount = document.getElementById('bundleCount');
const copyBundleBtn = document.getElementById('copyBundleBtn');
const clearBundleBtn = document.getElementById('clearBundleBtn');

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
const textPreview = document.getElementById('textPreview');
const textCharCount = document.getElementById('textCharCount');
const textToggle = document.getElementById('textToggle');
const imageGallery = document.getElementById('imageGallery');
const imageSelectedCount = document.getElementById('imageSelectedCount');
const metadataSection = document.getElementById('metadataSection');
const metadataList = document.getElementById('metadataList');
const includeHtml = document.getElementById('includeHtml');
const includeImages = document.getElementById('includeImages');
const copyBtn = document.getElementById('copyBtn');
const removeBtn = document.getElementById('removeBtn');

// DOM Elements - Toast
const toastEl = document.getElementById('toast');

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
}

/**
 * Save bundle to local storage
 */
async function saveBundleToStorage() {
  try {
    await chrome.storage.local.set({ [BUNDLE_STORAGE_KEY]: bundle });
  } catch (err) {
    console.error('Error saving bundle:', err);
  }
}

/**
 * Load bundle from local storage
 */
async function loadBundleFromStorage() {
  try {
    const result = await chrome.storage.local.get(BUNDLE_STORAGE_KEY);
    if (result[BUNDLE_STORAGE_KEY] && Array.isArray(result[BUNDLE_STORAGE_KEY])) {
      bundle = result[BUNDLE_STORAGE_KEY];
      return true;
    }
  } catch (err) {
    console.error('Error loading bundle:', err);
  }
  bundle = [];
  return false;
}

/**
 * Clear bundle from storage
 */
async function clearBundleStorage() {
  try {
    await chrome.storage.local.remove(BUNDLE_STORAGE_KEY);
  } catch (err) {
    console.error('Error clearing bundle:', err);
  }
}

/**
 * Switch between views
 */
function switchView(view) {
  currentView = view;

  if (view === 'bundle') {
    bundleView.classList.add('active');
    detailView.classList.remove('active');
    backNav.classList.remove('visible');
    currentDetailIndex = null;
  } else if (view === 'detail') {
    bundleView.classList.remove('active');
    detailView.classList.add('active');
    backNav.classList.add('visible');
  }
}

/**
 * Update header badge
 */
function updateBadge() {
  const count = bundle.length;
  if (count === 0) {
    captureBadge.textContent = 'No captures';
    captureBadge.classList.remove('has-capture');
  } else {
    captureBadge.textContent = `${count} page${count !== 1 ? 's' : ''}`;
    captureBadge.classList.add('has-capture');
  }
}

/**
 * Render the bundle list
 */
function renderBundleList() {
  clearChildren(bundleList);
  updateBadge();

  const count = bundle.length;
  bundleCount.textContent = `${count} page${count !== 1 ? 's' : ''} captured`;

  if (count === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'bundle-empty';
    emptyEl.textContent = 'No pages captured yet. Click "Add to Bundle" to start.';
    bundleList.appendChild(emptyEl);
    return;
  }

  bundle.forEach((capture, index) => {
    const item = document.createElement('div');
    item.className = 'bundle-item';

    // Thumbnail
    const thumb = document.createElement('div');
    thumb.className = 'bundle-item-thumb';

    // Try to use first image as thumbnail
    const thumbUrl = capture.images?.[0] || capture.selectedImages?.[0];
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
    info.className = 'bundle-item-info';

    const title = document.createElement('div');
    title.className = 'bundle-item-title';
    title.textContent = capture.editedTitle || capture.title || 'Untitled';

    const domain = document.createElement('div');
    domain.className = 'bundle-item-domain';
    domain.textContent = getDomain(capture.editedUrl || capture.url || '');

    info.appendChild(title);
    info.appendChild(domain);

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'bundle-item-remove';
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove from bundle';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromBundle(index);
    });

    // Click to view details
    item.addEventListener('click', () => {
      viewCaptureDetail(index);
    });

    item.appendChild(thumb);
    item.appendChild(info);
    item.appendChild(removeBtn);
    bundleList.appendChild(item);
  });
}

/**
 * View capture detail
 */
function viewCaptureDetail(index) {
  if (index < 0 || index >= bundle.length) return;

  currentDetailIndex = index;
  const capture = bundle[index];

  // Restore selected images for this capture
  selectedImages = new Set(capture.selectedImages || capture.images || []);

  // Restore toggle states
  includeHtml.checked = capture.includeHtml !== false;
  includeImages.checked = capture.includeImages !== false;

  // Reset text expansion
  textExpanded = false;

  renderDetailPreview(capture);
  switchView('detail');
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
 * Clear all children from an element
 */
function clearChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
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
  if (currentDetailIndex === null || currentDetailIndex >= bundle.length) return;

  bundle[currentDetailIndex] = {
    ...bundle[currentDetailIndex],
    selectedImages: Array.from(selectedImages),
    editedTitle: editTitle.value,
    editedUrl: editUrl.value,
    includeHtml: includeHtml.checked,
    includeImages: includeImages.checked,
  };

  saveBundleToStorage();
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

  return exportData;
}

/**
 * Copy single capture to clipboard
 */
async function copySingleToClipboard() {
  if (currentDetailIndex === null || currentDetailIndex >= bundle.length) {
    showToast('No capture selected', 'error');
    return;
  }

  // Save any pending edits first
  saveCurrentDetail();

  const capture = bundle[currentDetailIndex];
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
 * Copy entire bundle to clipboard
 */
async function copyBundleToClipboard() {
  if (bundle.length === 0) {
    showToast('No pages in bundle', 'error');
    return;
  }

  const exportBundle = bundle.map(capture => buildExportData(capture));

  try {
    const json = JSON.stringify(exportBundle, null, 2);
    await navigator.clipboard.writeText(json);
    showToast(`Copied ${bundle.length} page${bundle.length !== 1 ? 's' : ''} to clipboard!`, 'success');
  } catch (err) {
    console.error('Copy bundle failed:', err);
    showToast('Failed to copy bundle', 'error');
  }
}

/**
 * Remove capture from bundle by index
 */
async function removeFromBundle(index) {
  if (index < 0 || index >= bundle.length) return;

  const removed = bundle.splice(index, 1)[0];
  await saveBundleToStorage();

  // If we're viewing the removed item, go back to list
  if (currentView === 'detail' && currentDetailIndex === index) {
    switchView('bundle');
  } else if (currentView === 'detail' && currentDetailIndex > index) {
    // Adjust index if we removed something before current view
    currentDetailIndex--;
  }

  renderBundleList();
  showToast(`Removed "${removed.title || 'page'}" from bundle`, 'success');
}

/**
 * Remove current capture from bundle (from detail view)
 */
async function removeCurrentFromBundle() {
  if (currentDetailIndex !== null) {
    await removeFromBundle(currentDetailIndex);
  }
}

/**
 * Clear entire bundle
 */
async function clearBundle() {
  bundle = [];
  await clearBundleStorage();

  if (currentView === 'detail') {
    switchView('bundle');
  }

  renderBundleList();
  showToast('Bundle cleared', 'success');
}

/**
 * Find duplicate URL in bundle
 */
function findDuplicateIndex(url) {
  return bundle.findIndex(capture => {
    const captureUrl = capture.editedUrl || capture.url;
    return captureUrl === url;
  });
}

/**
 * Add capture to bundle
 */
async function addToBundle(capture, replaceIndex = -1) {
  // Prepare capture data
  const captureData = {
    ...capture,
    selectedImages: capture.images || [],
    includeHtml: true,
    includeImages: true,
  };

  if (replaceIndex >= 0 && replaceIndex < bundle.length) {
    // Replace existing
    bundle[replaceIndex] = captureData;
  } else {
    // Check bundle limit
    if (bundle.length >= MAX_BUNDLE_PAGES) {
      showToast(`Bundle limit reached (${MAX_BUNDLE_PAGES} pages max)`, 'error');
      return false;
    }
    bundle.push(captureData);
  }

  await saveBundleToStorage();
  renderBundleList();
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
 * Capture page content
 */
async function capturePage() {
  captureBtn.disabled = true;
  captureBtn.textContent = 'Capturing...';
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

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'capture' });

    if (response.error) {
      throw new Error(response.error);
    }

    // Check for duplicate URL
    const duplicateIndex = findDuplicateIndex(response.url);

    if (duplicateIndex >= 0) {
      // Show duplicate dialog
      pendingCapture = { capture: response, duplicateIndex };
      showDuplicateDialog(bundle[duplicateIndex].editedTitle || bundle[duplicateIndex].title);

      captureBtn.textContent = 'Add to Bundle';
      captureBtn.disabled = false;
      return;
    }

    // Add to bundle
    const success = await addToBundle(response);

    if (success) {
      captureBtn.textContent = 'Added!';
      captureBtn.classList.add('success');
      showToast(`Added to bundle (${bundle.length} page${bundle.length !== 1 ? 's' : ''})`, 'success');

      setTimeout(() => {
        captureBtn.textContent = 'Add to Bundle';
        captureBtn.classList.remove('success');
        captureBtn.disabled = false;
      }, 1500);
    } else {
      captureBtn.textContent = 'Add to Bundle';
      captureBtn.disabled = false;
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

    captureBtn.textContent = 'Retry';
    captureBtn.classList.add('error');

    setTimeout(() => {
      captureBtn.textContent = 'Add to Bundle';
      captureBtn.classList.remove('error');
      captureBtn.disabled = false;
    }, 2000);
  }
}

/**
 * Handle duplicate replace
 */
async function handleDuplicateReplace() {
  if (!pendingCapture) return;

  const { capture, duplicateIndex } = pendingCapture;
  hideDuplicateDialog();

  const success = await addToBundle(capture, duplicateIndex);
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

// Event Listeners - Bundle view
captureBtn.addEventListener('click', capturePage);
copyBundleBtn.addEventListener('click', copyBundleToClipboard);
clearBundleBtn.addEventListener('click', clearBundle);

// Event Listeners - Duplicate dialog
duplicateReplace.addEventListener('click', handleDuplicateReplace);
duplicateSkip.addEventListener('click', handleDuplicateSkip);

// Event Listeners - Navigation
backNav.addEventListener('click', () => {
  saveCurrentDetail();
  switchView('bundle');
  renderBundleList();
});

// Event Listeners - Detail view
copyBtn.addEventListener('click', copySingleToClipboard);
removeBtn.addEventListener('click', removeCurrentFromBundle);

textToggle.addEventListener('click', () => {
  if (currentDetailIndex === null || currentDetailIndex >= bundle.length) return;

  textExpanded = !textExpanded;
  const fullText = bundle[currentDetailIndex].text || '';
  textPreview.textContent = textExpanded ? fullText : fullText.substring(0, 500) + (fullText.length > 500 ? '...' : '');
  textToggle.textContent = textExpanded ? 'Show less' : 'Show more';
  textPreview.classList.toggle('expanded', textExpanded);
});

// Save edits on change
editTitle.addEventListener('change', saveCurrentDetail);
editUrl.addEventListener('change', saveCurrentDetail);
includeHtml.addEventListener('change', saveCurrentDetail);
includeImages.addEventListener('change', saveCurrentDetail);

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

// Initialize
async function init() {
  await updateTabInfo();
  await loadBundleFromStorage();
  renderBundleList();
}

init();
