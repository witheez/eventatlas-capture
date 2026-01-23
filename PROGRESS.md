# Chrome Extension Development Progress

> **New Agent?** Read `CONTEXT.md` first for full session context, technical decisions, and do's/don'ts.
> Also read `/Users/danielforstner/Herd/eventatlas/.claude/CLAUDE.md` for project rules.

## Current Phase: 5d - Capture Endpoint

## Status: In Progress (5a-5c complete, building capture endpoint next)

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
- Adaptive buttons based on setting:
  - ON: Single "Capture Page" button
  - OFF: Two buttons "Capture Page" + "+ Screenshot"
- "Add Screenshot" button in detail view
- Screenshot preview with modal

### Phase 5: Wire to EventAtlas API 🔄
- **5a: Laravel Sanctum** ✅
  - Package installed and configured
  - Token management UI at `/admin/v2/api-tokens`
  - Sidebar menu item added
- **5b: API Endpoints** ✅
  - `GET /api/extension/sync` ✅ - Bulk sync events and organizer links
  - `GET /api/extension/lookup?url=...` ✅ - Real-time URL lookup
  - `POST /api/extension/capture` ⏳ - Send bundle to EventAtlas (next)
- **5c: Wire Extension** ✅
  - Settings field for API token/URL ✅
  - Sync data on startup (stores in chrome.storage.local) ✅
  - Show event badge when visiting known URLs ✅
  - Real-time lookup for verification ✅
  - URL status indicator in sidepanel ✅
  - Send bundles to EventAtlas ⏳ (deferred to 5d)

---

## Architecture Decisions

### Event-Driven (Not Organizer-Driven)
The extension focuses on **Events**, not organizers. Key question: "Has this URL been processed into an Event?"

### Two Types of Pages
1. **Content Pages** (`/events/spring-marathon-2025`) - Actual event pages with content
2. **Link Discovery Pages** (`/events`) - Index pages that discover event URLs

Differentiated by `ProcessorConfiguration.processor_type`:
- `content_discovery` = Content page
- `link_discovery` = Link discovery page

### Hybrid Sync Strategy
Extension supports three modes (user configurable):
1. **Bulk sync only** - Fast local matching, may be stale
2. **Real-time lookup only** - Always fresh, requires network
3. **Both** (recommended) - Local match → instant UI → real-time verification

### URL Normalization
URLs are normalized for comparison:
```
Input:  https://www.example.com/events/spring?ref=fb#section
Output: example.com/events/spring

Rules: Strip protocol, www, query params, fragment, trailing slash
```

### Authentication
- Laravel Sanctum personal access tokens
- Admin generates token in EventAtlas → pastes in extension settings
- Token sent as `Authorization: Bearer {token}` header

---

## Extension Structure

```
eventatlas-capture/
├── manifest.json           # Manifest V3, side panel config
├── background.js           # Service worker, screenshot capture
├── content/
│   └── content.js          # Page extraction (HTML, text, images, metadata)
├── sidepanel/
│   ├── sidepanel.html      # Sidebar UI with all styles
│   └── sidepanel.js        # Bundle management, settings, capture flow
├── SPEC.md                 # Original idea spec
├── PROGRESS.md             # This file
└── README.md               # Installation instructions
```

---

## Key Files in EventAtlas (Laravel)

| File | Purpose |
|------|---------|
| `config/sanctum.php` | Sanctum configuration |
| `app/Http/Controllers/V2/Admin/ApiTokenController.php` | Token CRUD |
| `resources/js/Pages/V2/ApiTokens/Index.tsx` | Token management UI |
| `app/Http/Controllers/Api/Extension/SyncController.php` | Bulk sync endpoint |
| `app/Http/Controllers/Api/Extension/LookupController.php` | Real-time lookup endpoint |
| `app/Http/Resources/Extension/SyncEventResource.php` | Event resource for sync |
| `app/Http/Resources/Extension/SyncOrganizerLinkResource.php` | OrganizerLink resource for sync |
| `app/Services/Extension/UrlNormalizer.php` | URL normalization utility |
| `tests/Feature/Api/Extension/SyncControllerTest.php` | Tests for sync endpoint (19 tests) |
| `tests/Feature/Api/Extension/LookupControllerTest.php` | Tests for lookup endpoint (24 tests) |
| `tests/Unit/Services/Extension/UrlNormalizerTest.php` | Tests for URL normalizer (34 tests) |

---

## Next Steps

1. ~~**Build sync endpoint**~~ ✅ - Bulk data for local storage
2. ~~**Build lookup endpoint**~~ ✅ - Real-time URL verification
3. **Build capture endpoint** - Extension sends bundles to create content items
4. **Wire extension to API** - Settings, sync, recognition
5. **Test end-to-end flow**

---

## API Endpoint Documentation

### GET /api/extension/sync

**Purpose:** Bulk sync all events and organizer links for local storage in the extension.

**Authentication:** Bearer token (Sanctum), requires admin role

**Response:**
```json
{
  "events": [
    {
      "id": 123,
      "title": "Spring Marathon 2025",
      "start_date": "2025-04-15",
      "end_date": "2025-04-15",
      "location": "Downtown Park, City",
      "source_url": "https://example.com/spring-marathon",
      "source_url_normalized": "example.com/spring-marathon",
      "last_scraped_at": "2025-01-10T14:30:00Z",
      "source_type": "website",
      "organizer_name": "Running Corp"
    }
  ],
  "organizer_links": [
    {
      "id": 456,
      "url": "https://example.com/events",
      "url_normalized": "example.com/events",
      "organizer_name": "Running Corp",
      "page_type": "link_discovery",
      "is_active": true,
      "last_scraped_at": "2025-01-15T10:00:00Z"
    }
  ],
  "synced_at": "2026-01-22T08:00:00Z"
}
```

---

### GET /api/extension/lookup

**Purpose:** Real-time lookup of a specific URL to get fresh data.

**Authentication:** Bearer token (Sanctum), requires admin role

**Query Parameters:**
- `url` (required) - The URL to look up

**Response:**
```json
{
  "url_input": "https://www.example.com/spring-marathon?ref=fb",
  "url_normalized": "example.com/spring-marathon",
  "match_type": "event",
  "event": {
    "id": 123,
    "title": "Spring Marathon 2025",
    "start_date": "2025-04-15",
    "end_date": "2025-04-15",
    "location": "Downtown Park, City",
    "source_url": "https://example.com/spring-marathon",
    "last_scraped_at": "2025-01-10T14:30:00Z",
    "source_type": "website",
    "organizer_name": "Running Corp",
    "content_item_id": 789
  }
}
```

**Match Types:**
| Type | Description |
|------|-------------|
| `event` | URL matches an Event's source_url - shows event details |
| `content_item` | URL matches a ContentItem but no Event yet - scraped but not processed |
| `link_discovery` | URL matches an OrganizerLink with page_type="link_discovery" |
| `no_match` | URL not found in system |

**Lookup Priority:** event → content_item → link_discovery → no_match
