# Plan: Event Editing from Plugin

> **Date:** 2026-01-23
> **Status:** Planning Complete, Ready for Implementation
> **Priority:** HIGH

---

## Overview

Enhance the Chrome extension to allow editing event attributes directly from the plugin when viewing a known event page. This transforms the plugin from a "capture tool" into an "event management assistant."

### Use Case

While browsing event websites and organizing events in EventAtlas, admins can:
1. Take screenshots of event pages and associate them with the event
2. Update event tags, type, and distances without switching to the admin panel
3. Add notes for context

---

## Features

### 1. Screenshot to Event
- Capture screenshot of current page
- Upload and associate with the matched event
- Store in `media_assets` table with `type=screenshot`, `source=plugin`
- Link via `event_media` junction table

### 2. Event Type Selector
- Dropdown to select event type
- Fetched from `/api/extension/event-types`

### 3. Tags Editor
- Multi-select for existing tags
- Ability to add new tags (or select from available)
- Fetched from `/api/extension/tags`

### 4. Distances Picker
- Predefined distance buttons: 5K, 10K, 15K, 21K (Half), 42K (Marathon), 50K, 100K
- Custom distance input for non-standard values
- Stored as JSON array in `distances_km` field

### 5. Notes Field
- Free text field for admin notes
- Stored on the event

---

## Database Changes

### 1. Enhance `media_assets` Table (Migration)

Add 3 new columns:

```php
Schema::table('media_assets', function (Blueprint $table) {
    $table->string('type', 50)->nullable()->after('category');
    $table->string('source', 50)->nullable()->after('type');
    $table->string('source_url', 2048)->nullable()->after('source');

    $table->index('type');
    $table->index('source');
});
```

| Column | Type | Purpose |
|--------|------|---------|
| `type` | string (enum) | WHAT it is: screenshot, background, icon, event_image, document, video, logo |
| `source` | string (enum) | WHERE it came from: plugin, upload, content_item, external_url |
| `source_url` | string | URL where screenshot was captured (for plugin screenshots) |

**Note:** `category` remains as user-defined freeform field for organization (e.g., "light backgrounds", "dark backgrounds").

### 2. Create `event_media` Junction Table (Migration)

```php
Schema::create('event_media', function (Blueprint $table) {
    $table->id();
    $table->foreignId('event_id')->constrained('events')->cascadeOnDelete();
    $table->foreignId('media_asset_id')->constrained('media_assets')->cascadeOnDelete();
    $table->foreignId('content_item_id')->nullable()->constrained('content_items')->nullOnDelete();
    $table->json('metadata')->nullable();
    $table->timestamps();

    $table->unique(['event_id', 'media_asset_id']);
});
```

| Column | Type | Purpose |
|--------|------|---------|
| `event_id` | FK | Which event |
| `media_asset_id` | FK | Which media (links to media_assets) |
| `content_item_id` | FK nullable | If curated from scraped content |
| `metadata` | json | Any context-specific data |

**Deferred for later** (when frontend display is designed):
- `is_featured`
- `is_primary`
- `sort_order`

---

## Enums

### MediaAssetType

```php
// app/Enums/MediaAssetType.php
enum MediaAssetType: string
{
    case Screenshot = 'screenshot';
    case Background = 'background';
    case Icon = 'icon';
    case EventImage = 'event_image';
    case Document = 'document';
    case Video = 'video';
    case Logo = 'logo';
}
```

### MediaAssetSource

```php
// app/Enums/MediaAssetSource.php
enum MediaAssetSource: string
{
    case Plugin = 'plugin';
    case Upload = 'upload';
    case ContentItem = 'content_item';
    case ExternalUrl = 'external_url';
}
```

---

## Models

### New: EventMedia Model

```php
// app/Models/EventMedia.php
class EventMedia extends Model
{
    protected $fillable = [
        'event_id',
        'media_asset_id',
        'content_item_id',
        'metadata',
    ];

    protected $casts = [
        'metadata' => 'array',
    ];

    public function event(): BelongsTo
    {
        return $this->belongsTo(Event::class);
    }

    public function mediaAsset(): BelongsTo
    {
        return $this->belongsTo(MediaAsset::class);
    }

    public function contentItem(): BelongsTo
    {
        return $this->belongsTo(ContentItem::class);
    }
}
```

### Update: MediaAsset Model

Add to `$fillable`:
```php
'type', 'source', 'source_url'
```

Add casts:
```php
'type' => MediaAssetType::class,
'source' => MediaAssetSource::class,
```

Add relationship:
```php
public function eventMedia(): HasMany
{
    return $this->hasMany(EventMedia::class);
}
```

### Update: Event Model

Add relationships:
```php
public function media(): HasMany
{
    return $this->hasMany(EventMedia::class);
}

public function screenshots(): HasMany
{
    return $this->hasMany(EventMedia::class)
        ->whereHas('mediaAsset', fn($q) => $q->where('type', 'screenshot'));
}
```

---

## API Endpoints

### GET /api/extension/tags

Returns available tags for selection.

**Response:**
```json
{
    "tags": [
        {"id": 1, "name": "Running", "slug": "running"},
        {"id": 2, "name": "Cycling", "slug": "cycling"},
        {"id": 3, "name": "Trail", "slug": "trail"}
    ]
}
```

### GET /api/extension/event-types

Returns available event types for selection.

**Response:**
```json
{
    "event_types": [
        {"id": 1, "name": "Road Race"},
        {"id": 2, "name": "Trail Race"},
        {"id": 3, "name": "Triathlon"}
    ]
}
```

### GET /api/extension/distances

Returns predefined distances for quick-add buttons.

**Response:**
```json
{
    "distances": [
        {"value": 5, "label": "5K"},
        {"value": 10, "label": "10K"},
        {"value": 15, "label": "15K"},
        {"value": 21.0975, "label": "Half Marathon"},
        {"value": 42.195, "label": "Marathon"},
        {"value": 50, "label": "50K"},
        {"value": 100, "label": "100K"}
    ]
}
```

### PATCH /api/extension/events/{id}

Update event attributes.

**Request:**
```json
{
    "tag_ids": [1, 2, 3],
    "event_type_id": 5,
    "distances_km": [10, 21.0975, 42.195],
    "notes": "Annual charity run, registration closes March 1"
}
```

**Response:**
```json
{
    "success": true,
    "event": {
        "id": 123,
        "title": "Spring Marathon 2025",
        "tags": [...],
        "event_type": {...},
        "distances_km": [10, 21.0975, 42.195],
        "notes": "..."
    }
}
```

### POST /api/extension/events/{id}/screenshot

Upload a screenshot and associate with event.

**Request:**
```json
{
    "screenshot": "data:image/png;base64,iVBORw0KGgo...",
    "source_url": "https://example.com/event-page"
}
```

**Response:**
```json
{
    "success": true,
    "media_asset": {
        "id": 456,
        "file_url": "https://...",
        "thumbnail_url": "https://..."
    },
    "event_media": {
        "id": 789
    }
}
```

---

## Plugin UI

### Event Editor Panel

Appears in sidepanel when URL matches a known event:

```
┌─────────────────────────────────────────────────────┐
│ ✓ Known Event                                       │
│ "Spring Marathon 2025"                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│ Event Type:                                         │
│ ┌─────────────────────────────────────────────┐    │
│ │ Road Race                              ▼    │    │
│ └─────────────────────────────────────────────┘    │
│                                                     │
│ Tags:                                               │
│ [Running ×] [Marathon ×] [+ Add Tag]               │
│                                                     │
│ Distances:                                          │
│ [5K] [10K] [15K] [21K] [42K] [+ Custom]            │
│ Selected: [10 km ×] [21.1 km ×] [42.2 km ×]       │
│                                                     │
│ Notes:                                              │
│ ┌─────────────────────────────────────────────┐    │
│ │                                             │    │
│ └─────────────────────────────────────────────┘    │
│                                                     │
│ Screenshot:                                         │
│ [📸 Capture & Save Screenshot]                     │
│                                                     │
│ Saved Screenshots: (2)                              │
│ [thumb] [thumb]                                     │
│                                                     │
│              [💾 Save Changes]                      │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Order

| Phase | Task | Files |
|-------|------|-------|
| **1** | Migration: Add type/source/source_url to media_assets | `database/migrations/` |
| **2** | Migration: Create event_media table | `database/migrations/` |
| **3** | Create enums | `app/Enums/MediaAssetType.php`, `MediaAssetSource.php` |
| **4** | Create EventMedia model | `app/Models/EventMedia.php` |
| **5** | Update MediaAsset model | `app/Models/MediaAsset.php` |
| **6** | Update Event model | `app/Models/OrganizersEvents/Event.php` |
| **7** | API: GET /tags | Controller, Resource, Route |
| **8** | API: GET /event-types | Controller, Resource, Route |
| **9** | API: GET /distances | Controller (static), Route |
| **10** | API: PATCH /events/{id} | Controller, FormRequest, Route |
| **11** | API: POST /events/{id}/screenshot | Controller, Service, Route |
| **12** | Plugin: Event editor panel UI | `sidepanel.html`, `sidepanel.js` |
| **13** | Plugin: Tags selector component | `sidepanel.js` |
| **14** | Plugin: Distances picker component | `sidepanel.js` |
| **15** | Plugin: Screenshot upload integration | `sidepanel.js` |
| **16** | Tests | Feature tests for all API endpoints |

---

## Related Documentation

- **URL Lookup Logic:** Verified to search `event_links`, `content_items`, `organizer_links`
- **Existing media_assets:** Already has `category` (freeform), `mime_type`, dimensions, file storage
- **PersistentFileStorage:** Use for screenshot storage

---

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| `type` vs `category` distinction? | `type` = system enum (what it is), `category` = user freeform (organization) |
| Where to store type/source? | In `media_assets` (intrinsic properties of the file) |
| Need is_featured/is_primary/sort_order? | Deferred - add when frontend display is designed |
| Screenshot storage? | Use PersistentFileStorage, store in `media/screenshots/` |

---

## Future Enhancements (Out of Scope)

- Dual-column "workstation" mode with event list
- Curating images from content_items
- Organizer media table
- Bulk screenshot operations
