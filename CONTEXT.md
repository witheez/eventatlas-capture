# Context for Agent Transfer

> **Before you begin:**
> 1. Read `/Users/danielforstner/Herd/eventatlas/.claude/CLAUDE.md` for project rules
> 2. Read `PROGRESS.md` for phase status

---

## Repositories

| Repo | Path | Branch |
|------|------|--------|
| **eventatlas** (Laravel) | `/Users/danielforstner/Herd/eventatlas` | `staging` |
| **eventatlas-capture** (Extension) | `/Users/danielforstner/Herd/eventatlas-capture` | `main` |

---

## Critical Rules

### Background Agents
- **ALWAYS** use `run_in_background: true` for Task tool
- **NEVER** call TaskOutput for successful agents
- Verify via `git status` / `git diff` instead

### Git
- **Never push without explicit user approval**
- Show changes before committing
- Ask before major architectural decisions

### Code
- **No silent fallbacks** - fail loudly when data is broken
- Use Inertia patterns for Laravel frontend
- Vanilla JS for extension (no framework)

---

## Last Session: 2026-01-26

### What Was Implemented

**Event List Improvements:**
1. Added sequential numbering (1, 2, 3...) to event list items
2. Highlight current event with green background and left border
3. Fixed navigation buttons going to first event instead of next/previous
4. Fixed event list not refreshing when clicking refresh button
5. Added global "Synced X ago" indicator in header

**Badge Improvements:**
- Replaced "Known Event" badge with "Synced" (green) or "Cached" (yellow)
- Shows whether data came from API fetch or local cache

**URL Matching Bug Fix:**
- Fixed ShowEventController returning wrong field names (`event_type` instead of `event_type_id`, `distances` instead of `distances_km`)
- This caused cached events to show empty fields despite API returning data
- Added flexible subdomain matching utilities

**Tag Creation Bug Fix:**
- Fixed HTTP 500 error on tag creation caused by double-submit (keydown + blur events firing simultaneously)
- Added error handling in backend to return 422 instead of 500 on duplicate

### Files Changed

**Backend (eventatlas):**
- `ShowEventController.php` - Fixed field names to match LookupController (event_type_id, distances_km, tags as objects, media)
- `TagsController.php` - Added try/catch error handling for database errors

**Extension (eventatlas-capture):**
- `main.ts` - Event list numbering, highlighting, navigation fix, refresh fix, sync time display
- `sidepanel.css` - Styles for highlighting, sync time, Synced/Cached badges
- `event-editor.ts` - Fixed double-submit bug in tag creation
- `api.ts` - Added `source` field to EventMatch interface
- `utils.ts`, `url.ts` - Added flexible subdomain matching utilities

---

## Current State

The extension is feature-complete for the core workflows:

1. **Content Capture** - Capture pages for manual content import
2. **URL Status** - See if current page is a known event, content item, or discovery source
3. **Event Editing** - Edit tags, distances, event type, notes, screenshots for known events
4. **Link Discovery** - Scan pages for new links and add to pipeline

---

## Architecture Summary

### URL Lookup Priority
1. `event_links.url` → Returns event (shows Event Editor)
2. `content_items.source_url` → Returns content item status
3. `organizer_links.url` → Returns link discovery (shows Link Discovery view)
4. No match → "New Page" status

### Authentication
Laravel Sanctum personal access tokens. Admin generates token in EventAtlas → pastes in extension settings.

---

## File Locations

### EventAtlas (Laravel)
```
app/Http/Controllers/Api/Extension/   # API controllers
  - LookupController.php              # URL status lookup
  - AddDiscoveredLinksController.php  # Add links from extension
  - TagsController.php                # Tags CRUD
  - EventTypesController.php          # Event types list
  - DistancesController.php           # Predefined distances
  - UpdateEventController.php         # Event editing
  - ScreenshotController.php          # Screenshot upload/delete
  - EventListController.php           # Event list for curation
  - SyncController.php                # Bulk sync
```

### Extension (TypeScript + WXT Framework)
```
entrypoints/
├── background.ts           # Service worker, badge, screenshot capture
├── content.ts              # Page extraction
└── sidepanel/
    ├── index.html          # UI markup
    ├── main.ts             # Main UI orchestration
    ├── api.ts              # API client
    ├── store.ts            # Centralized state
    ├── event-editor.ts     # Event editing
    ├── event-list.ts       # Event list functionality
    ├── url-status.ts       # URL status display
    └── sidepanel.css       # Styles
utils/url.ts                # URL normalization/matching
```

---

## Deployment

| Branch | Environment | URL |
|--------|-------------|-----|
| `staging` | staging | https://eventatlasco-staging.up.railway.app |
| `main` | production | https://ongoingevents-production.up.railway.app |

Auto-deploys on push.
