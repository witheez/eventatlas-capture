# Chrome Extension Development Progress

> **New Agent?** Read `CONTEXT.md` first for session context and rules.
> Also read `/Users/danielforstner/Herd/eventatlas/.claude/CLAUDE.md` for project rules.

## Current Phase: 6 - Event Editing

## Status: Planning Complete, Ready for Implementation

**Detailed Plan:** See `docs/PLAN-2026-01-23-event-editing.md`

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

### Phase 6: Event Editing 🔄 (Current)
- **6a:** Database changes (media_assets, event_media) ⏳
- **6b:** API endpoints (tags, types, distances, update, screenshot) ⏳
- **6c:** Plugin event editor UI ⏳

---

## Architecture Summary

### Event-Driven (Not Organizer-Driven)
Focus on **Events**, not organizers. Key question: "Has this URL been processed into an Event?"

### URL Lookup Priority
1. `event_links.url` → Returns event
2. `content_items.source_url` → Returns content item
3. `organizer_links.url` → Returns link discovery
4. No match → "Not in EventAtlas"

### Authentication
Laravel Sanctum personal access tokens. Admin generates token in EventAtlas → pastes in extension settings.

---

## Extension Structure

```
eventatlas-capture/
├── manifest.json           # Manifest V3, side panel config
├── background.js           # Service worker, screenshot capture, badge
├── content/
│   └── content.js          # Page extraction (HTML, text, images, metadata)
├── sidepanel/
│   ├── sidepanel.html      # Sidebar UI with all styles
│   └── sidepanel.js        # Bundle management, settings, capture flow
├── docs/
│   └── PLAN-2026-01-23-event-editing.md  # Current phase plan
├── SPEC.md                 # Original idea spec
├── PROGRESS.md             # This file
├── CONTEXT.md              # Agent transfer context
└── README.md               # Installation instructions
```

---

## Key Files in EventAtlas (Laravel)

| Area | Files |
|------|-------|
| **API Controllers** | `app/Http/Controllers/Api/Extension/*` |
| **API Resources** | `app/Http/Resources/Extension/*` |
| **URL Normalizer** | `app/Services/Extension/UrlNormalizer.php` |
| **Token Management** | `app/Http/Controllers/V2/Admin/ApiTokenController.php` |
| **Tests** | `tests/Feature/Api/Extension/*` |

---

## API Endpoints

| Method | Endpoint | Status | Purpose |
|--------|----------|--------|---------|
| GET | `/api/extension/sync` | ✅ | Bulk sync events and organizer links |
| GET | `/api/extension/lookup` | ✅ | Real-time URL lookup |
| GET | `/api/extension/tags` | ⏳ | Get available tags |
| GET | `/api/extension/event-types` | ⏳ | Get available event types |
| GET | `/api/extension/distances` | ⏳ | Get predefined distances |
| PATCH | `/api/extension/events/{id}` | ⏳ | Update event (tags, type, distances) |
| POST | `/api/extension/events/{id}/screenshot` | ⏳ | Upload screenshot to event |
