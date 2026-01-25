/**
 * EventAtlas Capture - Upload Queue Module
 *
 * Manages the screenshot upload queue with progress tracking and UI rendering.
 * Handles queuing, uploading via XMLHttpRequest, progress updates, retries, and cleanup.
 */

import { generateId } from './utils.js';

// Internal queue state
let uploadQueue = [];

// DOM element references (set via init)
let uploadQueueEl = null;
let uploadQueueCountEl = null;
let uploadQueueItemsEl = null;

// External callbacks (set via init)
let getSettings = null;
let getCurrentMatchedEvent = null;
let setCurrentMatchedEventMedia = null;
let renderSavedScreenshots = null;
let showToast = null;

/**
 * Initialize the upload queue module with DOM elements and callbacks
 * @param {Object} config - Configuration object
 * @param {HTMLElement} config.queueEl - The upload queue container element
 * @param {HTMLElement} config.countEl - The queue count badge element
 * @param {HTMLElement} config.itemsEl - The queue items container element
 * @param {Function} config.getSettings - Getter for settings (returns { apiUrl, apiToken })
 * @param {Function} config.getCurrentMatchedEvent - Getter for current matched event
 * @param {Function} config.setCurrentMatchedEventMedia - Setter for current event media array
 * @param {Function} config.renderSavedScreenshots - Function to render screenshots grid
 * @param {Function} config.showToast - Function to show toast notifications
 */
export function initUploadQueue(config) {
  uploadQueueEl = config.queueEl;
  uploadQueueCountEl = config.countEl;
  uploadQueueItemsEl = config.itemsEl;
  getSettings = config.getSettings;
  getCurrentMatchedEvent = config.getCurrentMatchedEvent;
  setCurrentMatchedEventMedia = config.setCurrentMatchedEventMedia;
  renderSavedScreenshots = config.renderSavedScreenshots;
  showToast = config.showToast;
}

/**
 * Get the current upload queue
 * @returns {Array} The upload queue array
 */
export function getUploadQueue() {
  return uploadQueue;
}

/**
 * Generate a small thumbnail from base64 image data
 * Returns a scaled-down version for the queue display
 * @param {string} imageData - Base64 image data
 * @param {number} maxSize - Maximum dimension (default 96)
 * @returns {Promise<string>} Base64 thumbnail data
 */
export function generateThumbnail(imageData, maxSize = 96) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(maxSize / img.width, maxSize / img.height);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => {
      resolve(imageData); // Fallback to original if thumbnail fails
    };
    img.src = imageData;
  });
}

/**
 * Add item to upload queue and start upload
 * @param {number} eventId - The event ID
 * @param {string} eventName - The event name for display
 * @param {string} imageData - Base64 image data
 * @param {string} filename - The filename
 * @returns {Promise<Object>} The queue item
 */
export async function addToUploadQueue(eventId, eventName, imageData, filename) {
  const id = generateId();
  const thumbnail = await generateThumbnail(imageData);

  const queueItem = {
    id,
    eventId,
    eventName,
    imageData,
    thumbnail,
    filename,
    status: 'uploading',
    progress: 0,
  };

  uploadQueue.push(queueItem);
  renderUploadQueue();

  // Re-render screenshots grid to show uploading item
  const currentEvent = getCurrentMatchedEvent?.();
  if (currentEvent && currentEvent.id === eventId) {
    renderSavedScreenshots?.(currentEvent.media || []);
  }

  // Start upload in background
  uploadQueueItem(queueItem);

  return queueItem;
}

/**
 * Upload a queue item with progress tracking using XMLHttpRequest
 * @param {Object} queueItem - The queue item to upload
 */
export function uploadQueueItem(queueItem) {
  const settings = getSettings?.() || {};
  const xhr = new XMLHttpRequest();

  xhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const progress = Math.round((e.loaded / e.total) * 100);
      updateQueueItemProgress(queueItem.id, progress);
    }
  });

  xhr.addEventListener('load', () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const data = JSON.parse(xhr.responseText);
        markQueueItemComplete(queueItem.id, data.media_asset);
      } catch {
        markQueueItemComplete(queueItem.id, null);
      }
    } else {
      let errorMessage = 'Upload failed';
      try {
        const errorData = JSON.parse(xhr.responseText);
        errorMessage = errorData.message || errorMessage;
      } catch {
        // Ignore parse errors
      }
      markQueueItemFailed(queueItem.id, errorMessage);
    }
  });

  xhr.addEventListener('error', () => {
    markQueueItemFailed(queueItem.id, 'Network error');
  });

  xhr.addEventListener('timeout', () => {
    markQueueItemFailed(queueItem.id, 'Upload timeout');
  });

  xhr.open('POST', `${settings.apiUrl}/api/extension/events/${queueItem.eventId}/screenshot`);
  xhr.setRequestHeader('Authorization', `Bearer ${settings.apiToken}`);
  xhr.setRequestHeader('Accept', 'application/json');
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.timeout = 60000; // 60 second timeout

  xhr.send(JSON.stringify({
    image: queueItem.imageData,
    filename: queueItem.filename,
  }));
}

/**
 * Update progress for a queue item
 * @param {string} id - The queue item ID
 * @param {number} progress - Progress percentage (0-100)
 */
export function updateQueueItemProgress(id, progress) {
  const item = uploadQueue.find(q => q.id === id);
  if (item) {
    item.progress = progress;
    updateQueueItemUI(id);

    // Also update grid overlay if visible
    const savedScreenshotsEl = document.getElementById('savedScreenshots');
    const gridItem = savedScreenshotsEl?.querySelector(`[data-queue-id="${id}"] .upload-overlay span`);
    if (gridItem) {
      gridItem.textContent = `${progress}%`;
    }
  }
}

/**
 * Mark queue item as complete
 * @param {string} id - The queue item ID
 * @param {Object|null} mediaAsset - The uploaded media asset data
 */
export function markQueueItemComplete(id, mediaAsset) {
  const item = uploadQueue.find(q => q.id === id);
  if (item) {
    item.status = 'complete';
    item.progress = 100;
    item.mediaAsset = mediaAsset;
    item.completedAt = Date.now();
    updateQueueItemUI(id);

    // Add to current event's media if it's the same event
    const currentEvent = getCurrentMatchedEvent?.();
    if (currentEvent && currentEvent.id === item.eventId && mediaAsset) {
      if (!currentEvent.media) {
        setCurrentMatchedEventMedia?.([]);
      }
      const media = currentEvent.media || [];
      media.push(mediaAsset);
      setCurrentMatchedEventMedia?.(media);
      renderSavedScreenshots?.(media);
    }

    // Remove from queue after animation completes (1.5s)
    setTimeout(() => {
      removeFromUploadQueue(id);
    }, 1500);
  }
}

/**
 * Mark queue item as failed
 * @param {string} id - The queue item ID
 * @param {string} error - The error message
 */
export function markQueueItemFailed(id, error) {
  const item = uploadQueue.find(q => q.id === id);
  if (item) {
    item.status = 'failed';
    item.error = error;
    updateQueueItemUI(id);
    showToast?.(`Upload failed: ${error}`, 'error');
  }
}

/**
 * Retry a failed upload
 * @param {string} id - The queue item ID
 */
export function retryQueueItem(id) {
  const item = uploadQueue.find(q => q.id === id);
  if (item && item.status === 'failed') {
    item.status = 'uploading';
    item.progress = 0;
    item.error = null;
    updateQueueItemUI(id);
    uploadQueueItem(item);
  }
}

/**
 * Remove item from upload queue
 * @param {string} id - The queue item ID
 */
export function removeFromUploadQueue(id) {
  uploadQueue = uploadQueue.filter(q => q.id !== id);
  renderUploadQueue();
}

/**
 * Render the entire upload queue UI
 */
export function renderUploadQueue() {
  if (!uploadQueueEl || !uploadQueueCountEl || !uploadQueueItemsEl) {
    return;
  }

  // Filter to only show active items (uploading or failed, or recently completed)
  const activeItems = uploadQueue.filter(q => q.status !== 'complete' || Date.now() - q.completedAt < 1500);

  // Show/hide queue based on content
  if (activeItems.length === 0) {
    uploadQueueEl.classList.remove('active');
    document.body.classList.remove('has-upload-queue');
    return;
  }

  uploadQueueEl.classList.add('active');
  document.body.classList.add('has-upload-queue');

  // Update count and title based on status
  const uploadingCount = uploadQueue.filter(q => q.status === 'uploading').length;
  const failedCount = uploadQueue.filter(q => q.status === 'failed').length;
  const queueTitle = uploadQueueEl.querySelector('.upload-queue-title');

  if (failedCount > 0 && uploadingCount === 0) {
    queueTitle.textContent = failedCount === 1 ? '1 upload failed' : `${failedCount} uploads failed`;
    uploadQueueCountEl.textContent = failedCount;
  } else if (uploadingCount > 0) {
    queueTitle.textContent = 'Uploading...';
    uploadQueueCountEl.textContent = uploadingCount;
  } else {
    queueTitle.textContent = 'Upload complete';
    uploadQueueCountEl.textContent = uploadQueue.length;
  }

  // Clear and rebuild items
  uploadQueueItemsEl.innerHTML = '';

  uploadQueue.forEach(item => {
    const itemEl = document.createElement('div');
    itemEl.className = `upload-queue-item ${item.status}`;
    itemEl.dataset.id = item.id;

    // Thumbnail image
    const img = document.createElement('img');
    img.src = item.thumbnail;
    img.alt = 'Uploading screenshot';
    itemEl.appendChild(img);

    // Progress ring (shown during upload)
    if (item.status === 'uploading') {
      const circumference = 2 * Math.PI * 10; // r=10
      const dashoffset = circumference - (item.progress / 100) * circumference;

      itemEl.innerHTML += `
        <svg class="progress-ring" width="24" height="24">
          <circle class="progress-ring-bg" cx="12" cy="12" r="10"/>
          <circle class="progress-ring-fill" cx="12" cy="12" r="10"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${dashoffset}"/>
        </svg>
      `;
    }

    // Check icon (shown on complete)
    const checkIcon = document.createElement('span');
    checkIcon.className = 'check-icon';
    checkIcon.textContent = '\u2714';
    itemEl.appendChild(checkIcon);

    // Retry button (shown on failure)
    if (item.status === 'failed') {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'retry-btn';
      retryBtn.innerHTML = '\u21bb';
      retryBtn.title = `Retry: ${item.error || 'Upload failed'}`;
      retryBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        retryQueueItem(item.id);
      });
      itemEl.appendChild(retryBtn);
    }

    // Event label
    const label = document.createElement('span');
    label.className = 'event-label';
    label.textContent = item.eventName || 'Event';
    label.title = item.eventName || 'Event';
    itemEl.appendChild(label);

    uploadQueueItemsEl.appendChild(itemEl);
  });
}

/**
 * Update a single queue item's UI (for progress updates)
 * @param {string} id - The queue item ID
 */
export function updateQueueItemUI(id) {
  const item = uploadQueue.find(q => q.id === id);
  if (!item) return;

  const itemEl = uploadQueueItemsEl?.querySelector(`[data-id="${id}"]`);
  if (!itemEl) {
    // Item not in DOM yet, do full render
    renderUploadQueue();
    return;
  }

  // Update class
  itemEl.className = `upload-queue-item ${item.status}`;

  // Update progress ring
  if (item.status === 'uploading') {
    const progressRing = itemEl.querySelector('.progress-ring-fill');
    if (progressRing) {
      const circumference = 2 * Math.PI * 10;
      const dashoffset = circumference - (item.progress / 100) * circumference;
      progressRing.setAttribute('stroke-dashoffset', dashoffset);
    }
  }
}

/**
 * Clear all items from upload queue (for testing/debug)
 */
export function clearUploadQueue() {
  uploadQueue = [];
  renderUploadQueue();
}
