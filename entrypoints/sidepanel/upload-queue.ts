/**
 * EventAtlas Capture - Upload Queue Module
 *
 * Manages the screenshot upload queue with progress tracking and UI rendering.
 * Handles queuing, uploading via XMLHttpRequest, progress updates, retries, and cleanup.
 */

import { generateId } from './utils';
import type { Settings } from './storage';
import {
  getUploadQueue as getUploadQueueFromStore,
  setUploadQueue,
  addToUploadQueueState,
  removeFromUploadQueueState,
  getUploadQueueItem,
} from './store';

// Type definitions
export interface QueueItem {
  id: string;
  eventId: number;
  eventName: string;
  imageData: string;
  thumbnail: string;
  filename: string;
  status: 'uploading' | 'complete' | 'failed';
  progress: number;
  error?: string;
  mediaAsset?: MediaAsset | null;
  completedAt?: number;
}

export interface MediaAsset {
  id: number;
  type: string;
  file_url: string;
  thumbnail_url?: string;
  name?: string;
}

export interface MatchedEvent {
  id: number;
  media?: MediaAsset[];
}

// DOM element references (set via init)
let uploadQueueEl: HTMLElement | null = null;
let uploadQueueCountEl: HTMLElement | null = null;
let uploadQueueItemsEl: HTMLElement | null = null;

// External callbacks (set via init)
let getSettings: (() => Settings) | null = null;
let getCurrentMatchedEvent: (() => MatchedEvent | null) | null = null;
let setCurrentMatchedEventMedia: ((media: MediaAsset[]) => void) | null = null;
let renderSavedScreenshots: ((media: MediaAsset[]) => void) | null = null;
let showToast: ((message: string, type?: string) => void) | null = null;

interface UploadQueueConfig {
  queueEl: HTMLElement;
  countEl: HTMLElement;
  itemsEl: HTMLElement;
  getSettings: () => Settings;
  getCurrentMatchedEvent: () => MatchedEvent | null;
  setCurrentMatchedEventMedia: (media: MediaAsset[]) => void;
  renderSavedScreenshots: (media: MediaAsset[]) => void;
  showToast: (message: string, type?: string) => void;
}

/**
 * Initialize the upload queue module with DOM elements and callbacks
 */
export function initUploadQueue(config: UploadQueueConfig): void {
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
 */
export function getUploadQueue(): QueueItem[] {
  return getUploadQueueFromStore();
}

/**
 * Generate a small thumbnail from base64 image data
 * Returns a scaled-down version for the queue display
 */
export function generateThumbnail(imageData: string, maxSize = 96): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(maxSize / img.width, maxSize / img.height);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
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
 */
export async function addToUploadQueue(eventId: number, eventName: string, imageData: string, filename: string): Promise<QueueItem> {
  const id = generateId();
  const thumbnail = await generateThumbnail(imageData);

  const queueItem: QueueItem = {
    id,
    eventId,
    eventName,
    imageData,
    thumbnail,
    filename,
    status: 'uploading',
    progress: 0,
  };

  addToUploadQueueState(queueItem);
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
 */
export function uploadQueueItem(queueItem: QueueItem): void {
  const settings = getSettings?.();
  if (!settings) return;

  const xhr = new XMLHttpRequest();

  xhr.upload.addEventListener('progress', (e: ProgressEvent) => {
    if (e.lengthComputable) {
      const progress = Math.round((e.loaded / e.total) * 100);
      updateQueueItemProgress(queueItem.id, progress);
    }
  });

  xhr.addEventListener('load', () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        const data = JSON.parse(xhr.responseText) as { media_asset?: MediaAsset };
        markQueueItemComplete(queueItem.id, data.media_asset || null);
      } catch {
        markQueueItemComplete(queueItem.id, null);
      }
    } else {
      let errorMessage = 'Upload failed';
      try {
        const errorData = JSON.parse(xhr.responseText) as { message?: string };
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
 */
export function updateQueueItemProgress(id: string, progress: number): void {
  const item = getUploadQueueItem(id);
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
 */
export function markQueueItemComplete(id: string, mediaAsset: MediaAsset | null): void {
  const item = getUploadQueueItem(id);
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
 */
export function markQueueItemFailed(id: string, error: string): void {
  const item = getUploadQueueItem(id);
  if (item) {
    item.status = 'failed';
    item.error = error;
    updateQueueItemUI(id);
    showToast?.(`Upload failed: ${error}`, 'error');
  }
}

/**
 * Retry a failed upload
 */
export function retryQueueItem(id: string): void {
  const item = getUploadQueueItem(id);
  if (item && item.status === 'failed') {
    item.status = 'uploading';
    item.progress = 0;
    item.error = undefined;
    updateQueueItemUI(id);
    uploadQueueItem(item);
  }
}

/**
 * Remove item from upload queue
 */
export function removeFromUploadQueue(id: string): void {
  removeFromUploadQueueState(id);
  renderUploadQueue();
}

/**
 * Render the entire upload queue UI
 */
export function renderUploadQueue(): void {
  if (!uploadQueueEl || !uploadQueueCountEl || !uploadQueueItemsEl) {
    return;
  }

  const uploadQueue = getUploadQueueFromStore();
  // Filter to only show active items (uploading or failed, or recently completed)
  const activeItems = uploadQueue.filter(q => q.status !== 'complete' || (q.completedAt && Date.now() - q.completedAt < 1500));

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
    if (queueTitle) queueTitle.textContent = failedCount === 1 ? '1 upload failed' : `${failedCount} uploads failed`;
    uploadQueueCountEl.textContent = String(failedCount);
  } else if (uploadingCount > 0) {
    if (queueTitle) queueTitle.textContent = 'Uploading...';
    uploadQueueCountEl.textContent = String(uploadingCount);
  } else {
    if (queueTitle) queueTitle.textContent = 'Upload complete';
    uploadQueueCountEl.textContent = String(uploadQueue.length);
  }

  // Clear and rebuild items
  uploadQueueItemsEl.innerHTML = '';

  activeItems.forEach(item => {
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
 */
export function updateQueueItemUI(id: string): void {
  const item = getUploadQueueItem(id);
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
      progressRing.setAttribute('stroke-dashoffset', String(dashoffset));
    }
  }
}

/**
 * Clear all items from upload queue (for testing/debug)
 */
export function clearUploadQueue(): void {
  setUploadQueue([]);
  renderUploadQueue();
}
