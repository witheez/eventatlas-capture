# Ideas & Improvement Suggestions

Running list of ideas for the EventAtlas Capture extension. Remove items once implemented.

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
