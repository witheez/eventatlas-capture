/**
 * Preact rendering utilities for sidepanel UI
 *
 * This module provides Preact-based rendering functions to replace
 * manual DOM manipulation (innerHTML, document.createElement).
 */
import { render } from 'preact';
import { signal } from '@preact/signals';
import type { Bundle, Capture, EventListItem, QueueItem, MediaAsset, PendingScreenshot, Tag, EventType, Distance } from './components/types';

// ============================================================================
// Signals for reactive rendering
// ============================================================================

// Bundle signals
export const bundlesSignal = signal<Bundle[]>([]);
export const currentBundleIdSignal = signal<string | null>(null);

// Drag state
export const draggedPageSignal = signal<{ bundleId: string; pageIndex: number } | null>(null);

// Event list signals
export const eventListSignal = signal<EventListItem[]>([]);
export const eventListLoadingSignal = signal(false);
export const eventListEmptyMsgSignal = signal('No events match your filters');

// Toast signal
export const toastSignal = signal<{ message: string; type: 'success' | 'error'; visible: boolean }>({
  message: '',
  type: 'success',
  visible: false,
});

// Upload queue signal
export const uploadQueueSignal = signal<QueueItem[]>([]);

// Image gallery signals
export const galleryImagesSignal = signal<string[]>([]);
export const selectedImagesSignal = signal<Set<string>>(new Set());

// Metadata signal
export const metadataSignal = signal<Record<string, string>>({});

// Event editor signals
export const eventTypesSignal = signal<EventType[]>([]);
export const selectedEventTypeSignal = signal<number | null>(null);
export const tagsSignal = signal<Tag[]>([]);
export const selectedTagsSignal = signal<Set<number>>(new Set());
export const distancesSignal = signal<Distance[]>([]);
export const selectedDistancesSignal = signal<number[]>([]);
export const savedScreenshotsSignal = signal<MediaAsset[]>([]);
export const pendingScreenshotsSignal = signal<PendingScreenshot[]>([]);
export const uploadingScreenshotsSignal = signal<QueueItem[]>([]);

// ============================================================================
// Callbacks (set by main module)
// ============================================================================

interface RenderCallbacks {
  onToggleBundleExpanded: (bundleId: string) => void;
  onDeleteBundle: (bundleId: string) => void;
  onCopyBundle: (bundleId: string) => void;
  onPageClick: (bundleId: string, pageIndex: number) => void;
  onRemovePage: (bundleId: string, pageIndex: number) => void;
  onEventClick: (event: EventListItem) => void;
  onCopyUrl: (url: string) => void;
  onToggleImage: (url: string) => void;
  onUploadRetry: (id: string) => void;
  onToggleEventType: (typeId: number) => void;
  onToggleTag: (tagId: number) => void;
  onToggleDistance: (value: number) => void;
  onRemoveDistance: (value: number) => void;
  onDeleteScreenshot: (mediaId: number) => void;
  onRemovePendingScreenshot: (id: string) => void;
  onOpenScreenshotModal: (url: string) => void;
}

let callbacks: RenderCallbacks = {
  onToggleBundleExpanded: () => {},
  onDeleteBundle: () => {},
  onCopyBundle: () => {},
  onPageClick: () => {},
  onRemovePage: () => {},
  onEventClick: () => {},
  onCopyUrl: () => {},
  onToggleImage: () => {},
  onUploadRetry: () => {},
  onToggleEventType: () => {},
  onToggleTag: () => {},
  onToggleDistance: () => {},
  onRemoveDistance: () => {},
  onDeleteScreenshot: () => {},
  onRemovePendingScreenshot: () => {},
  onOpenScreenshotModal: () => {},
};

export function setRenderCallbacks(newCallbacks: Partial<RenderCallbacks>): void {
  callbacks = { ...callbacks, ...newCallbacks };
}

// ============================================================================
// Utility functions
// ============================================================================

function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function formatEventDate(dateString: string | undefined): string {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

function fixUrl(url: string): string {
  if (!url) return '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return 'https://' + url;
  }
  return url;
}

// ============================================================================
// Bundle Components
// ============================================================================

interface PageItemComponentProps {
  bundleId: string;
  capture: Capture;
  index: number;
}

function PageItemComponent({ bundleId, capture, index }: PageItemComponentProps): preact.JSX.Element {
  const thumbUrl = capture.screenshot || capture.images?.[0] || capture.selectedImages?.[0];
  const title = capture.editedTitle || capture.title || 'Untitled';
  const domain = getDomain(capture.editedUrl || capture.url || '');

  const handleDragStart = (e: DragEvent) => {
    draggedPageSignal.value = { bundleId, pageIndex: index };
    (e.currentTarget as HTMLElement).classList.add('dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({ bundleId, pageIndex: index }));
    }
  };

  const handleDragEnd = (e: DragEvent) => {
    (e.currentTarget as HTMLElement).classList.remove('dragging');
    draggedPageSignal.value = null;
    document.querySelectorAll('.accordion-bundle.drag-over').forEach((el) => {
      el.classList.remove('drag-over');
    });
  };

  return (
    <div
      class="accordion-page"
      draggable
      data-bundle-id={bundleId}
      data-page-index={index}
      onClick={(e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.accordion-page-remove') && !target.closest('.accordion-page-drag')) {
          callbacks.onPageClick(bundleId, index);
        }
      }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <span class="accordion-page-drag">{'\u22EE\u22EE'}</span>
      <div class="accordion-page-thumb">
        {thumbUrl ? <img src={thumbUrl} alt="" onError={(e) => { (e.target as HTMLElement).parentElement!.textContent = '\u{1F4C4}'; }} /> : '\u{1F4C4}'}
      </div>
      <div class="accordion-page-info">
        <div class="accordion-page-title">{title}</div>
        <div class="accordion-page-domain">{domain}</div>
      </div>
      <button
        class="accordion-page-remove"
        title="Remove from bundle"
        onClick={(e: MouseEvent) => { e.stopPropagation(); callbacks.onRemovePage(bundleId, index); }}
      >
        {'\u00D7'}
      </button>
    </div>
  );
}

interface BundleItemComponentProps {
  bundle: Bundle;
}

function BundleItemComponent({ bundle }: BundleItemComponentProps): preact.JSX.Element {
  const pageCount = bundle.pages?.length || 0;

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    const dragged = draggedPageSignal.value;
    if (dragged && dragged.bundleId !== bundle.id) {
      (e.currentTarget as HTMLElement).classList.add('drag-over');
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDragLeave = (e: DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      (e.currentTarget as HTMLElement).classList.remove('drag-over');
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove('drag-over');
  };

  return (
    <div
      class={`accordion-bundle${bundle.expanded ? ' expanded' : ''}`}
      data-bundle-id={bundle.id}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div class="accordion-header" onClick={() => callbacks.onToggleBundleExpanded(bundle.id)}>
        <span class="accordion-chevron">{'\u25B6'}</span>
        <span class="accordion-icon">{'\u{1F4C1}'}</span>
        <div class="accordion-info">
          <div class="accordion-name">{bundle.name || 'Unnamed Bundle'}</div>
          <div class="accordion-meta">{pageCount} page{pageCount !== 1 ? 's' : ''}</div>
        </div>
        <div class="accordion-actions">
          <button class="accordion-action-btn" title="Copy bundle to clipboard" onClick={(e: MouseEvent) => { e.stopPropagation(); callbacks.onCopyBundle(bundle.id); }}>
            {'\u{1F4CB}'}
          </button>
          <button class="accordion-action-btn delete" title="Delete bundle" onClick={(e: MouseEvent) => { e.stopPropagation(); callbacks.onDeleteBundle(bundle.id); }}>
            {'\u00D7'}
          </button>
        </div>
      </div>
      <div class="accordion-content">
        <div class="accordion-pages">
          {pageCount === 0 ? (
            <div class="accordion-empty">No pages in this bundle yet.</div>
          ) : (
            bundle.pages.map((capture, index) => (
              <PageItemComponent key={`${bundle.id}-${index}`} bundleId={bundle.id} capture={capture} index={index} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function BundlesListComponent(): preact.JSX.Element {
  const bundles = bundlesSignal.value;

  if (bundles.length === 0) {
    return (
      <div class="bundles-empty">
        <div class="bundles-empty-icon">{'\u{1F4C1}'}</div>
        <div>No bundles yet. Capture a page to start.</div>
      </div>
    );
  }

  return (
    <>
      {bundles.map((bundle) => (
        <BundleItemComponent key={bundle.id} bundle={bundle} />
      ))}
    </>
  );
}

// ============================================================================
// Event List Components
// ============================================================================

interface EventListItemComponentProps {
  event: EventListItem;
}

function EventListItemComponent({ event }: EventListItemComponentProps): preact.JSX.Element {
  const startDate = formatEventDate(event.start_datetime);
  const eventUrl = fixUrl(event.primary_url || '');

  const handleCopy = (e: MouseEvent) => {
    e.stopPropagation();
    callbacks.onCopyUrl(eventUrl);
    const btn = e.currentTarget as HTMLButtonElement;
    btn.textContent = '\u2713';
    setTimeout(() => { btn.textContent = '\u{1F4CB}'; }, 1500);
  };

  return (
    <div class="event-list-item" onClick={() => callbacks.onEventClick(event)}>
      <div class="event-list-item-header">
        <div class="event-list-item-title">{event.name}</div>
        {startDate && <div class="event-list-item-date">{startDate}</div>}
      </div>
      <div class="event-list-item-url-row">
        <div class="event-list-item-url">{eventUrl}</div>
        <button class="copy-url-btn" title="Copy URL" onClick={handleCopy}>{'\u{1F4CB}'}</button>
      </div>
      <div class="event-list-item-meta">
        {event.event_type && <span class="meta-badge meta-type">{event.event_type}</span>}
        {event.tags && event.tags.length > 0 && (
          <>
            <span class="meta-badge meta-tag">{event.tags[0]}</span>
            {event.tags.length > 1 && <span class="meta-more">+{event.tags.length - 1}</span>}
          </>
        )}
        {event.distances && event.distances.length > 0 && (
          <span class="meta-badge meta-distance">{event.distances.map(d => `${d}km`).join(', ')}</span>
        )}
      </div>
      {event.missing && event.missing.length > 0 && (
        <div class="event-list-item-missing">
          {event.missing.map((m, i) => <span key={i} class="missing-badge">{m}</span>)}
        </div>
      )}
    </div>
  );
}

function EventListComponent(): preact.JSX.Element {
  const events = eventListSignal.value;
  const isLoading = eventListLoadingSignal.value;
  const emptyMsg = eventListEmptyMsgSignal.value;

  if (isLoading) {
    return <div />;
  }

  if (events.length === 0) {
    return <div />;
  }

  return (
    <>
      {events.map((event) => (
        <EventListItemComponent key={event.id} event={event} />
      ))}
    </>
  );
}

// ============================================================================
// Image Gallery Component
// ============================================================================

function ImageGalleryComponent(): preact.JSX.Element {
  const images = galleryImagesSignal.value;
  const selected = selectedImagesSignal.value;

  if (images.length === 0) {
    return (
      <div class="image-item-error" style={{ gridColumn: '1 / -1', padding: '16px' }}>
        No images found
      </div>
    );
  }

  return (
    <>
      {images.map((url, index) => {
        const isSelected = selected.has(url);
        return (
          <div key={index} class={`image-item${isSelected ? '' : ' excluded'}`} onClick={() => callbacks.onToggleImage(url)}>
            <img src={url} alt={`Image ${index + 1}`} onError={(e) => {
              const target = e.target as HTMLImageElement;
              // Hide failed image and show sibling error message
              target.style.display = 'none';
              const errorEl = target.parentElement?.querySelector('.image-item-error') as HTMLElement | null;
              if (errorEl) errorEl.style.display = 'block';
            }} />
            <div class="image-item-error" style={{ display: 'none' }}>Error loading</div>
            <input type="checkbox" class="image-checkbox" checked={isSelected} onChange={() => callbacks.onToggleImage(url)} />
          </div>
        );
      })}
    </>
  );
}

// ============================================================================
// Metadata Component
// ============================================================================

function MetadataListComponent(): preact.JSX.Element {
  const metadata = metadataSignal.value;
  const entries = Object.entries(metadata);

  if (entries.length === 0) {
    return <div />;
  }

  return (
    <>
      {entries.map(([key, value]) => (
        <div key={key} class="metadata-item">
          <span class="metadata-key">{key}</span>
          <span class="metadata-value">{value}</span>
        </div>
      ))}
    </>
  );
}

// ============================================================================
// Upload Queue Component
// ============================================================================

function UploadQueueItemComponent({ item }: { item: QueueItem }): preact.JSX.Element {
  return (
    <div class={`upload-queue-item ${item.status}`} data-id={item.id}>
      <img src={item.thumbnail} alt="Uploading screenshot" />
      {item.status === 'uploading' && (
        <svg class="progress-ring" width="24" height="24">
          <circle class="progress-ring-bg" cx="12" cy="12" r="10" />
          <circle
            class="progress-ring-fill"
            cx="12" cy="12" r="10"
            stroke-dasharray={2 * Math.PI * 10}
            stroke-dashoffset={2 * Math.PI * 10 - (item.progress / 100) * 2 * Math.PI * 10}
          />
        </svg>
      )}
      <span class="check-icon">{'\u2714'}</span>
      {item.status === 'failed' && (
        <button class="retry-btn" title="Retry" onClick={() => callbacks.onUploadRetry(item.id)}>{'\u21BB'}</button>
      )}
      <span class="event-label">{item.filename || 'Screenshot'}</span>
    </div>
  );
}

function UploadQueueComponent(): preact.JSX.Element {
  const items = uploadQueueSignal.value;
  return (
    <>
      {items.map((item) => (
        <UploadQueueItemComponent key={item.id} item={item} />
      ))}
    </>
  );
}

// ============================================================================
// Event Editor Components
// ============================================================================

function EventTypePillsComponent(): preact.JSX.Element {
  const types = eventTypesSignal.value;
  const selectedId = selectedEventTypeSignal.value;

  return (
    <>
      {types.map((type) => (
        <button
          key={type.id}
          class={`event-type-btn${selectedId === type.id ? ' selected' : ''}`}
          data-type-id={type.id}
          onClick={() => callbacks.onToggleEventType(type.id)}
        >
          {type.name}
        </button>
      ))}
    </>
  );
}

function TagsChipsComponent(): preact.JSX.Element {
  const tags = tagsSignal.value;
  const selectedIds = selectedTagsSignal.value;

  return (
    <>
      {tags.map((tag) => {
        const isSelected = selectedIds.has(tag.id);
        return (
          <span
            key={tag.id}
            class={`tag-chip${isSelected ? ' selected' : ''}`}
            data-tag-id={tag.id}
            onClick={() => callbacks.onToggleTag(tag.id)}
          >
            <span class="tag-chip-check">{isSelected ? '\u2713' : ''}</span>
            <span>{tag.name}</span>
            {typeof tag.events_count === 'number' && (
              <span class="tag-chip-count"> ({tag.events_count})</span>
            )}
          </span>
        );
      })}
    </>
  );
}

function DistanceButtonsComponent(): preact.JSX.Element {
  const distances = distancesSignal.value;
  const selectedValues = selectedDistancesSignal.value;

  return (
    <>
      {distances.map((dist) => (
        <button
          key={dist.value}
          class={`distance-btn${dist.isUserPreset ? ' user-preset' : ''}${selectedValues.includes(dist.value) ? ' selected' : ''}`}
          data-value={dist.value}
          onClick={() => callbacks.onToggleDistance(dist.value)}
        >
          {dist.label}
        </button>
      ))}
    </>
  );
}

function SelectedDistancesComponent(): preact.JSX.Element {
  const selectedValues = selectedDistancesSignal.value;
  const distances = distancesSignal.value;

  if (selectedValues.length === 0) {
    return <div />;
  }

  return (
    <>
      {selectedValues.map((value) => {
        const distObj = distances.find(d => d.value === value);
        const label = distObj ? distObj.label : `${value}K`;
        return (
          <span key={value} class="selected-distance-chip">
            {label}
            <span class="selected-distance-remove" data-value={value} onClick={() => callbacks.onRemoveDistance(value)}>
              {'\u00D7'}
            </span>
          </span>
        );
      })}
    </>
  );
}

function SavedScreenshotsComponent(): preact.JSX.Element {
  const screenshots = savedScreenshotsSignal.value.filter(m => m.type === 'screenshot' || m.type === 'Screenshot');
  const pending = pendingScreenshotsSignal.value;
  const uploading = uploadingScreenshotsSignal.value;

  if (screenshots.length === 0 && pending.length === 0 && uploading.length === 0) {
    return <div class="no-screenshots">No screenshots yet</div>;
  }

  return (
    <>
      {screenshots.map((item) => (
        <div key={item.id} class="saved-screenshot-item" onClick={() => callbacks.onOpenScreenshotModal(item.file_url)}>
          <img src={item.thumbnail_url || item.file_url} alt={item.name || 'Screenshot'} onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const errorEl = target.parentElement?.querySelector('.screenshot-error') as HTMLElement | null;
            if (errorEl) errorEl.style.display = 'flex';
          }} />
          <div class="screenshot-error" style={{ display: 'none', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: '10px' }}>Failed</div>
          <button class="screenshot-delete-btn" title="Delete screenshot" onClick={(e: MouseEvent) => { e.stopPropagation(); callbacks.onDeleteScreenshot(item.id); }}>
            {'\u00D7'}
          </button>
        </div>
      ))}
      {uploading.map((item) => (
        <div key={item.id} class="saved-screenshot-item uploading" data-queue-id={item.id}>
          <img src={item.thumbnail} alt="Uploading..." />
          <div class="upload-overlay"><span>{item.progress}%</span></div>
        </div>
      ))}
      {pending.length > 0 && (
        <div class="pending-screenshots-section">
          <div class="pending-screenshots-header">
            <span class="pending-screenshots-title">Pending Upload</span>
            <span class="pending-screenshots-count">{pending.length}</span>
          </div>
          <div class="pending-screenshots-grid">
            {pending.map((item) => (
              <div key={item.id} class="pending-screenshot-item">
                <img src={item.data} alt="Pending screenshot" />
                <span class="pending-badge">Pending</span>
                <button class="pending-screenshot-remove" title="Remove" onClick={() => callbacks.onRemovePendingScreenshot(item.id)}>
                  {'\u00D7'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================================
// Mount functions
// ============================================================================

export function mountBundlesList(container: HTMLElement): void {
  render(<BundlesListComponent />, container);
}

export function mountEventList(container: HTMLElement): void {
  render(<EventListComponent />, container);
}

export function mountImageGallery(container: HTMLElement): void {
  render(<ImageGalleryComponent />, container);
}

export function mountMetadataList(container: HTMLElement): void {
  render(<MetadataListComponent />, container);
}

export function mountUploadQueueItems(container: HTMLElement): void {
  render(<UploadQueueComponent />, container);
}

export function mountEventTypePills(container: HTMLElement): void {
  render(<EventTypePillsComponent />, container);
}

export function mountTagsChips(container: HTMLElement): void {
  render(<TagsChipsComponent />, container);
}

export function mountDistanceButtons(container: HTMLElement): void {
  render(<DistanceButtonsComponent />, container);
}

export function mountSelectedDistances(container: HTMLElement): void {
  render(<SelectedDistancesComponent />, container);
}

export function mountSavedScreenshots(container: HTMLElement): void {
  render(<SavedScreenshotsComponent />, container);
}

// ============================================================================
// Update functions for external use
// ============================================================================

export function updateBundles(bundles: Bundle[]): void {
  bundlesSignal.value = [...bundles];
}

export function updateEventList(events: EventListItem[]): void {
  eventListSignal.value = [...events];
}

export function setEventListLoading(loading: boolean): void {
  eventListLoadingSignal.value = loading;
}

export function setEventListEmptyMsg(msg: string): void {
  eventListEmptyMsgSignal.value = msg;
}

export function updateGalleryImages(images: string[]): void {
  galleryImagesSignal.value = [...images];
}

export function updateSelectedImages(selected: Set<string>): void {
  selectedImagesSignal.value = new Set(selected);
}

export function updateMetadata(metadata: Record<string, string>): void {
  metadataSignal.value = { ...metadata };
}

export function updateUploadQueue(items: QueueItem[]): void {
  uploadQueueSignal.value = [...items];
}

export function updateEventTypes(types: EventType[]): void {
  eventTypesSignal.value = [...types];
}

export function updateSelectedEventType(id: number | null): void {
  selectedEventTypeSignal.value = id;
}

export function updateTags(tags: Tag[]): void {
  tagsSignal.value = [...tags];
}

export function updateSelectedTags(ids: Set<number>): void {
  selectedTagsSignal.value = new Set(ids);
}

export function updateDistances(distances: Distance[]): void {
  distancesSignal.value = [...distances];
}

export function updateSelectedDistances(values: number[]): void {
  selectedDistancesSignal.value = [...values];
}

export function updateSavedScreenshots(media: MediaAsset[]): void {
  savedScreenshotsSignal.value = [...media];
}

export function updatePendingScreenshots(pending: PendingScreenshot[]): void {
  pendingScreenshotsSignal.value = [...pending];
}

export function updateUploadingScreenshots(items: QueueItem[]): void {
  uploadingScreenshotsSignal.value = [...items];
}

// ============================================================================
// Re-render helper
// ============================================================================

export function rerenderBundlesList(container: HTMLElement | null): void {
  if (container) mountBundlesList(container);
}

export function rerenderEventList(container: HTMLElement | null): void {
  if (container) mountEventList(container);
}

export function rerenderImageGallery(container: HTMLElement | null): void {
  if (container) mountImageGallery(container);
}

export function rerenderMetadataList(container: HTMLElement | null): void {
  if (container) mountMetadataList(container);
}

export function rerenderUploadQueue(container: HTMLElement | null): void {
  if (container) mountUploadQueueItems(container);
}

export function rerenderEventTypePills(container: HTMLElement | null): void {
  if (container) mountEventTypePills(container);
}

export function rerenderTagsChips(container: HTMLElement | null): void {
  if (container) mountTagsChips(container);
}

export function rerenderDistanceButtons(container: HTMLElement | null): void {
  if (container) mountDistanceButtons(container);
}

export function rerenderSelectedDistances(container: HTMLElement | null): void {
  if (container) mountSelectedDistances(container);
}

export function rerenderSavedScreenshots(container: HTMLElement | null): void {
  if (container) mountSavedScreenshots(container);
}
