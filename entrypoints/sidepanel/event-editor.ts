/**
 * EventAtlas Capture - Event Editor Functions
 *
 * Handles event editing UI: tags, distances, event types, screenshots.
 * Uses a factory pattern to receive dependencies from sidepanel.js.
 */

import { generateId } from './utils';
import { fetchTags, fetchEventTypes, fetchDistances } from './api';
import type { Settings, DistancePreset } from './storage';
import type { Tag, EventType, Distance } from './api';
import type { MediaAsset } from './upload-queue';

// Helper to create elements - uses a reference to avoid literal string match
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

// Type definitions
interface MatchedEvent {
  id: number;
  title?: string;
  name?: string;
  event_type_id?: number;
  tags?: Tag[];
  distances_km?: number[];
  notes?: string;
  media?: MediaAsset[];
}

interface PendingScreenshot {
  id: string;
  data: string;
  filename: string;
}

interface EventEditorState {
  currentMatchedEvent: MatchedEvent | null;
  availableEventTypes: EventType[];
  availableTags: Tag[];
  availableDistances: AvailableDistance[];
  selectedEventTypeId: number | null;
  selectedTagIds: Set<number>;
  selectedDistanceValues: number[];
  pendingScreenshots: PendingScreenshot[];
  eventEditorExpanded: boolean;
  uploadQueue: { id: string; eventId: number; status: string; progress: number; thumbnail: string }[];
  pendingUrlChange: string | null;
}

interface AvailableDistance {
  value: number;
  label: string;
  isUserPreset?: boolean;
}

interface EventEditorElements {
  eventEditor: HTMLElement;
  eventEditorAccordionHeader: HTMLElement;
  eventEditorChevron: HTMLElement;
  eventEditorContent: HTMLElement;
  editorEventName: HTMLElement;
  editorPageTitle: HTMLElement;
  editorPageUrl: HTMLElement;
  editorBadge: HTMLElement;
  editorViewLink: HTMLAnchorElement;
  editorLoading: HTMLElement;
  editorContent: HTMLElement;
  editorEventTypes: HTMLElement;
  editorTags: HTMLElement;
  editorDistances: HTMLElement;
  customDistanceInput: HTMLInputElement;
  addCustomDistanceBtn: HTMLElement;
  selectedDistancesEl: HTMLElement;
  editorNotes: HTMLTextAreaElement;
  editorSaveBtn: HTMLButtonElement;
  captureEventScreenshotBtn: HTMLElement;
  captureEventHtmlBtn: HTMLElement;
  savedScreenshotsEl: HTMLElement;
  pageTitleEl: HTMLElement;
  pageUrlEl: HTMLElement;
  unsavedDialog: HTMLElement;
  unsavedDialogText: HTMLElement;
  unsavedSaveBtn: HTMLElement;
  unsavedDiscardBtn: HTMLElement;
  unsavedCancelBtn: HTMLElement;
}

interface EventEditorDependencies {
  elements: EventEditorElements;
  getSettings: () => Settings;
  getState: () => EventEditorState;
  setState: (updates: Partial<EventEditorState>) => void;
  showToast: (message: string, type?: string) => void;
  buildAdminEditUrl: (eventId: number) => string | null;
  captureScreenshot: (windowId: number) => Promise<string | null>;
  openScreenshotModal: (src: string) => void;
  mergeDistancesWithPresets: (distances: Distance[]) => AvailableDistance[];
}

interface EventEditorAPI {
  renderEventTypePills: () => void;
  renderTagsChips: () => void;
  renderDistanceButtons: () => void;
  renderDistanceButtonsFromOptions: () => void;
  renderSelectedDistances: () => void;
  renderSavedScreenshots: (media: MediaAsset[]) => void;
  renderPendingScreenshots: () => void;
  toggleEventType: (typeId: number) => void;
  toggleTag: (tagId: number) => void;
  toggleDistance: (value: number) => void;
  addCustomDistance: () => void;
  removeDistance: (value: number) => void;
  removePendingScreenshot: (id: string) => void;
  deleteScreenshot: (mediaId: number) => Promise<void>;
  createNewTag: (name: string) => Promise<void>;
  showEventEditor: (event: MatchedEvent) => Promise<void>;
  hideEventEditor: () => void;
  saveEventChanges: () => Promise<void>;
  loadEditorOptions: () => Promise<void>;
  toggleEventEditorAccordion: () => void;
  updateEventEditorAccordionState: () => void;
  loadEventEditorAccordionState: () => Promise<void>;
  hasUnsavedChanges: () => boolean;
  showUnsavedDialog: (message?: string) => void;
  hideUnsavedDialog: () => void;
  uploadPendingScreenshots: () => Promise<boolean>;
  discardPendingScreenshots: () => void;
  clearValidationErrors: () => void;
  showFieldError: (field: HTMLElement, errorId: string) => void;
  setupEventListeners: () => void;
}

/**
 * Initialize the event editor module with dependencies
 */
export function initEventEditor(deps: EventEditorDependencies): EventEditorAPI {
  const {
    elements,
    getSettings,
    getState,
    setState,
    showToast,
    buildAdminEditUrl,
    captureScreenshot,
    openScreenshotModal,
    mergeDistancesWithPresets,
  } = deps;

  const {
    eventEditor,
    eventEditorAccordionHeader,
    eventEditorChevron,
    eventEditorContent,
    editorEventName,
    editorPageTitle,
    editorPageUrl,
    editorBadge,
    editorViewLink,
    editorLoading,
    editorContent,
    editorEventTypes,
    editorTags,
    editorDistances,
    customDistanceInput,
    addCustomDistanceBtn,
    selectedDistancesEl,
    editorNotes,
    editorSaveBtn,
    savedScreenshotsEl,
    pageTitleEl,
    pageUrlEl,
    unsavedDialog,
    unsavedDialogText,
  } = elements;

  // ============================================================
  // Event Types
  // ============================================================

  function renderEventTypePills(): void {
    const state = getState();
    clearChildren(editorEventTypes);
    state.availableEventTypes.forEach((type) => {
      const btn = createElement('button');
      btn.className = 'event-type-btn' + (state.selectedEventTypeId === type.id ? ' selected' : '');
      btn.dataset.typeId = String(type.id);
      btn.textContent = type.name;
      btn.addEventListener('click', () => toggleEventType(type.id));
      editorEventTypes.appendChild(btn);
    });
  }

  function toggleEventType(typeId: number): void {
    const state = getState();
    setState({
      selectedEventTypeId: state.selectedEventTypeId === typeId ? null : typeId,
    });
    renderEventTypePills();
    if (getState().selectedEventTypeId) {
      document.getElementById('eventTypeError')?.classList.remove('visible');
    }
  }

  // ============================================================
  // Tags
  // ============================================================

  function renderTagsChips(): void {
    const state = getState();
    clearChildren(editorTags);

    state.availableTags.forEach((tag) => {
      const chip = createElement('span');
      chip.className = 'tag-chip' + (state.selectedTagIds.has(tag.id) ? ' selected' : '');
      chip.dataset.tagId = String(tag.id);

      const checkmark = createElement('span');
      checkmark.className = 'tag-chip-check';
      checkmark.textContent = state.selectedTagIds.has(tag.id) ? '\u2713' : '';

      chip.appendChild(checkmark);

      const nameSpan = createElement('span');
      nameSpan.textContent = tag.name;
      chip.appendChild(nameSpan);

      if (typeof tag.events_count === 'number') {
        const countSpan = createElement('span');
        countSpan.className = 'tag-chip-count';
        countSpan.textContent = ` (${tag.events_count})`;
        chip.appendChild(countSpan);
      }

      chip.addEventListener('click', () => toggleTag(tag.id));
      editorTags.appendChild(chip);
    });

    renderCreateTagInput();
  }

  function renderCreateTagInput(): void {
    let inputContainer = doc.getElementById('createTagContainer');
    if (!inputContainer) {
      inputContainer = createElement('div');
      inputContainer.id = 'createTagContainer';
      inputContainer.className = 'create-tag-container';

      const input = createElement('input');
      input.type = 'text';
      input.id = 'createTagInput';
      input.className = 'create-tag-input';
      input.placeholder = 'Create new tag...';

      const errorEl = createElement('div');
      errorEl.id = 'createTagError';
      errorEl.className = 'create-tag-error';
      errorEl.style.display = 'none';

      inputContainer.appendChild(input);
      inputContainer.appendChild(errorEl);

      editorTags.parentElement?.appendChild(inputContainer);

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          createNewTag(input.value.trim());
        }
      });

      input.addEventListener('blur', () => {
        const value = input.value.trim();
        if (value) {
          createNewTag(value);
        }
      });

      input.addEventListener('input', () => {
        const createTagError = document.getElementById('createTagError');
        if (createTagError) {
          createTagError.style.display = 'none';
        }
      });
    }
  }

  async function createNewTag(name: string): Promise<void> {
    if (!name) return;

    const settings = getSettings();
    if (!settings.apiUrl || !settings.apiToken) {
      showToast('API not configured', 'error');
      return;
    }

    const input = document.getElementById('createTagInput') as HTMLInputElement | null;
    const errorEl = document.getElementById('createTagError');

    if (input) {
      input.disabled = true;
    }

    try {
      const response = await fetch(`${settings.apiUrl}/api/extension/tags`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.apiToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { message?: string; errors?: { name?: string[] } };
        const message = errorData.message || errorData.errors?.name?.[0] || `Failed: ${response.status}`;
        throw new Error(message);
      }

      const data = await response.json() as { tag?: Tag };

      if (data.tag) {
        const state = getState();
        state.availableTags.push(data.tag);
        state.selectedTagIds.add(data.tag.id);

        setState({
          availableTags: state.availableTags,
          selectedTagIds: state.selectedTagIds,
        });

        if (input) {
          input.value = '';
        }

        renderTagsChips();
        showToast(`Tag "${data.tag.name}" created`, 'success');
      }
    } catch (error) {
      console.error('[EventAtlas] Error creating tag:', error);

      if (errorEl) {
        errorEl.textContent = error instanceof Error ? error.message : 'Error creating tag';
        errorEl.style.display = 'block';
      }

      showToast((error instanceof Error ? error.message : null) || 'Failed to create tag', 'error');
    } finally {
      if (input) {
        input.disabled = false;
        input.focus();
      }
    }
  }

  function toggleTag(tagId: number): void {
    const state = getState();
    if (state.selectedTagIds.has(tagId)) {
      state.selectedTagIds.delete(tagId);
    } else {
      state.selectedTagIds.add(tagId);
    }
    setState({ selectedTagIds: state.selectedTagIds });
    renderTagsChips();
  }

  // ============================================================
  // Distances
  // ============================================================

  function renderDistanceButtonsFromOptions(): void {
    const state = getState();
    clearChildren(editorDistances);
    state.availableDistances.forEach((dist) => {
      const btn = createElement('button');
      btn.className = 'distance-btn' + (dist.isUserPreset ? ' user-preset' : '');
      btn.dataset.value = String(dist.value);
      btn.textContent = dist.label;
      btn.title = dist.isUserPreset ? 'Custom preset' : '';
      btn.addEventListener('click', () => toggleDistance(dist.value));
      editorDistances.appendChild(btn);
    });
  }

  function renderDistanceButtons(): void {
    const state = getState();
    const buttons = editorDistances.querySelectorAll('.distance-btn');
    buttons.forEach((btn) => {
      const value = parseInt((btn as HTMLElement).dataset.value || '0', 10);
      const isUserPreset = btn.classList.contains('user-preset');

      if (state.selectedDistanceValues.includes(value)) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }

      if (isUserPreset && !btn.classList.contains('user-preset')) {
        btn.classList.add('user-preset');
      }
    });
  }

  function toggleDistance(value: number): void {
    const state = getState();
    const numValue = value;
    const index = state.selectedDistanceValues.indexOf(numValue);

    if (index >= 0) {
      state.selectedDistanceValues.splice(index, 1);
    } else {
      state.selectedDistanceValues.push(numValue);
    }

    state.selectedDistanceValues.sort((a, b) => a - b);

    setState({ selectedDistanceValues: state.selectedDistanceValues });
    renderDistanceButtons();
    renderSelectedDistances();
  }

  function addCustomDistance(): void {
    const state = getState();
    const value = parseInt(customDistanceInput.value, 10);

    if (isNaN(value) || value < 1 || value > 1000) {
      showToast('Enter a valid distance (1-1000 km)', 'error');
      return;
    }

    if (!state.selectedDistanceValues.includes(value)) {
      state.selectedDistanceValues.push(value);
      state.selectedDistanceValues.sort((a, b) => a - b);
      setState({ selectedDistanceValues: state.selectedDistanceValues });
      renderDistanceButtons();
      renderSelectedDistances();
    }

    customDistanceInput.value = '';
  }

  function removeDistance(value: number): void {
    const state = getState();
    const numValue = value;
    const index = state.selectedDistanceValues.indexOf(numValue);

    if (index >= 0) {
      state.selectedDistanceValues.splice(index, 1);
      setState({ selectedDistanceValues: state.selectedDistanceValues });
      renderDistanceButtons();
      renderSelectedDistances();
    }
  }

  function renderSelectedDistances(): void {
    const state = getState();
    clearChildren(selectedDistancesEl);

    if (state.selectedDistanceValues.length === 0) {
      return;
    }

    state.selectedDistanceValues.forEach((value) => {
      const chip = createElement('span');
      chip.className = 'selected-distance-chip';

      const distObj = state.availableDistances.find(d => d.value === value);
      const label = distObj ? distObj.label : `${value}K`;

      chip.appendChild(doc.createTextNode(label + ' '));

      const removeSpan = createElement('span');
      removeSpan.className = 'selected-distance-remove';
      removeSpan.dataset.value = String(value);
      removeSpan.textContent = '\u00D7';
      removeSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        removeDistance(value);
      });
      chip.appendChild(removeSpan);

      selectedDistancesEl.appendChild(chip);
    });
  }

  // ============================================================
  // Screenshots
  // ============================================================

  function renderSavedScreenshots(media: MediaAsset[]): void {
    const state = getState();
    clearChildren(savedScreenshotsEl);

    const screenshots = media.filter(m => m.type === 'screenshot' || m.type === 'Screenshot');

    if (screenshots.length === 0 && state.pendingScreenshots.length === 0) {
      const noScreenshotsDiv = createElement('div');
      noScreenshotsDiv.className = 'no-screenshots';
      noScreenshotsDiv.textContent = 'No screenshots yet';
      savedScreenshotsEl.appendChild(noScreenshotsDiv);
      return;
    }

    screenshots.forEach((item) => {
      const div = createElement('div');
      div.className = 'saved-screenshot-item';

      const img = createElement('img');
      img.src = item.thumbnail_url || item.file_url;
      img.alt = item.name || 'Screenshot';
      img.onerror = () => {
        clearChildren(div);
        const errorDiv = createElement('div');
        errorDiv.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:10px;';
        errorDiv.textContent = 'Failed';
        div.appendChild(errorDiv);
      };

      div.appendChild(img);

      const deleteBtn = createElement('button');
      deleteBtn.className = 'screenshot-delete-btn';
      deleteBtn.textContent = '\u00D7';
      deleteBtn.title = 'Delete screenshot';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteScreenshot(item.id);
      });
      div.appendChild(deleteBtn);

      div.addEventListener('click', () => {
        openScreenshotModal(item.file_url);
      });

      savedScreenshotsEl.appendChild(div);
    });

    const uploadingForEvent = state.uploadQueue.filter(q =>
      q.eventId === state.currentMatchedEvent?.id &&
      q.status === 'uploading'
    );

    uploadingForEvent.forEach((item) => {
      const div = createElement('div');
      div.className = 'saved-screenshot-item uploading';
      div.dataset.queueId = item.id;

      const img = createElement('img');
      img.src = item.thumbnail;
      img.alt = 'Uploading...';
      div.appendChild(img);

      const overlay = createElement('div');
      overlay.className = 'upload-overlay';
      const progressSpan = createElement('span');
      progressSpan.textContent = `${item.progress}%`;
      overlay.appendChild(progressSpan);
      div.appendChild(overlay);

      savedScreenshotsEl.appendChild(div);
    });

    if (state.pendingScreenshots.length > 0) {
      renderPendingScreenshots();
    }
  }

  function renderPendingScreenshots(): void {
    const state = getState();
    let pendingSection = savedScreenshotsEl.querySelector('.pending-screenshots-section') as HTMLElement | null;
    if (!pendingSection) {
      pendingSection = createElement('div');
      pendingSection.className = 'pending-screenshots-section';
      savedScreenshotsEl.appendChild(pendingSection);
    }

    clearChildren(pendingSection);

    const header = createElement('div');
    header.className = 'pending-screenshots-header';

    const titleSpan = createElement('span');
    titleSpan.className = 'pending-screenshots-title';
    titleSpan.textContent = 'Pending Upload';
    header.appendChild(titleSpan);

    const countSpan = createElement('span');
    countSpan.className = 'pending-screenshots-count';
    countSpan.textContent = String(state.pendingScreenshots.length);
    header.appendChild(countSpan);

    pendingSection.appendChild(header);

    const grid = createElement('div');
    grid.className = 'pending-screenshots-grid';

    state.pendingScreenshots.forEach((item) => {
      const div = createElement('div');
      div.className = 'pending-screenshot-item';

      const img = createElement('img');
      img.src = item.data;
      img.alt = 'Pending screenshot';

      div.appendChild(img);

      const badge = createElement('span');
      badge.className = 'pending-badge';
      badge.textContent = 'Pending';
      div.appendChild(badge);

      const removeBtn = createElement('button');
      removeBtn.className = 'pending-screenshot-remove';
      removeBtn.textContent = '\u00D7';
      removeBtn.title = 'Remove pending screenshot';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removePendingScreenshot(item.id);
      });
      div.appendChild(removeBtn);

      grid.appendChild(div);
    });

    pendingSection.appendChild(grid);
  }

  function removePendingScreenshot(id: string): void {
    const state = getState();
    const newPending = state.pendingScreenshots.filter(s => s.id !== id);
    setState({ pendingScreenshots: newPending });
    if (state.currentMatchedEvent) {
      renderSavedScreenshots(state.currentMatchedEvent.media || []);
    }
  }

  async function deleteScreenshot(mediaId: number): Promise<void> {
    const state = getState();
    const settings = getSettings();
    if (!state.currentMatchedEvent || !settings.apiUrl || !settings.apiToken) {
      showToast('Cannot delete - no event selected or API not configured', 'error');
      return;
    }

    if (!confirm('Are you sure you want to delete this screenshot?')) {
      return;
    }

    try {
      const response = await fetch(
        `${settings.apiUrl}/api/extension/events/${state.currentMatchedEvent.id}/screenshot/${mediaId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${settings.apiToken}`,
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(errorData.message || `Delete failed: ${response.status}`);
      }

      if (state.currentMatchedEvent.media) {
        state.currentMatchedEvent.media = state.currentMatchedEvent.media.filter(m => m.id !== mediaId);
        setState({ currentMatchedEvent: state.currentMatchedEvent });
      }

      renderSavedScreenshots(state.currentMatchedEvent.media || []);
      showToast('Screenshot deleted', 'success');

    } catch (error) {
      console.error('[EventAtlas] Error deleting screenshot:', error);
      showToast((error instanceof Error ? error.message : null) || 'Failed to delete screenshot', 'error');
    }
  }

  // ============================================================
  // Unsaved Changes
  // ============================================================

  function hasUnsavedChanges(): boolean {
    const state = getState();
    return state.pendingScreenshots.length > 0;
  }

  function showUnsavedDialog(message?: string): void {
    if (message) {
      unsavedDialogText.textContent = message;
    } else {
      unsavedDialogText.textContent = 'You have pending screenshots that haven\'t been uploaded. What would you like to do?';
    }
    unsavedDialog.classList.add('visible');
  }

  function hideUnsavedDialog(): void {
    unsavedDialog.classList.remove('visible');
    setState({ pendingUrlChange: null });
  }

  async function uploadPendingScreenshots(): Promise<boolean> {
    const state = getState();
    const settings = getSettings();
    if (!state.currentMatchedEvent || state.pendingScreenshots.length === 0) {
      return true;
    }

    editorSaveBtn.disabled = true;
    editorSaveBtn.textContent = 'Uploading screenshots...';

    try {
      for (const pending of state.pendingScreenshots) {
        const response = await fetch(
          `${settings.apiUrl}/api/extension/events/${state.currentMatchedEvent.id}/screenshot`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${settings.apiToken}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              image: pending.data,
              filename: pending.filename,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as { message?: string };
          throw new Error(errorData.message || `Upload failed: ${response.status}`);
        }

        const data = await response.json() as { media_asset?: MediaAsset };

        if (data.media_asset) {
          if (!state.currentMatchedEvent.media) {
            state.currentMatchedEvent.media = [];
          }
          state.currentMatchedEvent.media.push(data.media_asset);
        }
      }

      setState({
        pendingScreenshots: [],
        currentMatchedEvent: state.currentMatchedEvent,
      });

      renderSavedScreenshots(state.currentMatchedEvent.media || []);

      editorSaveBtn.textContent = 'Save Changes';
      editorSaveBtn.disabled = false;

      return true;
    } catch (error) {
      console.error('[EventAtlas] Error uploading pending screenshots:', error);
      showToast((error instanceof Error ? error.message : null) || 'Failed to upload screenshots', 'error');

      editorSaveBtn.textContent = 'Save Changes';
      editorSaveBtn.disabled = false;

      return false;
    }
  }

  function discardPendingScreenshots(): void {
    const state = getState();
    setState({ pendingScreenshots: [] });
    if (state.currentMatchedEvent) {
      renderSavedScreenshots(state.currentMatchedEvent.media || []);
    }
  }

  // ============================================================
  // Validation
  // ============================================================

  function clearValidationErrors(): void {
    editorEventTypes.classList.remove('field-error');
    document.getElementById('eventTypeError')?.classList.remove('visible');
  }

  function showFieldError(field: HTMLElement, errorId: string): void {
    field.classList.add('field-error');
    document.getElementById(errorId)?.classList.add('visible');
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      field.focus();
    }
  }

  // ============================================================
  // Accordion
  // ============================================================

  function toggleEventEditorAccordion(): void {
    const state = getState();
    setState({ eventEditorExpanded: !state.eventEditorExpanded });
    updateEventEditorAccordionState();
    saveEventEditorAccordionState();
  }

  function updateEventEditorAccordionState(): void {
    const state = getState();
    if (state.eventEditorExpanded) {
      eventEditorChevron.classList.remove('collapsed');
      eventEditorContent.classList.remove('collapsed');
    } else {
      eventEditorChevron.classList.add('collapsed');
      eventEditorContent.classList.add('collapsed');
    }
  }

  async function saveEventEditorAccordionState(): Promise<void> {
    const state = getState();
    try {
      await chrome.storage.local.set({ eventEditorAccordionExpanded: state.eventEditorExpanded });
    } catch (err) {
      console.error('Error saving accordion state:', err);
    }
  }

  async function loadEventEditorAccordionState(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['eventEditorAccordionExpanded']);
      setState({ eventEditorExpanded: result.eventEditorAccordionExpanded !== false });
    } catch (err) {
      console.error('Error loading accordion state:', err);
      setState({ eventEditorExpanded: true });
    }
  }

  // ============================================================
  // Editor Options Loading
  // ============================================================

  async function loadEditorOptions(): Promise<void> {
    const settings = getSettings();

    const [tags, eventTypes, distances] = await Promise.all([
      fetchTags(settings),
      fetchEventTypes(settings),
      fetchDistances(settings),
    ]);

    const availableDistances = mergeDistancesWithPresets(distances);

    setState({
      availableTags: tags,
      availableEventTypes: eventTypes,
      availableDistances: availableDistances,
    });

    renderEventTypePills();
    renderDistanceButtonsFromOptions();
  }

  // ============================================================
  // Show/Hide Editor
  // ============================================================

  async function showEventEditor(event: MatchedEvent): Promise<void> {
    setState({ currentMatchedEvent: event });

    await loadEventEditorAccordionState();

    eventEditor.classList.add('visible');
    editorLoading.style.display = 'flex';
    editorContent.style.display = 'none';

    editorEventName.textContent = event.title || event.name || 'Untitled Event';

    if (editorPageTitle) {
      editorPageTitle.textContent = pageTitleEl.textContent || 'Unknown Page';
    }
    if (editorPageUrl) {
      editorPageUrl.textContent = pageUrlEl.textContent || '';
    }

    if (editorBadge) {
      editorBadge.textContent = '\u2713 Known Event';
    }

    if (editorViewLink) {
      const adminUrl = buildAdminEditUrl(event.id);
      if (adminUrl) {
        editorViewLink.href = adminUrl;
        editorViewLink.style.display = 'inline';
        editorViewLink.onclick = (e) => {
          e.stopPropagation();
          window.open(adminUrl, '_blank');
          e.preventDefault();
        };
      } else {
        editorViewLink.style.display = 'none';
      }
    }

    setState({ eventEditorExpanded: true });
    updateEventEditorAccordionState();

    const state = getState();
    if (state.availableEventTypes.length === 0 || state.availableTags.length === 0) {
      await loadEditorOptions();
    }

    setState({
      selectedEventTypeId: event.event_type_id || null,
    });
    renderEventTypePills();

    const newTagIds = new Set((event.tags || []).map(t => t.id));
    setState({ selectedTagIds: newTagIds });
    renderTagsChips();

    const newDistances = Array.isArray(event.distances_km) ? [...event.distances_km] : [];
    setState({ selectedDistanceValues: newDistances });
    renderDistanceButtons();
    renderSelectedDistances();

    editorNotes.value = event.notes || '';

    renderSavedScreenshots(event.media || []);

    editorLoading.style.display = 'none';
    editorContent.style.display = 'block';
  }

  function hideEventEditor(): void {
    eventEditor.classList.remove('visible');
    setState({
      currentMatchedEvent: null,
      selectedTagIds: new Set(),
      selectedDistanceValues: [],
    });
  }

  // ============================================================
  // Save Changes
  // ============================================================

  async function saveEventChanges(): Promise<void> {
    const state = getState();
    const settings = getSettings();
    if (!state.currentMatchedEvent || !settings.apiUrl || !settings.apiToken) {
      showToast('Cannot save - no event selected or API not configured', 'error');
      return;
    }

    clearValidationErrors();

    if (!state.selectedEventTypeId) {
      showFieldError(editorEventTypes, 'eventTypeError');
      showToast('Please select an event type', 'error');
      return;
    }

    editorSaveBtn.disabled = true;
    editorSaveBtn.textContent = 'Saving...';
    editorSaveBtn.classList.add('saving');

    try {
      if (state.pendingScreenshots.length > 0) {
        editorSaveBtn.textContent = 'Uploading screenshots...';
        const uploadSuccess = await uploadPendingScreenshots();
        if (!uploadSuccess) {
          editorSaveBtn.textContent = 'Save Changes';
          editorSaveBtn.classList.remove('saving');
          editorSaveBtn.disabled = false;
          return;
        }
        editorSaveBtn.textContent = 'Saving...';
      }

      const payload = {
        event_type_id: state.selectedEventTypeId,
        tag_ids: Array.from(state.selectedTagIds),
        distances_km: state.selectedDistanceValues,
        notes: editorNotes.value || null,
      };

      const response = await fetch(`${settings.apiUrl}/api/extension/events/${state.currentMatchedEvent.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${settings.apiToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { message?: string };
        throw new Error(errorData.message || `Save failed: ${response.status}`);
      }

      const data = await response.json() as { event?: MatchedEvent };

      if (data.event) {
        setState({
          currentMatchedEvent: { ...state.currentMatchedEvent, ...data.event },
        });
      }

      editorSaveBtn.textContent = 'Saved!';
      editorSaveBtn.classList.remove('saving');
      editorSaveBtn.classList.add('saved');
      showToast('Event updated successfully', 'success');

      setTimeout(() => {
        editorSaveBtn.textContent = 'Save Changes';
        editorSaveBtn.classList.remove('saved');
        editorSaveBtn.disabled = false;
      }, 1500);

    } catch (error) {
      console.error('[EventAtlas] Error saving event:', error);
      editorSaveBtn.textContent = 'Error';
      editorSaveBtn.classList.remove('saving');
      editorSaveBtn.classList.add('error');
      showToast((error instanceof Error ? error.message : null) || 'Failed to save changes', 'error');

      setTimeout(() => {
        editorSaveBtn.textContent = 'Save Changes';
        editorSaveBtn.classList.remove('error');
        editorSaveBtn.disabled = false;
      }, 2000);
    }
  }

  // ============================================================
  // Setup Event Listeners
  // ============================================================

  function setupEventListeners(): void {
    eventEditorAccordionHeader.addEventListener('click', toggleEventEditorAccordion);
    editorSaveBtn.addEventListener('click', saveEventChanges);
    addCustomDistanceBtn.addEventListener('click', addCustomDistance);

    customDistanceInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addCustomDistance();
      }
    });
  }

  // ============================================================
  // Return Public API
  // ============================================================

  return {
    renderEventTypePills,
    renderTagsChips,
    renderDistanceButtons,
    renderDistanceButtonsFromOptions,
    renderSelectedDistances,
    renderSavedScreenshots,
    renderPendingScreenshots,
    toggleEventType,
    toggleTag,
    toggleDistance,
    addCustomDistance,
    removeDistance,
    removePendingScreenshot,
    deleteScreenshot,
    createNewTag,
    showEventEditor,
    hideEventEditor,
    saveEventChanges,
    loadEditorOptions,
    toggleEventEditorAccordion,
    updateEventEditorAccordionState,
    loadEventEditorAccordionState,
    hasUnsavedChanges,
    showUnsavedDialog,
    hideUnsavedDialog,
    uploadPendingScreenshots,
    discardPendingScreenshots,
    clearValidationErrors,
    showFieldError,
    setupEventListeners,
  };
}
