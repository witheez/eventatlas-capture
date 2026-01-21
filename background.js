/**
 * EventAtlas Capture - Background Service Worker
 *
 * Opens the side panel when the extension icon is clicked.
 * Handles screenshot capture via chrome.tabs.captureVisibleTab API.
 */

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
