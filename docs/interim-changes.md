# Interim Changes During Refactor

Changes made to `main` while the cloud agent works on `feature/wxt-phases-2-7`.

**After merging the refactor branch, review this file and ensure these fixes are preserved in the TypeScript versions.**

---

## Change 1: Normalize API URLs Consistently

**Commit:** `40a7f66`
**Date:** 2026-01-25
**Issue:** Event List refresh button showed "Failed to refresh data"

**Root Cause:**
Multiple files used `settings.apiUrl` directly in fetch/XHR calls without normalizing the URL. The `normalizeBaseUrl()` function in `api.js` adds the protocol (http/https) but wasn't exported or used consistently.

**Files Changed:**
| File | Change |
|------|--------|
| `entrypoints/sidepanel/api.js` | Export `normalizeBaseUrl` function |
| `entrypoints/sidepanel/event-list.js` | Import and wrap 2 fetch URLs |
| `entrypoints/sidepanel/main.js` | Import and wrap 2 fetch URLs |
| `entrypoints/sidepanel/event-editor.js` | Import and wrap 4 fetch URLs |
| `entrypoints/sidepanel/upload-queue.js` | Import and wrap 1 XHR URL |
| `entrypoints/sidepanel/url-status.js` | Import and wrap 1 fetch URL |

**Verification After Merge:**
1. Check that `normalizeBaseUrl` is exported from the API module (likely `api.ts`)
2. Ensure all API calls use `normalizeBaseUrl(settings.apiUrl)` not raw `settings.apiUrl`
3. Test Event List refresh button works

---

## Change 2: Call Event Editor Functions Through Module Reference

**Commit:** `2d90fc4`
**Date:** 2026-01-25
**Issue:** Refresh button showed "ReferenceError: loadEditorOptions is not defined"

**Root Cause:**
The `refreshPageData` function in `main.js` was calling event editor functions directly (`loadEditorOptions()`, `renderTagsChips()`, etc.) instead of through the `eventEditorModule` object returned by the factory pattern.

**Files Changed:**
| File | Change |
|------|--------|
| `entrypoints/sidepanel/main.js` | Call functions through `eventEditorModule` object |

**Verification After Merge:**
1. Check that event editor functions are called through the module reference, not directly
2. Test refresh button on Current tab when viewing a known event

---

## Change 3: (Template for next change)

**Commit:** `xxx`
**Date:** YYYY-MM-DD
**Issue:** Description

**Root Cause:**
Explanation

**Files Changed:**
| File | Change |
|------|--------|

**Verification After Merge:**
1. Step 1
2. Step 2

---

## Post-Merge Checklist

After merging `feature/wxt-phases-2-7` to `main`:

- [ ] Review each change above
- [ ] Verify the fix logic exists in TypeScript files
- [ ] Run full test suite
- [ ] Manual test: Event List refresh
- [ ] Manual test: (add more as changes are added)
- [ ] Delete this file once verified
