# Chrome Extension Development Progress

## Current Phase: 5 - Wire to EventAtlas API

## Status: In Progress (Sanctum configured, API endpoints next)

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
- **5b: API Endpoints** ⏳ (next)
  - `GET /api/extension/organizers` - Fetch known organizers/URLs
  - `POST /api/extension/capture` - Send bundle to EventAtlas
- **5c: Wire Extension** ⏳
  - Settings field for API token/URL
  - Sync organizer data on startup
  - Show "Known organizer" badge when visiting known URLs
  - Send bundles to EventAtlas

---

## Architecture Decisions

### URL Recognition Challenge
Some organizers reuse URLs year-over-year (e.g., Cara Hill Marathon uses same URLs for 2024, 2025, 2026). Solution:
- When capturing from known URL, give user choice:
  - "Add to existing content item: [Name]"
  - "Create new content item"
- User decides which content item it belongs to

### Bi-directional Communication
- **Extension → EventAtlas**: Send captured bundles
- **EventAtlas → Extension**: Receive organizer URLs for recognition

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
| `app/Http/Middleware/HandleInertiaRequests.php` | Flash data sharing |

---

## Next Steps

1. **Build API endpoint for organizers** - Extension fetches list of known organizers/URLs
2. **Build API endpoint for capture** - Extension sends bundles to create content items
3. **Add settings to extension** - API URL, token, sync controls
4. **Implement recognition** - Badge/indicator when visiting known organizer
5. **Test end-to-end flow**
