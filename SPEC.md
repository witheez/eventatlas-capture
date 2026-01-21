# Chrome Extension: Content Capture & Discovery

> **Status:** Draft
> **Captured:** 2026-01-21
> **Last Updated:** 2026-01-21

---

⚠️ **STALENESS WARNING:** Ideas can become outdated as the codebase evolves. Before implementing, verify assumptions against current architecture.

---

## Problem

Two admin workflows are clunky today:

1. **Scraping fallback:** When automated scraping fails for a page, admins must manually copy/paste content into EventAtlas via the "Paste Content Manually" modal
2. **Event discovery:** When admins find interesting events while browsing, they must switch to EventAtlas, navigate to the pipeline, and paste URLs manually

Both workflows break focus and involve tedious context-switching.

## Solution

A Chrome extension that enables one-click content capture from any webpage, with a preview sidebar for reviewing and bundling content before sending to EventAtlas.

**Core concept:** Turn admins into "human scrapers" - when they can see it, they can capture it.

## User Stories

- As an admin browsing the web, I want to capture an event I discover with one click, so I don't lose it or break my flow
- As an admin dealing with a page that won't scrape, I want to manually capture its content in a structured way, so the data still gets into the system
- As an admin, I want to capture multiple related pages (e.g., event details + ticket page + venue info) and bundle them as one content item, so the AI has complete context

## Key Features

### Capture Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| **Full page** | Entire HTML/text content | When everything might be relevant |
| **Selected text** | User highlights what matters | When page has lots of noise |
| **Structured extraction** | Auto-extract title, dates, descriptions, images | Quick capture of well-structured pages |

### Full-Page Screenshots

- Capture screenshots including content below the fold
- Scroll-and-stitch to get the complete visual
- Useful for pages with visual layouts the scraper can't parse

### Preview Sidebar

- Shows captured data before sending
- Allows editing/curating what gets sent
- Displays current bundle: "3 pages from eventbrite.com"
- Reorder/remove pages from bundle
- Choose capture mode per page

### Session-Based Bundling

1. Admin clicks "Start Capture Session" (or first capture starts it)
2. Browse multiple pages, clicking "Add to Bundle" on each
3. Preview sidebar shows accumulated pages
4. "Send Bundle" when ready
5. All pages sent as single content item (like multi-page paste in current UI)

### Smart Routing

| Scenario | Behavior |
|----------|----------|
| Domain matches existing organizer | Suggest updating that content item |
| New domain/organizer | Queue for review OR create new content item |
| User chooses | Manual override always available |

### Organizer-Aware Hints

- Extension recognizes domains from existing organizers
- Shows hint: "This looks like content from [Organizer Name]"
- Suggests linking to existing content items

## Integration with EventAtlas

### Option A: Direct API + Queue (Preferred)

1. Extension sends capture to EventAtlas API endpoint
2. If organizer match found → option to update existing content item
3. If no match → added to "Pending Imports" queue
4. Admins review queue in EventAtlas, decide what to create/merge/discard

### Option B: Deep Link (Simpler Alternative)

1. Extension formats captured data
2. Opens EventAtlas with data pre-filled in "Paste Content Manually" modal
3. Admin reviews and submits normally

**Recommendation:** Start with Option A for better UX, queue provides safety net.

## Authentication

For internal admin-only use:

1. **Session piggyback** (simplest) - If admin logged into EventAtlas, extension uses that session
2. **API key** (fallback) - Personal API key in extension settings

No public distribution, no OAuth complexity needed.

## Technical Considerations

### Chrome Extension Components

- **Popup** - Quick capture button, session status
- **Sidebar** - Preview and bundle management
- **Content script** - Page data extraction, screenshot capture
- **Background script** - API communication, session management

### API Endpoint Needed

```
POST /api/v2/content-capture
{
  "pages": [
    {
      "url": "https://...",
      "title": "...",
      "content": "...", // HTML or text depending on mode
      "screenshot": "base64...",
      "captured_at": "2026-01-21T10:30:00Z"
    }
  ],
  "organizer_id": null, // or matched organizer
  "mode": "queue" | "create" | "update"
}
```

### Screenshot Capture

- Use Chrome's `captureVisibleTab` API
- For full-page: scroll, capture, stitch together
- Consider file size limits - may need compression or chunked upload

## Scope & Complexity

**Difficulty:** Medium

- Chrome extension basics are straightforward
- Full-page screenshot stitching adds complexity
- Preview sidebar UI needs polish
- API endpoint and queue system needed on backend

**Estimated components:**
- Chrome extension (~500-800 lines)
- Backend API endpoint + queue table
- "Pending Imports" admin page in EventAtlas

## Out of Scope (For Now)

- Public distribution / Chrome Web Store
- Firefox/Safari support
- Automated capture scheduling
- AI-powered field extraction in extension (let backend handle)

## Open Questions

- [ ] Should the queue have expiration? (Auto-discard after X days)
- [ ] How to handle duplicate captures of same URL?
- [ ] Preview sidebar: slide-out panel vs. separate tab?

## Related

- Current "Paste Content Manually" modal: `resources/js/Pages/Admin/V2/Content/Show.tsx`
- Pipeline page: `resources/js/Pages/Admin/V2/Pipeline/Index.tsx`
- Content model: `app/Models/Content.php`
