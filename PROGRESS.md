# Chrome Extension Development Progress

> **New Agent?** Read `CONTEXT.md` first for session context and rules.
> Also read `/Users/danielforstner/Herd/eventatlas/.claude/CLAUDE.md` for project rules.

## Current Status: Feature Complete

All core phases are complete. The extension is fully functional for:
- Content capture and bundling
- URL status lookup (event, content item, link discovery)
- Event editing (tags, distances, event type, notes, screenshots)
- Link discovery comparison and adding new links

---

## Completed Phases

### Phase 1: Extension Scaffold ✅
- Manifest V3 with side panel
- Content script for page extraction
- Background service worker

### Phase 2: Preview UI ✅
- Sidebar panel (stays open while browsing)
- Page info display with editable title/URL
- Text preview with expand/collapse
- Image gallery with include/exclude
- Metadata display
- Copy to clipboard (JSON)

### Phase 3: Multi-page Bundling ✅
- Multiple bundles support
- Accordion-style UI (expand to see pages)
- Drag & drop pages between bundles
- Settings panel with gear icon
- "Auto-group by domain" setting
- Session persistence (survives restart)

### Phase 4: Screenshot Capture ✅
- Viewport screenshot on capture
- Setting: "Capture screenshots by default"
- Adaptive buttons based on setting
- "Add Screenshot" button in detail view
- Screenshot preview with modal

### Phase 5: Wire to EventAtlas API ✅
- **5a:** Laravel Sanctum setup ✅
- **5b:** API Endpoints (sync, lookup) ✅
- **5c:** Wire Extension to API ✅
  - Settings field for API token/URL
  - Sync data on startup
  - URL status indicator
  - Badge for known URLs

### Phase 6: Event Editing ✅
- **6a:** Database changes (media_assets, event_media) ✅
- **6b:** API endpoints (tags, types, distances, update, screenshot) ✅
- **6c:** Plugin event editor UI ✅
  - Event type dropdown
  - Tags multi-select with create
  - Distances picker with presets and custom
  - Notes textarea
  - Screenshot capture and upload
  - Delete screenshot
  - Saved screenshots gallery

### Phase 7: Link Discovery Comparison ✅ (2026-01-25)
- Enhanced lookup API with child_links, url_pattern
- Scan page for links using chrome.scripting
- Compare page links vs known child links
- Checkbox selection for new links
- Bulk add to pipeline via AddDiscoveredLinksController

---

## Extension Structure

```
eventatlas-capture/
├── manifest.json           # Manifest V3, side panel config
├── background.js           # Service worker, screenshot capture, badge
├── content/
│   └── content.js          # Page extraction (HTML, text, images, metadata)
├── sidepanel/
│   ├── sidepanel.html      # Sidebar UI with all styles (~750 lines)
│   └── sidepanel.js        # Bundle management, settings, capture flow (~1600 lines)
├── SPEC.md                 # Original idea spec
├── PROGRESS.md             # This file
├── CONTEXT.md              # Agent transfer context
└── README.md               # Installation instructions
```

---

## API Endpoints (All Complete)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/extension/sync` | Bulk sync events and organizer links |
| GET | `/api/extension/lookup` | Real-time URL lookup |
| GET | `/api/extension/tags` | Get available tags |
| POST | `/api/extension/tags` | Create new tag |
| GET | `/api/extension/event-types` | Get available event types |
| GET | `/api/extension/distances` | Get predefined distances |
| PATCH | `/api/extension/events/{id}` | Update event (tags, type, distances, notes) |
| POST | `/api/extension/events/{id}/screenshot` | Upload screenshot to event |
| DELETE | `/api/extension/events/{id}/screenshot/{media}` | Delete screenshot |
| GET | `/api/extension/event-list` | Get events for curation workflow |
| POST | `/api/extension/event-list/mark-visited` | Mark event as visited |
| POST | `/api/extension/add-discovered-links` | Add links from extension discovery |

---

## Future Enhancement Ideas

These are not planned, just potential future work:

- [ ] Dual-column "workstation" mode with event list
- [ ] Curating images from content_items
- [ ] Full-page screenshot stitching (scroll capture)
- [ ] Bulk operations on multiple events
- [ ] Keyboard shortcuts
- [ ] Dark mode support
