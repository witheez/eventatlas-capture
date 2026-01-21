# EventAtlas Capture

A Chrome extension for one-click content capture from any webpage, designed to streamline event discovery and content management for EventAtlas.

## Features (Phase 1)

- **One-click capture** - Extract page content with a single click
- **Full page extraction** - Captures URL, title, HTML, text, and all image URLs
- **Metadata extraction** - Extracts Open Graph, Twitter Card, and standard meta tags
- **Clean popup UI** - Shows current page info and capture status

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select this folder (`eventatlas-capture`)
5. The extension icon should appear in your toolbar

## Usage

1. Navigate to any webpage you want to capture
2. Click the EventAtlas Capture extension icon in the toolbar
3. Click **Capture Page**
4. View capture results (HTML size, text size, image count)
5. Open DevTools (F12) → Console to see the full captured data

## Testing

1. Load the extension as described above
2. Navigate to any webpage (e.g., an Eventbrite event page)
3. Click the extension icon
4. Click "Capture Page"
5. Check the popup for capture statistics
6. Open DevTools console to see the full captured data object

### What Gets Captured

```javascript
{
  url: "https://example.com/event",
  title: "Page Title",
  html: "<!DOCTYPE html>...",  // Full HTML
  text: "Page text content...", // innerText
  images: ["https://...", ...], // All image URLs
  metadata: {
    og_title: "...",
    og_image: "...",
    description: "...",
    // etc.
  },
  capturedAt: "2026-01-21T10:30:00.000Z"
}
```

## Project Structure

```
eventatlas-capture/
├── manifest.json       # Extension manifest (V3)
├── popup/
│   ├── popup.html      # Popup UI
│   └── popup.js        # Popup logic
├── content/
│   └── content.js      # Content script (runs on pages)
├── icons/
│   └── README.md       # Icon placeholder
├── README.md           # This file
├── SPEC.md             # Full specification
└── PROGRESS.md         # Development progress
```

## Development Roadmap

See [SPEC.md](./SPEC.md) for the full feature specification.

### Phase 1 (Current) ✅
- Basic capture functionality
- Popup UI
- Content extraction

### Phase 2 (Planned)
- Selected text capture mode
- Screenshot capture
- Preview sidebar

### Phase 3 (Planned)
- Session-based bundling
- EventAtlas API integration
- Organizer matching

## Notes

- Extension does not work on `chrome://` or `chrome-extension://` pages
- Icons are placeholders - add proper icons before distribution
- Currently logs to console - API integration coming in Phase 3
