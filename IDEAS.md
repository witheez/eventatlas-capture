# Ideas & Improvement Suggestions

Running list of ideas for the EventAtlas Capture extension. Remove items once implemented.

---

## Auto-Refresh After Save (Single Item)

**Problem:** After saving changes to an event (tags, distances, etc.), the Event List doesn't update to reflect that the item may no longer match the current filter (e.g., "missing tags").

**Proposed Solution:**
- Create new endpoint: `GET /api/extension/event-list/{id}/status`
- Returns whether the event still matches the current filter criteria
- After saving in the extension, call this endpoint for the saved event
- If it no longer matches, remove it from the local list
- Avoids fetching the entire list which will be slow with thousands of records

**Backend Changes Required:**
- New endpoint in EventAtlas API

**Extension Changes Required:**
- Call status endpoint after successful save in event-editor.js
- Remove item from local event list cache if no longer matches

---

## Mark URL as Broken / URL Status

**Problem:** Some URLs in the Event List are broken (redirects, site down, etc.) but stay in the list forever because they're missing tags/distances that can never be added.

**Proposed Solution:**
- Use existing URL/event link status field if available (check schema)
- Add a "broken" or "deprecated" status option
- Filter out broken URLs server-side in the event-list endpoint
- Add a button in the extension to mark a URL as broken

**Questions to Answer:**
- What statuses currently exist on `event_links` table?
- Can we add to existing enum, or need new field?
- Should this tie into the processing pipeline?

**Backend Changes Required:**
- Potentially add status value to existing field
- Update event-list endpoint to filter out broken URLs

**Extension Changes Required:**
- Add "Mark as broken" button to event list items
- Call API to update URL status
- Remove item from local list after marking

---

## (Template)

**Problem:**
Description of the issue or opportunity.

**Proposed Solution:**
How to solve it.

**Backend Changes Required:**
- List of backend work

**Extension Changes Required:**
- List of extension work

---

*When an idea is implemented, remove it from this file.*
