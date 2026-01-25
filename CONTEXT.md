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

## Last Session: 2026-01-25

### What Was Implemented

**Link Discovery Comparison Feature** - When visiting a link discovery source page, the extension now:
1. Shows all discovered child links from our system
2. Scans the current page for links
3. Compares page links vs known links to find NEW links
4. Allows adding new links directly to the pipeline

### Files Changed

**Backend (eventatlas):**
- `LookupController.php` - Enhanced to return `child_links`, `url_pattern`, `processor_configuration_id`, `has_api_endpoint`
- `AddDiscoveredLinksController.php` - New endpoint for creating child OrganizerLinks
- `routes/api.php` - Added `POST /api/extension/add-discovered-links`
- Tests added with full coverage

**Extension (eventatlas-capture):**
- `manifest.json` - Added `scripting` permission
- `sidepanel/sidepanel.html` - Link Discovery view UI + CSS
- `sidepanel/sidepanel.js` - Scan page, compare links, add to pipeline functionality

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

### Extension
```
background.js           # Service worker, badge, screenshot capture
sidepanel/sidepanel.js  # Main UI logic (~1600 lines)
sidepanel/sidepanel.html # UI markup + styles
content/content.js      # Page extraction
```

---

## Deployment

| Branch | Environment | URL |
|--------|-------------|-----|
| `staging` | staging | https://eventatlasco-staging.up.railway.app |
| `main` | production | https://ongoingevents-production.up.railway.app |

Auto-deploys on push.
