/**
 * Tests for entrypoints/sidepanel/upload-queue.ts
 *
 * Note: This module is heavily DOM/browser-dependent. Tests focus on type
 * definitions and exportable pure functions where possible.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  initUploadQueue,
  getUploadQueue,
  clearUploadQueue,
  updateQueueItemProgress,
  markQueueItemComplete,
  markQueueItemFailed,
  retryQueueItem,
  removeFromUploadQueue,
  renderUploadQueue,
  type QueueItem,
  type MediaAsset,
  type MatchedEvent,
} from './upload-queue';
import type { Settings } from './storage';

// Mock settings
const mockSettings: Settings = {
  apiUrl: 'https://api.example.com',
  apiToken: 'test-token',
  syncMode: 'hybrid',
  autoGroupByDomain: true,
  captureScreenshotByDefault: false,
  autoSwitchTab: true,
  eventListRefreshInterval: 30000,
  distancePresets: [],
  screenshotUploadMode: 'auto',
};

describe('Upload Queue Types', () => {
  describe('QueueItem type', () => {
    it('should have correct structure for uploading item', () => {
      const item: QueueItem = {
        id: 'test-id',
        eventId: 1,
        eventName: 'Test Event',
        imageData: 'data:image/png;base64,abc123',
        thumbnail: 'data:image/jpeg;base64,thumb',
        filename: 'screenshot.png',
        status: 'uploading',
        progress: 50,
      };

      expect(item.status).toBe('uploading');
      expect(item.progress).toBe(50);
      expect(item.id).toBe('test-id');
      expect(item.eventId).toBe(1);
      expect(item.eventName).toBe('Test Event');
      expect(item.filename).toBe('screenshot.png');
    });

    it('should have correct structure for complete item', () => {
      const mediaAsset: MediaAsset = {
        id: 1,
        type: 'image',
        file_url: 'https://example.com/image.png',
        thumbnail_url: 'https://example.com/thumb.png',
        name: 'Screenshot',
      };

      const item: QueueItem = {
        id: 'test-id',
        eventId: 1,
        eventName: 'Test Event',
        imageData: 'data:image/png;base64,abc123',
        thumbnail: 'data:image/jpeg;base64,thumb',
        filename: 'screenshot.png',
        status: 'complete',
        progress: 100,
        mediaAsset,
        completedAt: Date.now(),
      };

      expect(item.status).toBe('complete');
      expect(item.progress).toBe(100);
      expect(item.mediaAsset).toEqual(mediaAsset);
      expect(item.completedAt).toBeDefined();
    });

    it('should have correct structure for failed item', () => {
      const item: QueueItem = {
        id: 'test-id',
        eventId: 1,
        eventName: 'Test Event',
        imageData: 'data:image/png;base64,abc123',
        thumbnail: 'data:image/jpeg;base64,thumb',
        filename: 'screenshot.png',
        status: 'failed',
        progress: 30,
        error: 'Network error',
      };

      expect(item.status).toBe('failed');
      expect(item.error).toBe('Network error');
      expect(item.progress).toBe(30);
    });
  });

  describe('MediaAsset type', () => {
    it('should have correct structure with all fields', () => {
      const asset: MediaAsset = {
        id: 123,
        type: 'image',
        file_url: 'https://cdn.example.com/images/photo.jpg',
        thumbnail_url: 'https://cdn.example.com/thumbs/photo.jpg',
        name: 'Event Photo',
      };

      expect(asset.id).toBe(123);
      expect(asset.type).toBe('image');
      expect(asset.file_url).toContain('https://');
      expect(asset.thumbnail_url).toContain('https://');
      expect(asset.name).toBe('Event Photo');
    });

    it('should allow optional fields', () => {
      const asset: MediaAsset = {
        id: 456,
        type: 'screenshot',
        file_url: 'https://example.com/file.png',
      };

      expect(asset.id).toBe(456);
      expect(asset.type).toBe('screenshot');
      expect(asset.thumbnail_url).toBeUndefined();
      expect(asset.name).toBeUndefined();
    });
  });

  describe('MatchedEvent type', () => {
    it('should have correct structure', () => {
      const event: MatchedEvent = {
        id: 42,
        media: [
          { id: 1, type: 'image', file_url: 'https://example.com/1.png' },
          { id: 2, type: 'screenshot', file_url: 'https://example.com/2.png' },
        ],
      };

      expect(event.id).toBe(42);
      expect(event.media).toHaveLength(2);
    });

    it('should allow empty media array', () => {
      const event: MatchedEvent = {
        id: 1,
        media: [],
      };

      expect(event.id).toBe(1);
      expect(event.media).toHaveLength(0);
    });

    it('should allow undefined media', () => {
      const event: MatchedEvent = {
        id: 1,
      };

      expect(event.id).toBe(1);
      expect(event.media).toBeUndefined();
    });
  });
});

describe('Upload Queue Functions (no DOM)', () => {
  let mockGetSettings: ReturnType<typeof vi.fn>;
  let mockGetCurrentMatchedEvent: ReturnType<typeof vi.fn>;
  let mockSetCurrentMatchedEventMedia: ReturnType<typeof vi.fn>;
  let mockRenderSavedScreenshots: ReturnType<typeof vi.fn>;
  let mockShowToast: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create mock elements
    const queueEl = document.createElement('div');
    const countEl = document.createElement('span');
    const itemsEl = document.createElement('div');
    const titleEl = document.createElement('div');
    titleEl.className = 'upload-queue-title';
    queueEl.appendChild(titleEl);

    // Create mock callbacks
    mockGetSettings = vi.fn(() => mockSettings);
    mockGetCurrentMatchedEvent = vi.fn(() => null);
    mockSetCurrentMatchedEventMedia = vi.fn();
    mockRenderSavedScreenshots = vi.fn();
    mockShowToast = vi.fn();

    // Initialize the upload queue
    initUploadQueue({
      queueEl,
      countEl,
      itemsEl,
      getSettings: mockGetSettings,
      getCurrentMatchedEvent: mockGetCurrentMatchedEvent,
      setCurrentMatchedEventMedia: mockSetCurrentMatchedEventMedia,
      renderSavedScreenshots: mockRenderSavedScreenshots,
      showToast: mockShowToast,
    });

    // Clear the queue
    clearUploadQueue();
  });

  afterEach(() => {
    clearUploadQueue();
    vi.clearAllMocks();
  });

  describe('getUploadQueue', () => {
    it('should return empty array initially', () => {
      expect(getUploadQueue()).toEqual([]);
    });

    it('should return the queue array', () => {
      const queue = getUploadQueue();
      expect(Array.isArray(queue)).toBe(true);
    });
  });

  describe('clearUploadQueue', () => {
    it('should clear all items from queue', () => {
      clearUploadQueue();
      expect(getUploadQueue()).toEqual([]);
    });
  });

  describe('updateQueueItemProgress', () => {
    it('should not crash when item does not exist', () => {
      expect(() => updateQueueItemProgress('non-existent', 50)).not.toThrow();
    });

    it('should handle zero progress', () => {
      expect(() => updateQueueItemProgress('test-id', 0)).not.toThrow();
    });

    it('should handle 100% progress', () => {
      expect(() => updateQueueItemProgress('test-id', 100)).not.toThrow();
    });
  });

  describe('markQueueItemComplete', () => {
    it('should not crash when item does not exist', () => {
      expect(() => markQueueItemComplete('non-existent', null)).not.toThrow();
    });

    it('should not crash with mediaAsset', () => {
      const mediaAsset: MediaAsset = { id: 1, type: 'image', file_url: 'https://example.com/img.png' };
      expect(() => markQueueItemComplete('non-existent', mediaAsset)).not.toThrow();
    });
  });

  describe('markQueueItemFailed', () => {
    it('should not crash when item does not exist', () => {
      expect(() => markQueueItemFailed('non-existent', 'Test error')).not.toThrow();
    });

    it('should not call showToast when item does not exist', () => {
      markQueueItemFailed('non-existent', 'Test error');
      expect(mockShowToast).not.toHaveBeenCalled();
    });
  });

  describe('retryQueueItem', () => {
    it('should not crash when item does not exist', () => {
      expect(() => retryQueueItem('non-existent')).not.toThrow();
    });
  });

  describe('removeFromUploadQueue', () => {
    it('should not crash when removing non-existent item', () => {
      expect(() => removeFromUploadQueue('non-existent')).not.toThrow();
    });

    it('should leave queue unchanged when item not found', () => {
      const beforeQueue = getUploadQueue();
      removeFromUploadQueue('non-existent');
      const afterQueue = getUploadQueue();
      expect(beforeQueue.length).toBe(afterQueue.length);
    });
  });

  describe('renderUploadQueue', () => {
    it('should not crash with empty queue', () => {
      expect(() => renderUploadQueue()).not.toThrow();
    });
  });

  describe('initUploadQueue with null elements', () => {
    it('should not crash when elements are null', () => {
      expect(() => {
        initUploadQueue({
          queueEl: null as unknown as HTMLElement,
          countEl: null as unknown as HTMLElement,
          itemsEl: null as unknown as HTMLElement,
          getSettings: mockGetSettings,
          getCurrentMatchedEvent: mockGetCurrentMatchedEvent,
          setCurrentMatchedEventMedia: mockSetCurrentMatchedEventMedia,
          renderSavedScreenshots: mockRenderSavedScreenshots,
          showToast: mockShowToast,
        });
      }).not.toThrow();
    });

    it('should still allow queue operations after null init', () => {
      initUploadQueue({
        queueEl: null as unknown as HTMLElement,
        countEl: null as unknown as HTMLElement,
        itemsEl: null as unknown as HTMLElement,
        getSettings: mockGetSettings,
        getCurrentMatchedEvent: mockGetCurrentMatchedEvent,
        setCurrentMatchedEventMedia: mockSetCurrentMatchedEventMedia,
        renderSavedScreenshots: mockRenderSavedScreenshots,
        showToast: mockShowToast,
      });

      expect(() => renderUploadQueue()).not.toThrow();
      expect(() => clearUploadQueue()).not.toThrow();
      expect(getUploadQueue()).toEqual([]);
    });
  });
});
