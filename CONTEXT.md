# Context for Agent Transfer

> **Before you begin:**
> 1. Read `/Users/danielforstner/Herd/eventatlas/.claude/CLAUDE.md` for project rules
> 2. Read `PROGRESS.md` for phase status
> 3. Read `docs/PLAN-2026-01-23-event-editing.md` for current implementation plan

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

## Current Phase: 6 - Event Editing

**Goal:** Allow editing event attributes (tags, type, distances, screenshots) directly from the plugin.

**Plan:** `docs/PLAN-2026-01-23-event-editing.md`

### Summary of Work

**Database (EventAtlas):**
- Add `type`, `source`, `source_url` columns to `media_assets`
- Create `event_media` junction table

**API (EventAtlas):**
- `GET /api/extension/tags`
- `GET /api/extension/event-types`
- `GET /api/extension/distances`
- `PATCH /api/extension/events/{id}`
- `POST /api/extension/events/{id}/screenshot`

**Plugin:**
- Event editor panel UI
- Tags selector, distances picker
- Screenshot upload

---

## Key Architecture Decisions

### Event-Driven
Focus on Events, not organizers. The plugin asks: "Has this URL been processed into an Event?"

### URL Lookup
Searches `event_links` → `content_items` → `organizer_links` in priority order.

### Media Storage
- `media_assets` table stores files with intrinsic properties (`type`, `source`)
- `event_media` is a junction table linking events to media
- Use `PersistentFileStorage` service for file uploads

### Type vs Category
- `type` = System enum (screenshot, background, icon, event_image)
- `category` = User freeform for organization ("light backgrounds", etc.)

---

## Deployment

| Branch | Environment | URL |
|--------|-------------|-----|
| `staging` | staging | https://eventatlasco-staging.up.railway.app |
| `main` | production | https://ongoingevents-production.up.railway.app |

---

## File Locations

### EventAtlas (Laravel)
```
app/Http/Controllers/Api/Extension/   # API controllers
app/Http/Resources/Extension/         # API resources
app/Services/Extension/               # UrlNormalizer
app/Models/MediaAsset.php             # Media storage
app/Models/EventMedia.php             # Junction (to create)
app/Enums/MediaAssetType.php          # Enum (to create)
app/Enums/MediaAssetSource.php        # Enum (to create)
```

### Extension
```
background.js           # Service worker, badge
sidepanel/sidepanel.js  # Main UI logic
sidepanel/sidepanel.html # UI markup
content/content.js      # Page extraction
```
