# EventAtlas Capture

A Chrome extension for one-click content capture from any webpage, designed to streamline event discovery and content management for EventAtlas.

## Features

- **One-click capture** - Extract page content with a single click
- **Full page extraction** - Captures URL, title, HTML, text, and all image URLs
- **Metadata extraction** - Extracts Open Graph, Twitter Card, and standard meta tags
- **Screenshot capture** - Optional screenshot with every capture
- **Bundle management** - Organize captures into bundles by domain
- **Event editor** - Edit event type, tags, distances, and notes
- **Link discovery** - Scan organizer pages for new event links
- **EventAtlas API integration** - Sync with EventAtlas backend

## Development

This extension uses [WXT](https://wxt.dev/) for development and building.

### Prerequisites

- Node.js 18+
- npm or pnpm

### Setup

```bash
# Install dependencies
npm install

# Start development server (opens Chrome with extension loaded)
npm run dev

# Build for production
npm run build

# Create distribution zip
npm run zip
```

### Development Mode

Running `npm run dev` will:
1. Start a Vite dev server with HMR
2. Open a new Chrome window with the extension loaded
3. Auto-reload on file changes

The extension will be available in `.output/chrome-mv3-dev/`.

### Production Build

Running `npm run build` creates an optimized build in `.output/chrome-mv3/`.

### Manual Loading

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select `.output/chrome-mv3-dev/` (for dev) or `.output/chrome-mv3/` (for production)

## Project Structure

```
eventatlas-capture/
├── entrypoints/
│   ├── background.js       # Service worker (badge updates, screenshots)
│   ├── content.js          # Content script (page extraction)
│   └── sidepanel/
│       ├── index.html      # Side panel UI
│       ├── main.js         # Main orchestrator
│       ├── sidepanel.css   # Styles
│       ├── api.js          # EventAtlas API communication
│       ├── capture.js      # Page capture logic
│       ├── event-editor.js # Event metadata editor
│       ├── event-list.js   # Event list view
│       ├── bundles.js      # Bundle management
│       ├── page-detail.js  # Page detail view
│       ├── upload-queue.js # Screenshot upload queue
│       ├── url-status.js   # URL status & discovery
│       ├── storage.js      # Chrome storage wrapper
│       └── utils.js        # Utility functions
├── public/
│   └── icons/              # Extension icons
├── wxt.config.ts           # WXT configuration
├── package.json            # Dependencies and scripts
├── docs/                   # Documentation
├── SPEC.md                 # Feature specification
└── PROGRESS.md             # Development progress
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with HMR |
| `npm run dev:firefox` | Start dev server for Firefox |
| `npm run build` | Build for production |
| `npm run build:firefox` | Build for Firefox |
| `npm run zip` | Create distribution zip |

## Notes

- Extension does not work on `chrome://` or `chrome-extension://` pages
- Requires EventAtlas API token for sync functionality
- WXT generates manifest.json automatically from wxt.config.ts
