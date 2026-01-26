/**
 * EventAtlas Capture - Background Service Worker
 *
 * Opens the side panel when the extension icon is clicked.
 * Handles screenshot capture via chrome.tabs.captureVisibleTab API.
 * Shows badge indicators for known URLs from EventAtlas sync data.
 */

import { normalizeUrl } from '@/utils/url.js';

export default defineBackground(() => {
  // Storage key for sync data from EventAtlas
  const SYNC_DATA_KEY = 'eventatlas_sync_data';

  // Badge configuration by match type
  const BADGE_CONFIG = {
    event: { text: '\u2713', color: '#22c55e' },           // Green checkmark - known event
    content_item: { text: '\u25D0', color: '#f59e0b' },    // Amber half-circle - scraped but no event
    link_discovery: { text: '\u2295', color: '#3b82f6' },  // Blue circled plus - discovery page
    no_match: { text: '', color: '' }                      // No badge
  };

  /**
   * Update badge for a specific tab based on its URL
   * @param {number} tabId - Tab ID
   * @param {string} url - Tab URL
   */
  async function updateBadgeForTab(tabId, url) {
    // Skip chrome:// and extension:// URLs
    if (!url || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
      await chrome.action.setBadgeText({ tabId, text: '' });
      return;
    }

    try {
      const result = await chrome.storage.local.get(SYNC_DATA_KEY);
      const syncData = result[SYNC_DATA_KEY];

      if (!syncData) {
        await chrome.action.setBadgeText({ tabId, text: '' });
        return;
      }

      const normalizedUrl = normalizeUrl(url);
      let matchType = 'no_match';

      // Check against events (highest priority)
      // API returns source_url_normalized - already normalized, compare directly
      if (syncData.events && Array.isArray(syncData.events)) {
        for (const event of syncData.events) {
          if (event.source_url_normalized === normalizedUrl) {
            matchType = 'event';
            break;
          }
        }
      }

      // Check against organizer links / discovery pages
      // API returns url_normalized - already normalized, compare directly
      // Note: link_discovery pages are for discovering event URLs
      if (matchType === 'no_match' && syncData.organizerLinks && Array.isArray(syncData.organizerLinks)) {
        for (const link of syncData.organizerLinks) {
          if (link.url_normalized === normalizedUrl) {
            matchType = 'link_discovery';
            break;
          }
        }
      }

      // Set badge based on match type
      const badge = BADGE_CONFIG[matchType];
      await chrome.action.setBadgeText({ tabId, text: badge.text });
      if (badge.color) {
        await chrome.action.setBadgeBackgroundColor({ tabId, color: badge.color });
      }
    } catch (error) {
      console.error('[EventAtlas Capture] Error updating badge:', error);
      await chrome.action.setBadgeText({ tabId, text: '' });
    }
  }

  /**
   * Capture visible tab screenshot
   * @param {number} windowId - Window ID to capture
   * @returns {Promise<string>} Base64 PNG data URL
   */
  async function captureScreenshot(windowId) {
    try {
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
        format: 'png',
        quality: 90,
      });
      return dataUrl;
    } catch (error) {
      console.error('[EventAtlas Capture] Screenshot capture failed:', error);
      throw error;
    }
  }

  // Open side panel when extension icon is clicked
  chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ windowId: tab.windowId });
  });

  // Allow the side panel to be opened programmatically
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('Error setting panel behavior:', error));

  // Handle messages from side panel
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'captureScreenshot') {
      captureScreenshot(request.windowId)
        .then((screenshot) => sendResponse({ screenshot }))
        .catch((error) => sendResponse({ error: error.message }));
      return true; // Keep channel open for async response
    }
  });

  // Update badge when tab URL changes
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, _tab) => {
    if (changeInfo.url) {
      updateBadgeForTab(tabId, changeInfo.url);
    }
  });

  // Update badge when switching tabs
  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab.url) {
        updateBadgeForTab(activeInfo.tabId, tab.url);
      }
    } catch (error) {
      console.error('[EventAtlas Capture] Error getting tab info:', error);
    }
  });

  // Listen for storage changes to update badge when sync completes
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[SYNC_DATA_KEY]) {
      // Re-check current active tab when sync data changes
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url && tabs[0]?.id) {
          updateBadgeForTab(tabs[0].id, tabs[0].url);
        }
      });
    }
  });
});
