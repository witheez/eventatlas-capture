/**
 * EventAtlas Capture - Background Service Worker
 *
 * Opens the side panel when the extension icon is clicked.
 */

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Allow the side panel to be opened programmatically
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Error setting panel behavior:', error));
