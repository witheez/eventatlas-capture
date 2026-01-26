/**
 * EventAtlas Capture - Page Detail Module
 *
 * Handles the page detail view when viewing a captured page.
 * Manages rendering preview, screenshot modal, image gallery, metadata, and export/copy.
 */

import { formatBytes, getDomain } from './utils';
import type { Capture, Bundle } from './storage';
import {
  getCurrentView,
  setCurrentView,
  getCurrentBundle,
  getCurrentBundleId,
  getCurrentPageIndex,
  setCurrentPageIndex,
  getBundles,
  getBundleById,
  getSelectedImages,
  setSelectedImages,
  getTextExpanded,
  setTextExpanded,
} from './store';

// Type definitions
interface PageDetailDom {
  bundlesView: HTMLElement;
  detailView: HTMLElement;
  backNav: HTMLElement;
  backNavText: HTMLElement;
  includeHtml: HTMLInputElement;
  includeImages: HTMLInputElement;
  includeScreenshot: HTMLInputElement;
  moveBundleSelect: HTMLSelectElement;
  htmlSizeStat: HTMLElement;
  textSizeStat: HTMLElement;
  imageSizeStat: HTMLElement;
  editTitle: HTMLInputElement;
  editUrl: HTMLInputElement;
  screenshotBadge: HTMLElement;
  screenshotThumb: HTMLImageElement;
  screenshotPlaceholder: HTMLElement;
  textPreview: HTMLElement;
  textCharCount: HTMLElement;
  textToggle: HTMLElement;
  imageGallery: HTMLElement;
  imageSelectedCount: HTMLElement;
  metadataSection: HTMLElement;
  metadataList: HTMLElement;
  screenshotModal: HTMLElement;
  screenshotModalImg: HTMLImageElement;
}

interface PageDetailCallbacks {
  saveToStorage: () => Promise<void>;
  renderBundlesList: () => void;
  showToast: (message: string, type?: string) => void;
}

interface ExportData {
  url?: string;
  title?: string;
  text?: string;
  html?: string;
  metadata?: Record<string, string>;
  capturedAt?: string;
  images?: string[];
  screenshot?: string;
}

// Module state
let dom: PageDetailDom;
let state: PageDetailState;
let callbacks: PageDetailCallbacks;

interface PageDetailConfig {
  dom: PageDetailDom;
  state: PageDetailState;
  callbacks: PageDetailCallbacks;
}

/**
 * Initialize the page detail module
 */
export function initPageDetail(config: PageDetailConfig): void {
  dom = config.dom;
  state = config.state;
  callbacks = config.callbacks;
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
 * Switch between views: 'bundles', 'detail'
 */
export function switchView(view: string): void {
  state.setCurrentView(view);

  // Hide all views
  dom.bundlesView.classList.remove('active');
  dom.detailView.classList.remove('active');
  dom.backNav.classList.remove('visible');

  if (view === 'bundles') {
    dom.bundlesView.classList.add('active');
    state.setCurrentPageIndex(null);
  } else if (view === 'detail') {
    dom.detailView.classList.add('active');
    dom.backNav.classList.add('visible');
    dom.backNavText.textContent = 'Back to Bundles';
  }
}

/**
 * View page detail
 */
export function viewPageDetail(index: number): void {
  const bundle = state.getCurrentBundle();
  if (!bundle || index < 0 || index >= bundle.pages.length) return;

  state.setCurrentPageIndex(index);
  const capture = bundle.pages[index];

  // Restore selected images for this capture
  const newSelectedImages = new Set<string>(capture.selectedImages || capture.images || []);
  state.setSelectedImages(newSelectedImages);

  // Restore toggle states
  dom.includeHtml.checked = capture.includeHtml !== false;
  dom.includeImages.checked = capture.includeImages !== false;
  dom.includeScreenshot.checked = capture.includeScreenshot !== false;

  // Reset text expansion
  state.setTextExpanded(false);

  // Populate move bundle dropdown
  populateMoveBundleSelect();

  renderDetailPreview(capture);
  switchView('detail');
}

/**
 * Populate the move-to-bundle dropdown
 */
export function populateMoveBundleSelect(): void {
  clearChildren(dom.moveBundleSelect);

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '-- Select bundle --';
  dom.moveBundleSelect.appendChild(defaultOption);

  const bundles = state.getBundles();
  const currentBundleId = state.getCurrentBundleId();

  bundles.forEach((bundle) => {
    // Skip current bundle
    if (bundle.id === currentBundleId) return;

    const option = document.createElement('option');
    option.value = bundle.id;
    option.textContent = bundle.name || 'Unnamed Bundle';
    dom.moveBundleSelect.appendChild(option);
  });
}

/**
 * Render detail preview for a capture
 */
export function renderDetailPreview(capture: Capture): void {
  // Stats
  dom.htmlSizeStat.textContent = formatBytes(capture.html?.length || 0);
  dom.textSizeStat.textContent = formatBytes(capture.text?.length || 0);
  dom.imageSizeStat.textContent = String(capture.images?.length || 0);

  // Editable fields
  dom.editTitle.value = capture.editedTitle || capture.title || '';
  dom.editUrl.value = capture.editedUrl || capture.url || '';

  // Screenshot
  renderScreenshot(capture);

  // Text preview
  const fullText = capture.text || '';
  const textExpanded = state.getTextExpanded();
  const previewText = fullText.substring(0, 500);
  dom.textPreview.textContent = textExpanded ? fullText : previewText + (fullText.length > 500 ? '...' : '');
  dom.textCharCount.textContent = `${fullText.length.toLocaleString()} chars`;
  dom.textToggle.style.display = fullText.length > 500 ? 'block' : 'none';
  dom.textToggle.textContent = textExpanded ? 'Show less' : 'Show more';

  // Image gallery
  renderImageGallery(capture);

  // Metadata
  renderMetadata(capture);
}

/**
 * Render screenshot section
 */
export function renderScreenshot(capture: Capture): void {
  if (capture.screenshot) {
    // Calculate approximate size of base64 data
    const screenshotSize = Math.round((capture.screenshot.length * 3) / 4); // Base64 to bytes
    dom.screenshotBadge.textContent = formatBytes(screenshotSize);

    dom.screenshotThumb.src = capture.screenshot;
    dom.screenshotThumb.style.display = 'block';
    dom.screenshotPlaceholder.style.display = 'none';
  } else {
    dom.screenshotBadge.textContent = 'N/A';
    dom.screenshotThumb.style.display = 'none';
    dom.screenshotPlaceholder.style.display = 'block';
  }
}

/**
 * Open screenshot modal
 */
export function openScreenshotModal(screenshotSrc: string): void {
  dom.screenshotModalImg.src = screenshotSrc;
  dom.screenshotModal.classList.add('visible');
}

/**
 * Close screenshot modal
 */
export function closeScreenshotModal(): void {
  dom.screenshotModal.classList.remove('visible');
  dom.screenshotModalImg.src = '';
}

/**
 * Render image gallery
 */
export function renderImageGallery(capture: Capture): void {
  clearChildren(dom.imageGallery);

  const images = capture.images || [];
  const selectedImages = state.getSelectedImages();

  if (images.length === 0) {
    const emptyEl = document.createElement('div');
    emptyEl.className = 'image-item-error';
    emptyEl.textContent = 'No images found';
    emptyEl.style.gridColumn = '1 / -1';
    emptyEl.style.padding = '16px';
    dom.imageGallery.appendChild(emptyEl);
    dom.imageSelectedCount.textContent = '0 selected';
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
      const currentSelectedImages = state.getSelectedImages();
      if (checkbox.checked) {
        currentSelectedImages.add(url);
        item.classList.remove('excluded');
      } else {
        currentSelectedImages.delete(url);
        item.classList.add('excluded');
      }
      state.setSelectedImages(currentSelectedImages);
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

    dom.imageGallery.appendChild(item);
  });

  updateImageCount(capture);
}

/**
 * Update image selected count
 */
export function updateImageCount(capture: Capture): void {
  const total = capture.images?.length || 0;
  const selected = state.getSelectedImages().size;
  dom.imageSelectedCount.textContent = `${selected}/${total} selected`;
}

/**
 * Render metadata section
 */
export function renderMetadata(capture: Capture): void {
  const metadata = capture.metadata || {};
  const entries = Object.entries(metadata);

  if (entries.length === 0) {
    dom.metadataSection.style.display = 'none';
    return;
  }

  dom.metadataSection.style.display = 'block';
  clearChildren(dom.metadataList);

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
    dom.metadataList.appendChild(item);
  });
}

/**
 * Save current detail view edits back to bundle
 */
export function saveCurrentDetail(): void {
  const bundle = state.getCurrentBundle();
  const currentPageIndex = state.getCurrentPageIndex();
  if (!bundle || currentPageIndex === null || currentPageIndex >= bundle.pages.length) return;

  const selectedImages = state.getSelectedImages();

  bundle.pages[currentPageIndex] = {
    ...bundle.pages[currentPageIndex],
    selectedImages: Array.from(selectedImages),
    editedTitle: dom.editTitle.value,
    editedUrl: dom.editUrl.value,
    includeHtml: dom.includeHtml.checked,
    includeImages: dom.includeImages.checked,
    includeScreenshot: dom.includeScreenshot.checked,
  };

  callbacks.saveToStorage();
}

/**
 * Build export data for a single capture
 */
export function buildExportData(capture: Capture): ExportData {
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
export async function copySingleToClipboard(): Promise<void> {
  const bundle = state.getCurrentBundle();
  const currentPageIndex = state.getCurrentPageIndex();
  if (!bundle || currentPageIndex === null || currentPageIndex >= bundle.pages.length) {
    callbacks.showToast('No capture selected', 'error');
    return;
  }

  // Save any pending edits first
  saveCurrentDetail();

  const capture = bundle.pages[currentPageIndex];
  const exportData = buildExportData(capture);

  try {
    const json = JSON.stringify(exportData, null, 2);
    await navigator.clipboard.writeText(json);
    callbacks.showToast('Copied to clipboard!', 'success');
  } catch (err) {
    console.error('Copy failed:', err);
    callbacks.showToast('Failed to copy', 'error');
  }
}

/**
 * Copy bundle to clipboard by bundle ID
 */
export async function copyBundleToClipboard(bundleId: string): Promise<void> {
  const bundle = state.getBundleById(bundleId);
  if (!bundle || bundle.pages.length === 0) {
    callbacks.showToast('No pages in bundle', 'error');
    return;
  }

  const exportBundle = bundle.pages.map((capture) => buildExportData(capture));

  try {
    const json = JSON.stringify(exportBundle, null, 2);
    await navigator.clipboard.writeText(json);
    callbacks.showToast(`Copied ${bundle.pages.length} page${bundle.pages.length !== 1 ? 's' : ''} to clipboard!`, 'success');
  } catch (err) {
    console.error('Copy bundle failed:', err);
    callbacks.showToast('Failed to copy bundle', 'error');
  }
}

/**
 * Remove page from bundle
 */
export async function removePageFromBundle(bundleId: string, index: number): Promise<void> {
  const bundle = state.getBundleById(bundleId);
  if (!bundle || index < 0 || index >= bundle.pages.length) return;

  const removed = bundle.pages.splice(index, 1)[0];
  await callbacks.saveToStorage();

  const currentView = state.getCurrentView();
  const currentBundleId = state.getCurrentBundleId();
  const currentPageIndex = state.getCurrentPageIndex();

  // If we're viewing the removed item in detail view, go back to bundles
  if (currentView === 'detail' && currentBundleId === bundleId && currentPageIndex === index) {
    switchView('bundles');
  } else if (currentView === 'detail' && currentBundleId === bundleId && currentPageIndex !== null && currentPageIndex > index) {
    // Adjust index if we removed something before current view
    state.setCurrentPageIndex(currentPageIndex - 1);
  }

  callbacks.renderBundlesList();
  callbacks.showToast(`Removed "${removed.title || 'page'}" from bundle`, 'success');
}

/**
 * Remove current page from bundle (from detail view)
 */
export async function removeCurrentFromBundle(): Promise<void> {
  const currentBundleId = state.getCurrentBundleId();
  const currentPageIndex = state.getCurrentPageIndex();
  if (currentBundleId && currentPageIndex !== null) {
    await removePageFromBundle(currentBundleId, currentPageIndex);
  }
}
