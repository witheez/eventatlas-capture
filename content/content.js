/**
 * EventAtlas Capture - Content Script
 *
 * Runs in the context of web pages to extract content data.
 * Responds to messages from the popup to capture page content.
 */

/**
 * Extract all image URLs from the page
 * @returns {string[]} Array of absolute image URLs
 */
function extractImageUrls() {
  const images = new Set();

  // Get all <img> elements
  document.querySelectorAll('img').forEach(img => {
    if (img.src && !img.src.startsWith('data:')) {
      images.add(img.src);
    }
    // Also check srcset
    if (img.srcset) {
      img.srcset.split(',').forEach(src => {
        const url = src.trim().split(' ')[0];
        if (url && !url.startsWith('data:')) {
          try {
            images.add(new URL(url, window.location.href).href);
          } catch (e) {
            // Invalid URL, skip
          }
        }
      });
    }
  });

  // Get background images from inline styles
  document.querySelectorAll('[style*="background"]').forEach(el => {
    const style = el.getAttribute('style');
    const match = style?.match(/url\(['"]?([^'")\s]+)['"]?\)/);
    if (match && match[1] && !match[1].startsWith('data:')) {
      try {
        images.add(new URL(match[1], window.location.href).href);
      } catch (e) {
        // Invalid URL, skip
      }
    }
  });

  // Get images from picture/source elements
  document.querySelectorAll('source[srcset]').forEach(source => {
    source.srcset.split(',').forEach(src => {
      const url = src.trim().split(' ')[0];
      if (url && !url.startsWith('data:')) {
        try {
          images.add(new URL(url, window.location.href).href);
        } catch (e) {
          // Invalid URL, skip
        }
      }
    });
  });

  // Get Open Graph and Twitter card images
  document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"]').forEach(meta => {
    const content = meta.getAttribute('content');
    if (content) {
      try {
        images.add(new URL(content, window.location.href).href);
      } catch (e) {
        // Invalid URL, skip
      }
    }
  });

  return Array.from(images);
}

/**
 * Extract structured metadata from the page
 * @returns {object} Metadata object
 */
function extractMetadata() {
  const meta = {};

  // Open Graph
  document.querySelectorAll('meta[property^="og:"]').forEach(el => {
    const property = el.getAttribute('property')?.replace('og:', '');
    const content = el.getAttribute('content');
    if (property && content) {
      meta[`og_${property}`] = content;
    }
  });

  // Twitter Card
  document.querySelectorAll('meta[name^="twitter:"]').forEach(el => {
    const name = el.getAttribute('name')?.replace('twitter:', '');
    const content = el.getAttribute('content');
    if (name && content) {
      meta[`twitter_${name}`] = content;
    }
  });

  // Standard meta tags
  document.querySelectorAll('meta[name="description"], meta[name="author"]').forEach(el => {
    const name = el.getAttribute('name');
    const content = el.getAttribute('content');
    if (name && content) {
      meta[name] = content;
    }
  });

  return meta;
}

/**
 * Capture all page content
 * @returns {object} Captured content data
 */
function capturePageContent() {
  const capturedAt = new Date().toISOString();

  return {
    url: window.location.href,
    title: document.title,
    html: document.documentElement.outerHTML,
    text: document.body.innerText,
    images: extractImageUrls(),
    metadata: extractMetadata(),
    capturedAt: capturedAt,
  };
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'capture') {
    try {
      const data = capturePageContent();
      sendResponse(data);
    } catch (error) {
      sendResponse({ error: error.message });
    }
  }
  return true; // Keep channel open for async response
});

// Log that content script is loaded (helpful for debugging)
console.log('[EventAtlas Capture] Content script loaded');
