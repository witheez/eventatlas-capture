/**
 * EventAtlas Capture - Event Editor Functions
 *
 * Handles event editing UI: tags, distances, event types, screenshots.
 * Uses a factory pattern to receive dependencies from sidepanel.js.
 */

import { generateId } from './utils.js';
import { fetchTags, fetchEventTypes, fetchDistances } from './api.js';

/**
 * Initialize the event editor module with dependencies
 * @param {Object} deps - Dependencies from sidepanel.js
 * @returns {Object} Public API for event editor
 */
export function initEventEditor(deps) {
  const {
    // DOM elements
    elements,
    // Settings getter
    getSettings,
    // State getters/setters
    getState,
    setState,
    // Helper functions
    showToast,
    buildAdminEditUrl,
    captureScreenshot,
    openScreenshotModal,
    mergeDistancesWithPresets,
  } = deps;

  // Extract DOM elements for convenience
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
    captureEventScreenshotBtn,
    captureEventHtmlBtn,
    savedScreenshotsEl,
    pageTitleEl,
    pageUrlEl,
    unsavedDialog,
    unsavedDialogText,
    unsavedSaveBtn,
    unsavedDiscardBtn,
    unsavedCancelBtn,
  } = elements;

  // ============================================================
  // Event Types
  // ============================================================

  /**
   * Render event type pills
   */
  function renderEventTypePills() {
    const state = getState();
    editorEventTypes.innerHTML = '';
    state.availableEventTypes.forEach((type) => {
      const btn = document.createElement('button');
      btn.className = 'event-type-btn' + (state.selectedEventTypeId === type.id ? ' selected' : '');
      btn.dataset.typeId = type.id;
      btn.textContent = type.name;
      btn.addEventListener('click', () => toggleEventType(type.id));
      editorEventTypes.appendChild(btn);
    });
  }

  /**
   * Toggle event type selection (single select)
   */
  function toggleEventType(typeId) {
    const state = getState();
    setState({
      selectedEventTypeId: state.selectedEventTypeId === typeId ? null : typeId,
    });
    renderEventTypePills();
    // Clear validation error when user selects a type
    if (getState().selectedEventTypeId) {
      document.getElementById('eventTypeError').classList.remove('visible');
    }
  }

  // ============================================================
  // Tags
  // ============================================================

  /**
   * Render tag chips
   */
  function renderTagsChips() {
    const state = getState();
    editorTags.innerHTML = '';

    state.availableTags.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip' + (state.selectedTagIds.has(tag.id) ? ' selected' : '');
      chip.dataset.tagId = tag.id;

      const checkmark = document.createElement('span');
      checkmark.className = 'tag-chip-check';
      checkmark.textContent = state.selectedTagIds.has(tag.id) ? '\u2713' : '';

      chip.appendChild(checkmark);

      // Tag name
      const nameSpan = document.createElement('span');
      nameSpan.textContent = tag.name;
      chip.appendChild(nameSpan);

      // Usage count (if available)
      if (typeof tag.events_count === 'number') {
        const countSpan = document.createElement('span');
        countSpan.className = 'tag-chip-count';
        countSpan.textContent = ` (${tag.events_count})`;
        chip.appendChild(countSpan);
      }

      chip.addEventListener('click', () => toggleTag(tag.id));
      editorTags.appendChild(chip);
    });

    // Render the create new tag input
    renderCreateTagInput();
  }

  /**
   * Render create new tag input
   */
  function renderCreateTagInput() {
    // Check if input container already exists
    let inputContainer = document.getElementById('createTagContainer');
    if (!inputContainer) {
      inputContainer = document.createElement('div');
      inputContainer.id = 'createTagContainer';
      inputContainer.className = 'create-tag-container';

      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'createTagInput';
      input.className = 'create-tag-input';
      input.placeholder = 'Create new tag...';

      const errorEl = document.createElement('div');
      errorEl.id = 'createTagError';
      errorEl.className = 'create-tag-error';
      errorEl.style.display = 'none';

      inputContainer.appendChild(input);
      inputContainer.appendChild(errorEl);

      // Insert after the tags container
      editorTags.parentElement.appendChild(inputContainer);

      // Event listeners
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

      // Clear error on input
      input.addEventListener('input', () => {
        const errorEl = document.getElementById('createTagError');
        if (errorEl) {
          errorEl.style.display = 'none';
        }
      });
    }
  }

  /**
   * Create a new tag via API
   */
  async function createNewTag(name) {
    if (!name) return;

    const settings = getSettings();
    if (!settings.apiUrl || !settings.apiToken) {
      showToast('API not configured', 'error');
      return;
    }

    const input = document.getElementById('createTagInput');
    const errorEl = document.getElementById('createTagError');

    // Disable input while creating
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
        const errorData = await response.json().catch(() => ({}));
        const message = errorData.message || errorData.errors?.name?.[0] || `Failed: ${response.status}`;
        throw new Error(message);
      }

      const data = await response.json();

      if (data.tag) {
        const state = getState();
        // Add the new tag to available tags
        state.availableTags.push(data.tag);

        // Auto-select the new tag
        state.selectedTagIds.add(data.tag.id);

        // Update state
        setState({
          availableTags: state.availableTags,
          selectedTagIds: state.selectedTagIds,
        });

        // Clear input
        if (input) {
          input.value = '';
        }

        // Re-render tags
        renderTagsChips();

        showToast(`Tag "${data.tag.name}" created`, 'success');
      }
    } catch (error) {
      console.error('[EventAtlas] Error creating tag:', error);

      // Show error message below input
      if (errorEl) {
        errorEl.textContent = error.message;
        errorEl.style.display = 'block';
      }

      showToast(error.message || 'Failed to create tag', 'error');
    } finally {
      if (input) {
        input.disabled = false;
        input.focus();
      }
    }
  }

  /**
   * Toggle tag selection
   */
  function toggleTag(tagId) {
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

  /**
   * Render distance buttons from availableDistances
   */
  function renderDistanceButtonsFromOptions() {
    const state = getState();
    editorDistances.innerHTML = '';
    state.availableDistances.forEach((dist) => {
      const btn = document.createElement('button');
      btn.className = 'distance-btn' + (dist.isUserPreset ? ' user-preset' : '');
      btn.dataset.value = dist.value;
      btn.textContent = dist.label;
      btn.title = dist.isUserPreset ? 'Custom preset' : '';
      btn.addEventListener('click', () => toggleDistance(dist.value));
      editorDistances.appendChild(btn);
    });
  }

  /**
   * Render distance buttons (update selected state)
   * Preserves user-preset class while toggling selected state
   */
  function renderDistanceButtons() {
    const state = getState();
    const buttons = editorDistances.querySelectorAll('.distance-btn');
    buttons.forEach((btn) => {
      const value = parseInt(btn.dataset.value, 10);
      const isUserPreset = btn.classList.contains('user-preset');

      if (state.selectedDistanceValues.includes(value)) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }

      // Ensure user-preset class is preserved
      if (isUserPreset && !btn.classList.contains('user-preset')) {
        btn.classList.add('user-preset');
      }
    });
  }

  /**
   * Toggle distance selection
   */
  function toggleDistance(value) {
    const state = getState();
    const numValue = parseInt(value, 10);
    const index = state.selectedDistanceValues.indexOf(numValue);

    if (index >= 0) {
      state.selectedDistanceValues.splice(index, 1);
    } else {
      state.selectedDistanceValues.push(numValue);
    }

    // Sort distances
    state.selectedDistanceValues.sort((a, b) => a - b);

    setState({ selectedDistanceValues: state.selectedDistanceValues });
    renderDistanceButtons();
    renderSelectedDistances();
  }

  /**
   * Add custom distance
   */
  function addCustomDistance() {
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

  /**
   * Remove a selected distance
   */
  function removeDistance(value) {
    const state = getState();
    const numValue = parseInt(value, 10);
    const index = state.selectedDistanceValues.indexOf(numValue);

    if (index >= 0) {
      state.selectedDistanceValues.splice(index, 1);
      setState({ selectedDistanceValues: state.selectedDistanceValues });
      renderDistanceButtons();
      renderSelectedDistances();
    }
  }

  /**
   * Render selected distances chips
   */
  function renderSelectedDistances() {
    const state = getState();
    selectedDistancesEl.innerHTML = '';

    if (state.selectedDistanceValues.length === 0) {
      return;
    }

    state.selectedDistanceValues.forEach((value) => {
      const chip = document.createElement('span');
      chip.className = 'selected-distance-chip';

      // Find label from available distances or use value + K
      const distObj = state.availableDistances.find(d => d.value === value);
      const label = distObj ? distObj.label : `${value}K`;

      chip.innerHTML = `${label} <span class="selected-distance-remove" data-value="${value}">&times;</span>`;

      chip.querySelector('.selected-distance-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        removeDistance(value);
      });

      selectedDistancesEl.appendChild(chip);
    });
  }

  // ============================================================
  // Screenshots
  // ============================================================

  /**
   * Render saved screenshots with delete buttons
   */
  function renderSavedScreenshots(media) {
    const state = getState();
    savedScreenshotsEl.innerHTML = '';

    // Filter for screenshots
    const screenshots = media.filter(m => m.type === 'screenshot' || m.type === 'Screenshot');

    // Render saved screenshots
    if (screenshots.length === 0 && state.pendingScreenshots.length === 0) {
      savedScreenshotsEl.innerHTML = '<div class="no-screenshots">No screenshots yet</div>';
      return;
    }

    screenshots.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'saved-screenshot-item';

      const img = document.createElement('img');
      img.src = item.thumbnail_url || item.file_url;
      img.alt = item.name || 'Screenshot';
      img.onerror = () => {
        div.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#9ca3af;font-size:10px;">Failed</div>';
      };

      div.appendChild(img);

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'screenshot-delete-btn';
      deleteBtn.innerHTML = '&times;';
      deleteBtn.title = 'Delete screenshot';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteScreenshot(item.id);
      });
      div.appendChild(deleteBtn);

      // Click to open in lightbox modal
      div.addEventListener('click', () => {
        openScreenshotModal(item.file_url);
      });

      savedScreenshotsEl.appendChild(div);
    });

    // Render uploading screenshots (from upload queue)
    const uploadingForEvent = state.uploadQueue.filter(q =>
      q.eventId === state.currentMatchedEvent?.id &&
      q.status === 'uploading'
    );

    uploadingForEvent.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'saved-screenshot-item uploading';
      div.dataset.queueId = item.id;

      const img = document.createElement('img');
      img.src = item.thumbnail;
      img.alt = 'Uploading...';
      div.appendChild(img);

      // Overlay with progress
      const overlay = document.createElement('div');
      overlay.className = 'upload-overlay';
      overlay.innerHTML = `<span>${item.progress}%</span>`;
      div.appendChild(overlay);

      savedScreenshotsEl.appendChild(div);
    });

    // Render pending screenshots section if any
    if (state.pendingScreenshots.length > 0) {
      renderPendingScreenshots();
    }
  }

  /**
   * Render pending screenshots (for on_save mode)
   */
  function renderPendingScreenshots() {
    const state = getState();
    // Create pending section if needed
    let pendingSection = savedScreenshotsEl.querySelector('.pending-screenshots-section');
    if (!pendingSection) {
      pendingSection = document.createElement('div');
      pendingSection.className = 'pending-screenshots-section';
      savedScreenshotsEl.appendChild(pendingSection);
    }

    pendingSection.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'pending-screenshots-header';
    header.innerHTML = `
      <span class="pending-screenshots-title">Pending Upload</span>
      <span class="pending-screenshots-count">${state.pendingScreenshots.length}</span>
    `;
    pendingSection.appendChild(header);

    // Grid
    const grid = document.createElement('div');
    grid.className = 'pending-screenshots-grid';

    state.pendingScreenshots.forEach((item) => {
      const div = document.createElement('div');
      div.className = 'pending-screenshot-item';

      const img = document.createElement('img');
      img.src = item.data;
      img.alt = 'Pending screenshot';

      div.appendChild(img);

      // Pending badge
      const badge = document.createElement('span');
      badge.className = 'pending-badge';
      badge.textContent = 'Pending';
      div.appendChild(badge);

      // Remove button
      const removeBtn = document.createElement('button');
      removeBtn.className = 'pending-screenshot-remove';
      removeBtn.innerHTML = '&times;';
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

  /**
   * Remove a pending screenshot
   */
  function removePendingScreenshot(id) {
    const state = getState();
    const newPending = state.pendingScreenshots.filter(s => s.id !== id);
    setState({ pendingScreenshots: newPending });
    // Re-render screenshots
    if (state.currentMatchedEvent) {
      renderSavedScreenshots(state.currentMatchedEvent.media || []);
    }
  }

  /**
   * Delete a saved screenshot via API
   */
  async function deleteScreenshot(mediaId) {
    const state = getState();
    const settings = getSettings();
    if (!state.currentMatchedEvent || !settings.apiUrl || !settings.apiToken) {
      showToast('Cannot delete - no event selected or API not configured', 'error');
      return;
    }

    // Confirm deletion
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Delete failed: ${response.status}`);
      }

      // Remove from local state
      if (state.currentMatchedEvent.media) {
        state.currentMatchedEvent.media = state.currentMatchedEvent.media.filter(m => m.id !== mediaId);
        setState({ currentMatchedEvent: state.currentMatchedEvent });
      }

      // Re-render
      renderSavedScreenshots(state.currentMatchedEvent.media || []);
      showToast('Screenshot deleted', 'success');

    } catch (error) {
      console.error('[EventAtlas] Error deleting screenshot:', error);
      showToast(error.message || 'Failed to delete screenshot', 'error');
    }
  }

  // ============================================================
  // Unsaved Changes
  // ============================================================

  /**
   * Check if there are unsaved changes (pending screenshots)
   */
  function hasUnsavedChanges() {
    const state = getState();
    return state.pendingScreenshots.length > 0;
  }

  /**
   * Show unsaved changes dialog
   */
  function showUnsavedDialog(message) {
    if (message) {
      unsavedDialogText.textContent = message;
    } else {
      unsavedDialogText.textContent = 'You have pending screenshots that haven\'t been uploaded. What would you like to do?';
    }
    unsavedDialog.classList.add('visible');
  }

  /**
   * Hide unsaved changes dialog
   */
  function hideUnsavedDialog() {
    unsavedDialog.classList.remove('visible');
    setState({ pendingUrlChange: null });
  }

  /**
   * Upload all pending screenshots
   */
  async function uploadPendingScreenshots() {
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
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `Upload failed: ${response.status}`);
        }

        const data = await response.json();

        // Add to current event's media
        if (data.media_asset) {
          if (!state.currentMatchedEvent.media) {
            state.currentMatchedEvent.media = [];
          }
          state.currentMatchedEvent.media.push(data.media_asset);
        }
      }

      // Clear pending screenshots
      setState({
        pendingScreenshots: [],
        currentMatchedEvent: state.currentMatchedEvent,
      });

      // Re-render
      renderSavedScreenshots(state.currentMatchedEvent.media || []);

      editorSaveBtn.textContent = 'Save Changes';
      editorSaveBtn.disabled = false;

      return true;
    } catch (error) {
      console.error('[EventAtlas] Error uploading pending screenshots:', error);
      showToast(error.message || 'Failed to upload screenshots', 'error');

      editorSaveBtn.textContent = 'Save Changes';
      editorSaveBtn.disabled = false;

      return false;
    }
  }

  /**
   * Discard all pending screenshots
   */
  function discardPendingScreenshots() {
    const state = getState();
    setState({ pendingScreenshots: [] });
    if (state.currentMatchedEvent) {
      renderSavedScreenshots(state.currentMatchedEvent.media || []);
    }
  }

  // ============================================================
  // Validation
  // ============================================================

  /**
   * Clear validation errors from event editor fields
   */
  function clearValidationErrors() {
    editorEventTypes.classList.remove('field-error');
    document.getElementById('eventTypeError').classList.remove('visible');
  }

  /**
   * Show validation error on a field
   */
  function showFieldError(field, errorId) {
    field.classList.add('field-error');
    document.getElementById(errorId).classList.add('visible');
    field.focus();
  }

  // ============================================================
  // Accordion
  // ============================================================

  /**
   * Toggle event editor accordion
   */
  function toggleEventEditorAccordion() {
    const state = getState();
    setState({ eventEditorExpanded: !state.eventEditorExpanded });
    updateEventEditorAccordionState();
    saveEventEditorAccordionState();
  }

  /**
   * Update the visual state of the event editor accordion
   */
  function updateEventEditorAccordionState() {
    const state = getState();
    if (state.eventEditorExpanded) {
      eventEditorChevron.classList.remove('collapsed');
      eventEditorContent.classList.remove('collapsed');
    } else {
      eventEditorChevron.classList.add('collapsed');
      eventEditorContent.classList.add('collapsed');
    }
  }

  /**
   * Save event editor accordion state to storage
   */
  async function saveEventEditorAccordionState() {
    const state = getState();
    try {
      await chrome.storage.local.set({ eventEditorAccordionExpanded: state.eventEditorExpanded });
    } catch (err) {
      console.error('Error saving accordion state:', err);
    }
  }

  /**
   * Load event editor accordion state from storage
   */
  async function loadEventEditorAccordionState() {
    try {
      const result = await chrome.storage.local.get(['eventEditorAccordionExpanded']);
      // If not set, default to expanded (true)
      setState({ eventEditorExpanded: result.eventEditorAccordionExpanded !== false });
    } catch (err) {
      console.error('Error loading accordion state:', err);
      setState({ eventEditorExpanded: true });
    }
  }

  // ============================================================
  // Editor Options Loading
  // ============================================================

  /**
   * Load editor options (tags, event types, distances)
   */
  async function loadEditorOptions() {
    const settings = getSettings();

    // Fetch all in parallel
    const [tags, eventTypes, distances] = await Promise.all([
      fetchTags(settings),
      fetchEventTypes(settings),
      fetchDistances(settings),
    ]);

    // Merge global distances with user custom presets
    const availableDistances = mergeDistancesWithPresets(distances);

    setState({
      availableTags: tags,
      availableEventTypes: eventTypes,
      availableDistances: availableDistances,
    });

    // Render event types pills
    renderEventTypePills();

    // Populate distances buttons (including user presets)
    renderDistanceButtonsFromOptions();
  }

  // ============================================================
  // Show/Hide Editor
  // ============================================================

  /**
   * Show event editor with matched event data
   */
  async function showEventEditor(event) {
    setState({ currentMatchedEvent: event });

    // Load accordion state from storage
    await loadEventEditorAccordionState();

    // Show editor and loading state
    eventEditor.classList.add('visible');
    editorLoading.style.display = 'flex';
    editorContent.style.display = 'none';

    // Set event name (legacy element, hidden)
    editorEventName.textContent = event.title || event.name || 'Untitled Event';

    // Populate accordion header with current page info
    // Use the current page title (from the tab), not the event name from API
    if (editorPageTitle) {
      editorPageTitle.textContent = pageTitleEl.textContent || 'Unknown Page';
    }
    if (editorPageUrl) {
      editorPageUrl.textContent = pageUrlEl.textContent || '';
    }

    // Set up the badge
    if (editorBadge) {
      editorBadge.innerHTML = '&#10003; Known Event';
    }

    // Set up the View link
    if (editorViewLink) {
      const adminUrl = buildAdminEditUrl(event.id);
      if (adminUrl) {
        editorViewLink.href = adminUrl;
        editorViewLink.style.display = 'inline';
        editorViewLink.onclick = (e) => {
          e.stopPropagation(); // Prevent accordion toggle
          window.open(adminUrl, '_blank');
          e.preventDefault();
        };
      } else {
        editorViewLink.style.display = 'none';
      }
    }

    // Always expand when showing for a new event match
    setState({ eventEditorExpanded: true });
    updateEventEditorAccordionState();

    // Load options if not already loaded
    const state = getState();
    if (state.availableEventTypes.length === 0 || state.availableTags.length === 0) {
      await loadEditorOptions();
    }

    // Set current values from event
    setState({
      selectedEventTypeId: event.event_type_id || null,
    });
    renderEventTypePills();

    // Set selected tags
    const newTagIds = new Set((event.tags || []).map(t => t.id));
    setState({ selectedTagIds: newTagIds });
    renderTagsChips();

    // Set selected distances
    const newDistances = Array.isArray(event.distances_km) ? [...event.distances_km] : [];
    setState({ selectedDistanceValues: newDistances });
    renderDistanceButtons();
    renderSelectedDistances();

    // Set notes
    editorNotes.value = event.notes || '';

    // Render saved screenshots
    renderSavedScreenshots(event.media || []);

    // Hide loading, show content
    editorLoading.style.display = 'none';
    editorContent.style.display = 'block';
  }

  /**
   * Hide event editor
   */
  function hideEventEditor() {
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

  /**
   * Save event changes to API
   */
  async function saveEventChanges() {
    const state = getState();
    const settings = getSettings();
    if (!state.currentMatchedEvent || !settings.apiUrl || !settings.apiToken) {
      showToast('Cannot save - no event selected or API not configured', 'error');
      return;
    }

    // Clear previous validation errors
    clearValidationErrors();

    // Validate required fields
    if (!state.selectedEventTypeId) {
      showFieldError(editorEventTypes, 'eventTypeError');
      showToast('Please select an event type', 'error');
      return;
    }

    editorSaveBtn.disabled = true;
    editorSaveBtn.textContent = 'Saving...';
    editorSaveBtn.classList.add('saving');

    try {
      // Upload pending screenshots first (if any)
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
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Save failed: ${response.status}`);
      }

      const data = await response.json();

      // Update current matched event with response
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
      showToast(error.message || 'Failed to save changes', 'error');

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

  /**
   * Setup event editor event listeners
   */
  function setupEventListeners() {
    eventEditorAccordionHeader.addEventListener('click', toggleEventEditorAccordion);
    editorSaveBtn.addEventListener('click', saveEventChanges);
    addCustomDistanceBtn.addEventListener('click', addCustomDistance);

    // Handle Enter key on custom distance input
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
    // Rendering
    renderEventTypePills,
    renderTagsChips,
    renderDistanceButtons,
    renderDistanceButtonsFromOptions,
    renderSelectedDistances,
    renderSavedScreenshots,
    renderPendingScreenshots,

    // Actions
    toggleEventType,
    toggleTag,
    toggleDistance,
    addCustomDistance,
    removeDistance,
    removePendingScreenshot,
    deleteScreenshot,
    createNewTag,

    // Editor controls
    showEventEditor,
    hideEventEditor,
    saveEventChanges,
    loadEditorOptions,

    // Accordion
    toggleEventEditorAccordion,
    updateEventEditorAccordionState,
    loadEventEditorAccordionState,

    // Unsaved changes
    hasUnsavedChanges,
    showUnsavedDialog,
    hideUnsavedDialog,
    uploadPendingScreenshots,
    discardPendingScreenshots,

    // Validation
    clearValidationErrors,
    showFieldError,

    // Setup
    setupEventListeners,
  };
}
