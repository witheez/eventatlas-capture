/**
 * EventAtlas Capture - Quick Add to Pipeline Module
 *
 * Handles the "Quick Add to Pipeline" UI for new pages.
 * Allows users to add URLs to the scraping pipeline either
 * as a child of an existing organizer or as standalone.
 */

import { checkParent, getProcessorConfigs, quickImport, normalizeBaseUrl } from './api';
import type { ProcessorConfig } from './api';
import { getSettings } from './store';

// Helper to create elements
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

export interface QuickAddElements {
  quickAddSection: HTMLElement | null;
  quickAddLoading: HTMLElement | null;
  quickAddParentFound: HTMLElement | null;
  quickAddApiBlocked: HTMLElement | null;
  quickAddStandalone: HTMLElement | null;
  parentDisplayName: HTMLElement | null;
  inheritedProcessorName: HTMLElement | null;
  blockedParentName: HTMLElement | null;
  viewParentLink: HTMLAnchorElement | null;
  processorConfigSelect: HTMLSelectElement | null;
  addAsChildBtn: HTMLButtonElement | null;
  addStandaloneBtn: HTMLButtonElement | null;
  // Options checkboxes
  parentAutoProcess: HTMLInputElement | null;
  parentCleanUrls: HTMLInputElement | null;
  standaloneAutoProcess: HTMLInputElement | null;
  standaloneCleanUrls: HTMLInputElement | null;
}

export interface QuickAddCallbacks {
  showToast: (message: string, type?: string) => void;
  onSuccess: () => void;
}

let elements: QuickAddElements = {
  quickAddSection: null,
  quickAddLoading: null,
  quickAddParentFound: null,
  quickAddApiBlocked: null,
  quickAddStandalone: null,
  parentDisplayName: null,
  inheritedProcessorName: null,
  blockedParentName: null,
  viewParentLink: null,
  processorConfigSelect: null,
  addAsChildBtn: null,
  addStandaloneBtn: null,
  parentAutoProcess: null,
  parentCleanUrls: null,
  standaloneAutoProcess: null,
  standaloneCleanUrls: null,
};

let callbacks: QuickAddCallbacks = {
  showToast: () => {},
  onSuccess: () => {},
};

let currentUrl = '';
let currentParentId: number | null = null;

/**
 * Initialize the quick-add module
 */
export function initQuickAdd(els: QuickAddElements, cbs: QuickAddCallbacks): void {
  elements = els;
  callbacks = cbs;
  setupEventListeners();
}

/**
 * Show the quick add section and check for parent
 */
export async function showQuickAddSection(url: string): Promise<void> {
  currentUrl = url;
  currentParentId = null;

  if (!elements.quickAddSection) return;

  // Show section and loading state
  elements.quickAddSection.style.display = 'block';
  hideAllSubsections();
  if (elements.quickAddLoading) {
    elements.quickAddLoading.style.display = 'flex';
  }

  const settings = getSettings();
  if (!settings.apiUrl || !settings.apiToken) {
    hideQuickAddSection();
    return;
  }

  // Check for parent
  const result = await checkParent(url, settings);

  if (!result.ok || !result.data) {
    // API error - hide section
    hideQuickAddSection();
    return;
  }

  hideAllSubsections();

  if (result.data.has_parent && result.data.parent) {
    const parent = result.data.parent;
    currentParentId = parent.id;

    if (parent.is_api_scraper) {
      // Parent uses API scraping - show blocked state
      if (elements.quickAddApiBlocked) {
        elements.quickAddApiBlocked.style.display = 'block';
      }
      if (elements.blockedParentName) {
        elements.blockedParentName.textContent = parent.display_name;
      }
      if (elements.viewParentLink) {
        const baseUrl = normalizeBaseUrl(settings.apiUrl);
        elements.viewParentLink.href = `${baseUrl}/admin/v2/pipeline?link=${parent.id}`;
      }
    } else {
      // Parent found with website scraper
      if (elements.quickAddParentFound) {
        elements.quickAddParentFound.style.display = 'block';
      }
      if (elements.parentDisplayName) {
        elements.parentDisplayName.textContent = parent.display_name;
      }
      if (elements.inheritedProcessorName) {
        elements.inheritedProcessorName.textContent =
          parent.child_processor?.name || 'Default processor';
      }
    }
  } else {
    // No parent - show standalone import
    if (elements.quickAddStandalone) {
      elements.quickAddStandalone.style.display = 'block';
    }

    // Fetch processor configs
    await loadProcessorConfigs();
  }
}

/**
 * Hide the quick add section
 */
export function hideQuickAddSection(): void {
  if (elements.quickAddSection) {
    elements.quickAddSection.style.display = 'none';
  }
  currentUrl = '';
  currentParentId = null;
}

/**
 * Hide all sub-sections
 */
function hideAllSubsections(): void {
  if (elements.quickAddLoading) elements.quickAddLoading.style.display = 'none';
  if (elements.quickAddParentFound) elements.quickAddParentFound.style.display = 'none';
  if (elements.quickAddApiBlocked) elements.quickAddApiBlocked.style.display = 'none';
  if (elements.quickAddStandalone) elements.quickAddStandalone.style.display = 'none';
}

/**
 * Load processor configurations for standalone import
 */
async function loadProcessorConfigs(): Promise<void> {
  const settings = getSettings();
  const result = await getProcessorConfigs(settings);

  if (!result.ok || !result.data?.processor_configs) {
    return;
  }

  const select = elements.processorConfigSelect;
  if (!select) return;

  // Clear existing options except the first one
  clearChildren(select);

  // Add default option
  const defaultOption = createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Select processor...';
  select.appendChild(defaultOption);

  // Add processor options
  result.data.processor_configs.forEach((config: ProcessorConfig) => {
    const option = createElement('option');
    option.value = String(config.id);
    option.textContent = config.name;
    if (config.description) {
      option.title = config.description;
    }
    select.appendChild(option);
  });
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
  // Add as child button
  if (elements.addAsChildBtn) {
    elements.addAsChildBtn.addEventListener('click', handleAddAsChild);
  }

  // Add standalone button
  if (elements.addStandaloneBtn) {
    elements.addStandaloneBtn.addEventListener('click', handleAddStandalone);
  }

  // Processor select change
  if (elements.processorConfigSelect) {
    elements.processorConfigSelect.addEventListener('change', () => {
      if (elements.addStandaloneBtn) {
        elements.addStandaloneBtn.disabled = !elements.processorConfigSelect?.value;
      }
    });
  }
}

/**
 * Handle adding URL as child of parent
 */
async function handleAddAsChild(): Promise<void> {
  if (!currentUrl || !currentParentId) return;

  const btn = elements.addAsChildBtn;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Adding...';
  }

  // Read checkbox values
  const autoProcess = elements.parentAutoProcess?.checked ?? false;
  const cleanUrls = elements.parentCleanUrls?.checked ?? true;

  const settings = getSettings();
  const result = await quickImport(settings, {
    url: currentUrl,
    parent_organizer_link_id: currentParentId,
    auto_process: autoProcess,
    clean_urls: cleanUrls,
  });

  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Add to Pipeline';
  }

  if (result.ok && result.data?.success) {
    callbacks.showToast(result.data.message || 'Added to pipeline', 'success');
    hideQuickAddSection();
    callbacks.onSuccess();
  } else {
    callbacks.showToast(result.error || 'Failed to add to pipeline', 'error');
  }
}

/**
 * Handle adding URL as standalone
 */
async function handleAddStandalone(): Promise<void> {
  if (!currentUrl) return;

  const processorId = elements.processorConfigSelect?.value;
  if (!processorId) {
    callbacks.showToast('Please select a processor', 'error');
    return;
  }

  const btn = elements.addStandaloneBtn;
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Adding...';
  }

  // Read checkbox values
  const autoProcess = elements.standaloneAutoProcess?.checked ?? false;
  const cleanUrls = elements.standaloneCleanUrls?.checked ?? true;

  const settings = getSettings();
  const result = await quickImport(settings, {
    url: currentUrl,
    processor_configuration_id: parseInt(processorId, 10),
    auto_process: autoProcess,
    clean_urls: cleanUrls,
  });

  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Add to Pipeline';
  }

  if (result.ok && result.data?.success) {
    callbacks.showToast(result.data.message || 'Added to pipeline', 'success');
    hideQuickAddSection();
    callbacks.onSuccess();
  } else {
    callbacks.showToast(result.error || 'Failed to add to pipeline', 'error');
  }
}
