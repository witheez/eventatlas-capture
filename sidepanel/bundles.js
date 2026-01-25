/**
 * EventAtlas Capture - Bundle Management Functions
 *
 * Handles bundle CRUD operations, rendering, and drag-drop functionality.
 * Uses a factory pattern to receive dependencies from sidepanel.js.
 */

import { generateId, getDomain } from './utils.js';

/**
 * Initialize the bundles module with dependencies
 * @param {Object} deps - Dependencies from sidepanel.js
 * @returns {Object} Public API for bundle management
 */
export function initBundles(deps) {
  const {
    // State getters/setters
    getBundles,
    setBundles,
    getCurrentBundleId,
    setCurrentBundleId,
    getCurrentPageIndex,
    setCurrentPageIndex,
    getCurrentView,
    getDraggedPage,
    setDraggedPage,
    // Constants
    MAX_BUNDLES,
    MAX_BUNDLE_PAGES,
    // DOM elements
    elements,
    // Helper functions
    saveToStorage,
    showToast,
    switchView,
    viewPageDetail,
  } = deps;

  // Extract DOM elements for convenience
  const {
    bundlesList,
    bundlesCount,
    captureBadge,
  } = elements;

  // ============================================================
  // Bundle Accessors
  // ============================================================

  /**
   * Get bundle by ID
   */
  function getBundleById(id) {
    return getBundles().find((b) => b.id === id);
  }

  /**
   * Get current bundle
   */
  function getCurrentBundle() {
    const currentBundleId = getCurrentBundleId();
    return currentBundleId ? getBundleById(currentBundleId) : null;
  }

  /**
   * Find bundle for domain (for auto-grouping)
   */
  function findBundleForDomain(domain) {
    return getBundles().find((b) => b.name === domain);
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

  // ============================================================
  // Bundle CRUD
  // ============================================================

  /**
   * Create a new bundle
   */
  function createBundle(name) {
    const bundles = getBundles();
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
    setBundles(bundles);
    return newBundle;
  }

  /**
   * Delete an entire bundle
   */
  async function deleteBundle(bundleId) {
    const bundles = getBundles();
    const index = bundles.findIndex((b) => b.id === bundleId);
    if (index === -1) return;

    const removed = bundles.splice(index, 1)[0];
    setBundles(bundles);
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
  async function clearAllBundles() {
    const bundles = getBundles();
    if (bundles.length === 0) {
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

  // ============================================================
  // Bundle Accordion
  // ============================================================

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

  // ============================================================
  // Badge & Helpers
  // ============================================================

  /**
   * Update header badge - total pages across all bundles
   */
  function updateBadge() {
    const bundles = getBundles();
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
   * Clear all children from an element
   */
  function clearChildren(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  // ============================================================
  // Rendering
  // ============================================================

  /**
   * Render the bundles list with accordion (Main View)
   */
  function renderBundlesList() {
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
    chevron.innerHTML = '&#9654;'; // >

    // Icon
    const icon = document.createElement('span');
    icon.className = 'accordion-icon';
    icon.textContent = '\uD83D\uDCC1';

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
    copyBundleBtn.innerHTML = '&#128203;'; // clipboard emoji
    copyBundleBtn.title = 'Copy bundle to clipboard';
    copyBundleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // copyBundleToClipboard is provided via deps or called externally
      if (deps.copyBundleToClipboard) {
        deps.copyBundleToClipboard(bundle.id);
      }
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
    dragHandle.innerHTML = '&#8942;&#8942;'; // vertical dots

    // Thumbnail - prefer screenshot, then first image, then icon
    const thumb = document.createElement('div');
    thumb.className = 'accordion-page-thumb';

    const thumbUrl = capture.screenshot || capture.images?.[0] || capture.selectedImages?.[0];
    if (thumbUrl) {
      const img = document.createElement('img');
      img.src = thumbUrl;
      img.alt = '';
      img.onerror = () => {
        thumb.textContent = '\uD83D\uDCC4';
      };
      thumb.appendChild(img);
    } else {
      thumb.textContent = '\uD83D\uDCC4';
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
      if (deps.removePageFromBundle) {
        deps.removePageFromBundle(bundleId, index);
      }
    });

    // Click to view details
    item.addEventListener('click', (e) => {
      if (e.target.closest('.accordion-page-remove') || e.target.closest('.accordion-page-drag')) {
        return;
      }
      setCurrentBundleId(bundleId);
      viewPageDetail(index);
    });

    // Drag events
    item.addEventListener('dragstart', (e) => {
      setDraggedPage({ bundleId, pageIndex: index });
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({ bundleId, pageIndex: index }));
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      setDraggedPage(null);
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
      const draggedPage = getDraggedPage();
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

      const draggedPage = getDraggedPage();
      if (!draggedPage) return;

      const { bundleId: sourceBundleId, pageIndex } = draggedPage;
      if (sourceBundleId === bundleId) return; // Same bundle, no move needed

      // Move page from source to target bundle
      await movePageBetweenBundles(sourceBundleId, pageIndex, bundleId);
      setDraggedPage(null);
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

  // ============================================================
  // Return Public API
  // ============================================================

  return {
    // Accessors
    getBundleById,
    getCurrentBundle,
    findBundleForDomain,
    findDuplicateInBundle,

    // CRUD
    createBundle,
    deleteBundle,
    clearAllBundles,
    addCaptureToBundle,

    // Accordion
    toggleBundleExpanded,

    // Badge & Helpers
    updateBadge,
    clearChildren,

    // Rendering
    renderBundlesList,
    createAccordionBundle,
    createAccordionPageItem,
    setupBundleDropZone,
    movePageBetweenBundles,
  };
}
