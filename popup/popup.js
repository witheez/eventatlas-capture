/**
 * EventAtlas Capture - Popup Script
 *
 * Handles popup UI interactions, preview display, and session storage
 * for captured page data.
 */

// Storage key for session data
const STORAGE_KEY = 'eventatlas_capture_data';

// Current capture state
let captureData = null;
let selectedImages = new Set();
let textExpanded = false;

// DOM Elements
const pageTitleEl = document.getElementById('pageTitle');
const pageUrlEl = document.getElementById('pageUrl');
const captureBtn = document.getElementById('captureBtn');
const captureBadge = document.getElementById('captureBadge');
const previewEl = document.getElementById('preview');
const toastEl = document.getElementById('toast');

// Stats elements
const htmlSizeStat = document.getElementById('htmlSizeStat');
const textSizeStat = document.getElementById('textSizeStat');
const imageSizeStat = document.getElementById('imageSizeStat');

// Editable fields
const editTitle = document.getElementById('editTitle');
const editUrl = document.getElementById('editUrl');

// Text preview elements
const textPreview = document.getElementById('textPreview');
const textCharCount = document.getElementById('textCharCount');
const textToggle = document.getElementById('textToggle');

// Image elements
const imageGallery = document.getElementById('imageGallery');
const imageSelectedCount = document.getElementById('imageSelectedCount');

// Metadata elements
const metadataSection = document.getElementById('metadataSection');
const metadataList = document.getElementById('metadataList');

// Toggle elements
const includeHtml = document.getElementById('includeHtml');
const includeImages = document.getElementById('includeImages');

// Action buttons
const copyBtn = document.getElementById('copyBtn');
const clearBtn = document.getElementById('clearBtn');

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
 * Save capture data to session storage
 */
async function saveToStorage() {
  if (!captureData) return;

  // Create storable version (without full HTML to save space if very large)
  const storableData = {
    ...captureData,
    selectedImages: Array.from(selectedImages),
    editedTitle: editTitle.value,
    editedUrl: editUrl.value,
    includeHtml: includeHtml.checked,
    includeImages: includeImages.checked,
  };

  try {
    await chrome.storage.session.set({ [STORAGE_KEY]: storableData });
  } catch (err) {
    console.error('Error saving to storage:', err);
    // Fall back to local storage if session storage fails
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: storableData });
    } catch (localErr) {
      console.error('Error saving to local storage:', localErr);
    }
  }
}

/**
 * Load capture data from session storage
 */
async function loadFromStorage() {
  try {
    // Try session storage first
    let result = await chrome.storage.session.get(STORAGE_KEY);

    // Fall back to local storage
    if (!result[STORAGE_KEY]) {
      result = await chrome.storage.local.get(STORAGE_KEY);
    }

    if (result[STORAGE_KEY]) {
      captureData = result[STORAGE_KEY];
      selectedImages = new Set(captureData.selectedImages || captureData.images || []);

      // Restore toggle states
      if (typeof captureData.includeHtml === 'boolean') {
        includeHtml.checked = captureData.includeHtml;
      }
      if (typeof captureData.includeImages === 'boolean') {
        includeImages.checked = captureData.includeImages;
      }

      renderPreview();
      return true;
    }
  } catch (err) {
    console.error('Error loading from storage:', err);
  }
  return false;
}

/**
 * Clear capture data from storage
 */
async function clearStorage() {
  try {
    await chrome.storage.session.remove(STORAGE_KEY);
    await chrome.storage.local.remove(STORAGE_KEY);
  } catch (err) {
    console.error('Error clearing storage:', err);
  }
}

/**
 * Render the preview UI with captured data
 */
function renderPreview() {
  if (!captureData) {
    previewEl.classList.remove('visible');
    captureBadge.textContent = 'No capture';
    captureBadge.classList.remove('has-capture');
    captureBtn.textContent = 'Capture Page';
    return;
  }

  // Update badge
  captureBadge.textContent = 'Has capture';
  captureBadge.classList.add('has-capture');
  captureBtn.textContent = 'Recapture Page';

  // Stats
  htmlSizeStat.textContent = formatBytes(captureData.html?.length || 0);
  textSizeStat.textContent = formatBytes(captureData.text?.length || 0);
  imageSizeStat.textContent = String(captureData.images?.length || 0);

  // Editable fields - use edited values if available
  editTitle.value = captureData.editedTitle || captureData.title || '';
  editUrl.value = captureData.editedUrl || captureData.url || '';

  // Text preview
  const fullText = captureData.text || '';
  const previewText = fullText.substring(0, 500);
  textPreview.textContent = textExpanded ? fullText : previewText + (fullText.length > 500 ? '...' : '');
  textCharCount.textContent = `${fullText.length.toLocaleString()} chars`;
  textToggle.style.display = fullText.length > 500 ? 'block' : 'none';
  textToggle.textContent = textExpanded ? 'Show less' : 'Show more';

  // Image gallery
  renderImageGallery();

  // Metadata
  renderMetadata();

  // Show preview
  previewEl.classList.add('visible');
}

/**
 * Render image gallery with selection checkboxes
 */
function renderImageGallery() {
  imageGallery.innerHTML = '';

  const images = captureData.images || [];

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
      item.innerHTML = '';
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
      updateImageCount();
      saveToStorage();
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

  updateImageCount();
}

/**
 * Update image selected count display
 */
function updateImageCount() {
  const total = captureData.images?.length || 0;
  const selected = selectedImages.size;
  imageSelectedCount.textContent = `${selected}/${total} selected`;
}

/**
 * Render metadata section
 */
function renderMetadata() {
  const metadata = captureData.metadata || {};
  const entries = Object.entries(metadata);

  if (entries.length === 0) {
    metadataSection.style.display = 'none';
    return;
  }

  metadataSection.style.display = 'block';
  metadataList.innerHTML = '';

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
 * Build export data based on current settings
 */
function buildExportData() {
  if (!captureData) return null;

  const exportData = {
    url: editUrl.value || captureData.url,
    title: editTitle.value || captureData.title,
    text: captureData.text,
    metadata: captureData.metadata,
    capturedAt: captureData.capturedAt,
  };

  if (includeHtml.checked) {
    exportData.html = captureData.html;
  }

  if (includeImages.checked && selectedImages.size > 0) {
    exportData.images = Array.from(selectedImages);
  }

  return exportData;
}

/**
 * Copy export data to clipboard
 */
async function copyToClipboard() {
  const exportData = buildExportData();
  if (!exportData) {
    showToast('No capture data to copy', 'error');
    return;
  }

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
 * Clear all captured data
 */
async function clearCapture() {
  captureData = null;
  selectedImages.clear();
  textExpanded = false;
  await clearStorage();
  renderPreview();
  showToast('Capture cleared', 'success');
}

/**
 * Capture page content via content script
 */
async function capturePage() {
  captureBtn.disabled = true;
  captureBtn.textContent = 'Capturing...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      throw new Error('No active tab found');
    }

    // Check if we can inject into this page
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      throw new Error('Cannot capture Chrome system pages');
    }

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'capture' });

    if (response.error) {
      throw new Error(response.error);
    }

    // Store capture data
    captureData = response;

    // Select all images by default
    selectedImages = new Set(captureData.images || []);

    // Reset text expansion
    textExpanded = false;

    // Save to storage
    await saveToStorage();

    // Render preview
    renderPreview();

    captureBtn.textContent = 'Captured!';
    captureBtn.classList.add('success');
    showToast('Page captured successfully!', 'success');

    // Reset button after 1.5 seconds
    setTimeout(() => {
      captureBtn.textContent = 'Recapture Page';
      captureBtn.classList.remove('success');
      captureBtn.disabled = false;
    }, 1500);

  } catch (err) {
    console.error('Capture error:', err);
    showToast(err.message, 'error');

    captureBtn.textContent = 'Retry';
    captureBtn.classList.add('error');

    setTimeout(() => {
      captureBtn.textContent = captureData ? 'Recapture Page' : 'Capture Page';
      captureBtn.classList.remove('error');
      captureBtn.disabled = false;
    }, 2000);
  }
}

// Event Listeners
captureBtn.addEventListener('click', capturePage);
copyBtn.addEventListener('click', copyToClipboard);
clearBtn.addEventListener('click', clearCapture);

textToggle.addEventListener('click', () => {
  textExpanded = !textExpanded;
  const fullText = captureData?.text || '';
  textPreview.textContent = textExpanded ? fullText : fullText.substring(0, 500) + (fullText.length > 500 ? '...' : '');
  textToggle.textContent = textExpanded ? 'Show less' : 'Show more';
  textPreview.classList.toggle('expanded', textExpanded);
});

// Save edits on change
editTitle.addEventListener('change', saveToStorage);
editUrl.addEventListener('change', saveToStorage);
includeHtml.addEventListener('change', saveToStorage);
includeImages.addEventListener('change', saveToStorage);

// Initialize
async function init() {
  await updateTabInfo();
  await loadFromStorage();
}

init();
