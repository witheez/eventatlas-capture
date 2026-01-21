/**
 * EventAtlas Capture - Side Panel Script
 *
 * Handles side panel UI interactions, preview display, and bundle storage
 * for captured page data. Supports multi-page bundling with persistence.
 * Uses accordion-style bundles with drag-and-drop between bundles.
 */

// Storage keys
const STORAGE_KEY = 'eventatlas_capture_data';
const MAX_BUNDLE_PAGES = 20;
const MAX_BUNDLES = 50;

// Default settings
const DEFAULT_SETTINGS = {
  autoGroupByDomain: true,
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

// DOM Elements - Bundles view
const pageTitleEl = document.getElementById('pageTitle');
const pageUrlEl = document.getElementById('pageUrl');
const captureBtn = document.getElementById('captureBtn');
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

    // Send message to content script for page content
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'capture' });

    // Capture screenshot (runs in parallel conceptually, but after content capture)
    // Screenshot may fail for some pages (e.g., chrome:// pages) but that's OK
    const screenshot = await captureScreenshot(tab.windowId);

    // Add screenshot to response if captured
    if (screenshot) {
      response.screenshot = screenshot;
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
        captureBtn.textContent = 'Capture Page';
        captureBtn.disabled = false;
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

      captureBtn.textContent = 'Capture Page';
      captureBtn.disabled = false;
      return;
    }

    // Add to bundle
    const success = await addCaptureToBundle(targetBundle.id, response);

    if (success) {
      captureBtn.textContent = 'Added!';
      captureBtn.classList.add('success');
      const totalPages = bundles.reduce((sum, b) => sum + (b.pages?.length || 0), 0);
      showToast(`Added to "${targetBundle.name}" (${totalPages} total page${totalPages !== 1 ? 's' : ''})`, 'success');

      setTimeout(() => {
        captureBtn.textContent = 'Capture Page';
        captureBtn.classList.remove('success');
        captureBtn.disabled = false;
      }, 1500);
    } else {
      captureBtn.textContent = 'Capture Page';
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
      captureBtn.textContent = 'Capture Page';
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

// Event Listeners - Bundles view
captureBtn.addEventListener('click', capturePage);
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

// Initialize
async function init() {
  await updateTabInfo();
  await loadFromStorage();

  // Apply settings to UI
  autoGroupSetting.checked = settings.autoGroupByDomain;

  renderBundlesList();
}

init();
