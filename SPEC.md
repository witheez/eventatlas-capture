# Chrome Extension: Content Capture & Discovery

> **Status:** Implemented ✅
> **Captured:** 2026-01-21
> **Completed:** 2026-01-25

---

## Problem (Solved)

Two admin workflows were clunky:

1. **Scraping fallback:** When automated scraping fails for a page, admins must manually copy/paste content into EventAtlas
2. **Event discovery:** When admins find interesting events while browsing, they must switch to EventAtlas and paste URLs manually

Both workflows broke focus and involved tedious context-switching.

## Solution (Implemented)

A Chrome extension that enables one-click content capture from any webpage, with a preview sidebar for reviewing and bundling content before sending to EventAtlas.

**Core concept:** Turn admins into "human scrapers" - when they can see it, they can capture it.

---

## Implemented Features

### Content Capture
- Full page HTML/text capture
- Viewport screenshot capture
- Multi-page bundling with drag & drop
- Session persistence

### URL Status Integration
- Real-time lookup against EventAtlas
- Shows if page is: Known Event, Content Item, Link Discovery, or New
- Badge indicator on extension icon

### Event Editing
- Edit tags, event type, distances, notes directly from extension
- Capture and upload screenshots to events
- Manage saved screenshots (view, delete)

### Link Discovery
- Scan page for links matching URL patterns
- Compare against known child links
- Add new links to pipeline in bulk

---

## Technical Implementation

### Chrome Extension Components
- **Side Panel** - Main UI, stays open while browsing
- **Content Script** - Page data extraction
- **Background Script** - API communication, screenshot capture, badge

### Authentication
Laravel Sanctum personal access tokens. Admin generates token in EventAtlas → pastes in extension settings.

### API Endpoints
See `PROGRESS.md` for complete endpoint list.

---

## Original User Stories (All Achieved)

- ✅ As an admin browsing the web, I want to capture an event I discover with one click
- ✅ As an admin dealing with a page that won't scrape, I want to manually capture its content
- ✅ As an admin, I want to capture multiple related pages and bundle them
- ✅ As an admin, I want to edit event details without switching to the admin panel
- ✅ As an admin, I want to add screenshots to events while viewing them
- ✅ As an admin on a link discovery page, I want to see which links are new and add them

---

## Out of Scope

- Public distribution / Chrome Web Store
- Firefox/Safari support
- Automated capture scheduling
- AI-powered field extraction in extension
