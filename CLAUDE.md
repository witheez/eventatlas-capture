# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EventAtlas Capture is a Chrome extension built with **WXT framework** that provides a side panel interface for capturing and managing web content for the EventAtlas platform. It communicates with a Laravel backend via REST API.

## Commands

```bash
# Development (hot reload)
npm run dev              # Chrome
npm run dev:firefox      # Firefox

# Build for production
npm run build            # Chrome
npm run build:firefox    # Firefox

# Testing
npm run test             # Run all tests once
npm run test:watch       # Watch mode
npm run test -- -t "test name"  # Run single test by name

# Linting & Formatting
npm run lint             # ESLint check
npm run lint:fix         # Auto-fix lint issues
npm run format           # Prettier format
```

## Architecture

### Extension Entry Points (WXT pattern)

- **`entrypoints/background.ts`** - Service worker that handles:
  - Side panel opening on extension icon click
  - Screenshot capture via `chrome.tabs.captureVisibleTab`
  - Badge updates for matched URLs (green checkmark = known event)

- **`entrypoints/content.ts`** - Content script injected into web pages for:
  - HTML/text extraction
  - Image URL collection
  - Metadata extraction (Open Graph, Twitter Cards)

- **`entrypoints/sidepanel/`** - Main UI running in Chrome side panel

### Side Panel Module Architecture

The side panel uses a **factory pattern with dependency injection** for testability:

```
main.ts              → Orchestrates modules, handles UI events, tab switching
├── store.ts         → Centralized state (getters/setters, no local module state)
├── api.ts           → All backend API calls via centralized apiRequest()
├── storage.ts       → Chrome storage operations (settings, bundles)
├── event-editor.ts  → Event editing UI (tags, distances, screenshots)
├── upload-queue.ts  → Background upload queue with retry logic
├── url-status.ts    → URL matching and status display
├── capture.ts       → Page capture coordination
├── quick-add.ts     → Quick add to pipeline UI (includes Run Scraper for API parents)
├── site-analyzer.ts → Site analysis orchestration and rendering
└── site-analyzer-types.ts → Shared types for site analysis
```

### Site Analysis Content Scripts

- **`entrypoints/site-analyzer-main.content.ts`** - MAIN world script (always-on, `document_start`):
  - Hooks `window.fetch` and `XMLHttpRequest` to intercept network requests
  - Captures rate limit response headers
  - Checks window properties for framework/anti-bot signatures
  - Communicates with ISOLATED world collector via `window.postMessage`

- **`entrypoints/site-analyzer-collector.content.ts`** - ISOLATED world script (on-demand, `registration: 'runtime'`):
  - Injected via `chrome.scripting.executeScript()` when analysis is triggered
  - Detects anti-bot signatures (cookies, DOM, inline scripts)
  - Detects technologies (frameworks, CMS, ecommerce)
  - Analyzes data delivery method (server-rendered, SPA, hybrid)
  - Detects pagination patterns, authentication indicators, cookies
  - Uses promise-based communication with MAIN world (unique request IDs, 3s timeout)

### Key Patterns

1. **Centralized API calls**: All API requests go through `apiRequest()` in `api.ts` which handles:
   - URL normalization via `normalizeBaseUrl()`
   - Authentication headers
   - Timeout handling
   - Error formatting

2. **Flexible URL matching**: Uses `urlsMatchFlexible()` to handle subdomain variations (e.g., `kh.example.com` matches `example.com`)

3. **Local-first with sync**: Extension matches URLs against local cache first, then fetches fresh data by event ID from backend

4. **State management**: All state lives in `store.ts` - modules import getters/setters rather than maintaining local state

5. **Three-tab UI**: Side panel has Current, Event List, and Site Analysis tabs. Tab switching managed by `switchMainTab()` in `main.ts`. Active tab stored in `store.ts` as `'current' | 'event-list' | 'site-analysis'`.

6. **Site analysis**: On-demand website analysis for scraping insights. The MAIN world script is always-on to capture network requests from page load. The collector is injected on-demand. Analysis auto-triggers when switching to the Site Analysis tab. All sections always render (empty state if no data). Settings include `autoAnalyzeSites` for automatic analysis on every page.

7. **XSS prevention in site analysis**: All page-sourced data rendered via `innerHTML` must be escaped with the regex-based `escapeHtml()` in `site-analyzer.ts`. This includes detection names, evidence, URLs, and attribute values.

### Backend Integration

The extension communicates with a Laravel backend. All endpoints require Sanctum authentication.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/extension/sync` | Bulk sync events and organizer links |
| GET | `/api/extension/lookup?url=` | Real-time URL lookup |
| GET | `/api/extension/events/{id}` | Fetch single event by ID |
| PATCH | `/api/extension/events/{id}` | Update event (tags, type, distances, notes) |
| POST | `/api/extension/events/{id}/screenshot` | Upload screenshot |
| DELETE | `/api/extension/events/{id}/screenshot/{media}` | Delete screenshot |
| GET | `/api/extension/event-list` | Get events for curation workflow |
| POST | `/api/extension/event-list/mark-visited` | Mark event as visited |
| GET | `/api/extension/tags` | Get available tags |
| POST | `/api/extension/tags` | Create new tag |
| GET | `/api/extension/event-types` | Get available event types |
| GET | `/api/extension/distances` | Get predefined distances |
| POST | `/api/extension/add-discovered-links` | Add links from extension discovery |
| GET | `/api/extension/check-parent` | Check if URL belongs to a parent scraper |
| GET | `/api/extension/processor-configs` | Get processor configurations |
| POST | `/api/extension/quick-import` | Quick import a page to pipeline |
| POST | `/api/extension/trigger-scrape` | Trigger scraping pipeline for a parent organizer link |

## Tech Stack

- **WXT** - Modern web extension framework
- **Preact** + **@preact/signals** - UI components (aliased as React)
- **Vitest** - Testing framework
- **TypeScript** - Strict mode enabled

## Testing

Tests are co-located with source files (`*.test.ts`). The test environment uses jsdom and mocks Chrome APIs via `@webext-core/fake-browser`.

```bash
# Run specific test file
npm run test -- entrypoints/sidepanel/api.test.ts

# Run tests matching pattern
npm run test -- -t "lookupUrl"
```

## Backend Deployment (EventAtlas Laravel)

The backend lives at `/Users/danielforstner/Herd/eventatlas`. Deployment uses Railway with auto-deploy from git branches:

| Branch | Environment | URL |
|--------|-------------|-----|
| `staging` | Staging | https://eventatlasco-staging.up.railway.app |
| `main` | Production | https://ongoingevents-production.up.railway.app |

**Deployment workflow:**
```bash
cd /Users/danielforstner/Herd/eventatlas

# Staging only - just push to staging branch
git push origin staging

# Production - push to main (Railway auto-deploys)
git push origin main
```

**Note:** Staging sleeps after 10min inactivity - first request has cold boot delay.

## Sub-Agent Usage (CRITICAL)

When implementing features, **always use async sub-agents** to conserve context window:

1. **Always run agents in background**: Use `run_in_background: true` for all Task tool calls
2. **Never read agent output files**: Don't use TaskOutput or read the output file
3. **Verify via git diff only**: After agent completes, use `git status` and `git diff` to verify changes
4. **Keep prompts self-contained**: Include all necessary context in the agent prompt since you won't see intermediate output

```typescript
// CORRECT - Background agent, verify via diff
Task(subagent_type: "backend-developer", prompt: "...", run_in_background: true)
// Wait for completion notification
git diff --stat  // Verify changes

// WRONG - Never do this
TaskOutput(task_id: "...")  // Wastes context on full transcript
```

This pattern prevents context bloat from agent transcripts being pulled into the main conversation.
