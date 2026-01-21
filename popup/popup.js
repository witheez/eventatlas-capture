/**
 * EventAtlas Capture - Popup Script
 *
 * Handles popup UI interactions and communicates with content script
 * to capture page data.
 */

// DOM Elements
const pageTitleEl = document.getElementById('pageTitle');
const pageUrlEl = document.getElementById('pageUrl');
const captureBtn = document.getElementById('captureBtn');
const resultEl = document.getElementById('result');
const htmlSizeEl = document.getElementById('htmlSize');
const textSizeEl = document.getElementById('textSize');
const imageCountEl = document.getElementById('imageCount');

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

/**
 * Update UI with current tab info
 */
async function updateTabInfo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      pageTitleEl.textContent = tab.title || 'Unknown';
      pageUrlEl.textContent = tab.url || '';
    }
  } catch (err) {
    pageTitleEl.textContent = 'Unable to get tab info';
    console.error('Error getting tab info:', err);
  }
}

/**
 * Show error in result area (safely, without innerHTML)
 */
function showError(message) {
  // Reset the result element content safely
  resultEl.textContent = '';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'result-title';
  titleDiv.style.color = '#dc2626';
  titleDiv.textContent = 'Capture Failed';

  const messageDiv = document.createElement('div');
  messageDiv.style.marginTop = '8px';
  messageDiv.textContent = message;

  resultEl.appendChild(titleDiv);
  resultEl.appendChild(messageDiv);
  resultEl.classList.add('visible', 'error');
}

/**
 * Show success in result area (restore original structure)
 */
function showSuccess(htmlSize, textSize, imageCount) {
  // Reset the result element content safely
  resultEl.textContent = '';

  const titleDiv = document.createElement('div');
  titleDiv.className = 'result-title';
  titleDiv.textContent = 'Capture Complete';
  resultEl.appendChild(titleDiv);

  const items = [
    { label: 'HTML Size', value: htmlSize, id: 'htmlSize' },
    { label: 'Text Size', value: textSize, id: 'textSize' },
    { label: 'Images Found', value: imageCount, id: 'imageCount' },
  ];

  items.forEach(item => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'result-item';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'label';
    labelSpan.textContent = item.label;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'value';
    valueSpan.id = item.id;
    valueSpan.textContent = item.value;

    itemDiv.appendChild(labelSpan);
    itemDiv.appendChild(valueSpan);
    resultEl.appendChild(itemDiv);
  });

  resultEl.classList.remove('error');
  resultEl.classList.add('visible');
}

/**
 * Capture page content via content script
 */
async function capturePage() {
  captureBtn.disabled = true;
  captureBtn.textContent = 'Capturing...';
  resultEl.classList.remove('visible', 'error');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      throw new Error('No active tab found');
    }

    // Check if we can inject into this page
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
      throw new Error('Cannot capture Chrome system pages');
    }

    // Send message to content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'capture' });

    if (response.error) {
      throw new Error(response.error);
    }

    // Log full captured data to console for debugging
    console.log('Captured data:', response);

    // Update UI with results
    showSuccess(
      formatBytes(response.html?.length || 0),
      formatBytes(response.text?.length || 0),
      String(response.images?.length || 0)
    );

    captureBtn.textContent = 'Captured!';
    captureBtn.classList.add('success');

    // Reset button after 2 seconds
    setTimeout(() => {
      captureBtn.textContent = 'Capture Page';
      captureBtn.classList.remove('success');
      captureBtn.disabled = false;
    }, 2000);

  } catch (err) {
    console.error('Capture error:', err);

    showError(err.message);

    captureBtn.textContent = 'Retry';
    captureBtn.classList.add('error');

    setTimeout(() => {
      captureBtn.textContent = 'Capture Page';
      captureBtn.classList.remove('error');
      captureBtn.disabled = false;
    }, 2000);
  }
}

// Event Listeners
captureBtn.addEventListener('click', capturePage);

// Initialize
updateTabInfo();
