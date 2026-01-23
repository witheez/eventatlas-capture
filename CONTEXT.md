# Context Summary for Agent Transfer

**Before you begin, please read `/Users/danielforstner/Herd/eventatlas/.claude/CLAUDE.md` to understand the project architecture, development rules, and technical guidelines that override default behavior.**

---

## Current Work Session Overview

- **Task:** Building Chrome extension API integration (Phase 5) for EventAtlas
- **Phase:** Phase 5c COMPLETE, ready for Phase 5d (capture endpoint)
- **Original Goal:** Wire the Chrome extension to communicate with EventAtlas Laravel backend
- **Priority:** HIGH

**Two repositories involved:**
1. **eventatlas** (Laravel backend) - `/Users/danielforstner/Herd/eventatlas` - branch `staging`
2. **eventatlas-capture** (Chrome extension) - `/Users/danielforstner/Herd/eventatlas-capture` - branch `main`

---

## Session-Specific Rules and Constraints

### CRITICAL - Use Background Agents
- **ALWAYS dispatch agents with `run_in_background: true`** for implementation work
- **NEVER call TaskOutput** for successful agents - verify via `git status`/`git diff` instead
- Main agent should plan/coordinate, subagents should implement

### Git Rules
- **Never push without explicit user approval**
- Show user what will be committed before committing
- EventAtlas: work on `staging` branch
- Extension: work on `main` branch

### Architecture
- **Event-driven, NOT organizer-driven** - focus on "Has this URL been processed into an Event?"
- Use Inertia patterns, not separate API calls for frontend
- No silent fallbacks - fail loudly when data is broken

---

## Recent Changes and Modifications

### EventAtlas (Laravel) - COMMITTED
**Commit:** `e9f4c74c feat: add extension API endpoints (sync, lookup) with URL normalization`

Files created:
- `app/Http/Controllers/Api/Extension/SyncController.php`
- `app/Http/Controllers/Api/Extension/LookupController.php`
- `app/Http/Resources/Extension/SyncEventResource.php`
- `app/Http/Resources/Extension/SyncOrganizerLinkResource.php`
- `app/Services/Extension/UrlNormalizer.php`
- Tests for all above (77 tests total)

### Extension (Chrome) - COMMITTED
**Commit:** `36583ab feat: wire extension to EventAtlas API (Phase 5c)`

Files modified:
- `background.js` (+118 lines) - Badge indicator for known URLs
- `sidepanel/sidepanel.html` (+217 lines) - Settings UI, URL status display
- `sidepanel/sidepanel.js` (+331 lines) - Sync module, lookup functions, save button
- `PROGRESS.md` - Updated phase status

---

## Technical Context

### API Endpoints (Laravel)
```
GET /api/extension/sync - Bulk sync events and organizer links
GET /api/extension/lookup?url=... - Real-time URL lookup
POST /api/extension/capture - (NOT YET BUILT) Send bundles to EventAtlas
```

### Data Flow
- Events have `source_url_normalized` field
- OrganizerLinks have `url_normalized` field
- URL normalization strips protocol, www, query params, fragments, trailing slashes

### Extension Architecture
- `background.js` - Service worker, badge updates on tab changes
- `sidepanel/sidepanel.js` - Main UI, sync module, settings
- Storage keys: `eventatlas_capture_data` (bundles), `eventatlas_sync_data` (API sync)

### Badge Indicator
- ✓ Green = Known event
- ⊕ Blue = Link discovery page
- (empty) = Not in EventAtlas

---

## Progress and Next Steps

### Completed
- Phase 5a: Laravel Sanctum setup
- Phase 5b: API endpoints (sync, lookup)
- Phase 5c: Wire extension to API
  - Settings UI (URL, token with show/hide, sync mode)
  - Save Settings button
  - Bulk sync on startup
  - Badge indicator
  - URL status display
  - Test Connection button

---

## Phase 5d: Capture Endpoint Data Structures

### What Extension Captures (per page)
```javascript
{
  url: "https://example.com/event",
  title: "Event Title",
  html: "<html>...</html>",           // Full page HTML
  text: "Visible text content...",    // innerText
  images: ["https://...jpg", ...],    // All image URLs found
  metadata: {
    og_title: "...",
    og_image: "...",
    twitter_card: "...",
    description: "...",
    // etc.
  },
  capturedAt: "2024-01-22T10:30:00Z",
  screenshot: "data:image/png;base64,...",  // Optional, base64

  // User edits in sidepanel:
  editedTitle: "Custom Title",        // If user changed it
  editedUrl: "https://...",           // If user changed it
  selectedImages: ["url1", "url2"],   // User-selected subset
  includeHtml: true,                  // User toggle
  includeImages: true,                // User toggle
  includeScreenshot: true,            // User toggle
}
```

### Bundle Structure
```javascript
{
  id: "uuid-here",
  name: "Bundle Name",
  pages: [ /* array of captures above */ ],
  createdAt: "2024-01-22T10:00:00Z",
  expanded: true  // UI state
}
```

### Mapping to Laravel ContentItem
The capture endpoint should create `ContentItem` records. Key fields to map:
- `url` → `source_url`
- `editedTitle` or `title` → `title`
- `html` → `raw_html` (if includeHtml)
- `text` → `extracted_text`
- `screenshot` → store as file, link to content item
- `metadata` → `meta_data` JSON field
- `capturedAt` → `scraped_at`

### Questions to Clarify for Phase 5d
1. Should captures create ContentItems directly, or go through a processing queue?
2. How to handle the parent OrganizerLink relationship (if any)?
3. Screenshot storage: use PersistentFileStorage service?
4. Should we deduplicate by URL before creating?

---

### Next Steps (HIGH priority)
1. **Phase 5d:** `POST /api/extension/capture` - Send bundles to EventAtlas
   - Create content items from captured page data
   - Handle screenshots, metadata, HTML
2. Push commits to remotes when user approves

### Git Status
- **eventatlas:** 5 commits ahead of `origin/staging`
- **eventatlas-capture:** 2 commits ahead of `origin/main`

---

## Critical Do's and Don'ts for Next Agent

### DO
- Use `run_in_background: true` for all Task tool calls
- Verify agent work via `git status`/`git diff`, not TaskOutput
- Work on `staging` branch for Laravel, `main` for extension
- Ask before pushing or making major architectural decisions

### DON'T
- Don't call TaskOutput for successful agents
- Don't implement code directly - dispatch agents
- Don't push without explicit user approval
- Don't investigate the `eventatlas.co` DNS issue further (use Railway URL instead)
- Don't add silent fallbacks - fail loudly

---

## Code Patterns and Conventions

### Laravel
- Use `php artisan make:*` commands
- FormRequest for validation
- Eloquent Resources for API responses
- Pest for testing

### Extension (JavaScript)
- Vanilla JS (no framework)
- `chrome.storage.local` for persistence
- Event listeners for UI
- Async/await for Chrome APIs

### API Response Format
```json
{
  "events": [{ "id", "title", "source_url_normalized", ... }],
  "organizer_links": [{ "id", "url_normalized", "page_type", ... }]
}
```

---

## Key File Paths

```
# Laravel (eventatlas)
/Users/danielforstner/Herd/eventatlas/
├── app/Http/Controllers/Api/Extension/  # API controllers
├── app/Http/Resources/Extension/        # API resources
├── app/Services/Extension/              # UrlNormalizer
├── routes/api.php                       # API routes
└── tests/Feature/Api/Extension/         # API tests

# Chrome Extension (eventatlas-capture)
/Users/danielforstner/Herd/eventatlas-capture/
├── background.js          # Service worker, badge logic
├── sidepanel/
│   ├── sidepanel.html     # UI markup + styles
│   └── sidepanel.js       # Main logic, sync, settings
├── content/content.js     # Page content extraction
└── PROGRESS.md            # Development progress tracking
```

---

## Deployment Info

| Branch | Environment | URL |
|--------|-------------|-----|
| `staging` | staging | https://eventatlasco-staging.up.railway.app |
| `main` | production | https://ongoingevents-production.up.railway.app |

**Note:** Use Railway URLs for API, not `eventatlas.co` (custom domain has issues)
