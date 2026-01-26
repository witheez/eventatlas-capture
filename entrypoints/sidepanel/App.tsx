/**
 * Main App component - renders dynamic UI parts with Preact
 */
import { render } from 'preact';
import { signal, computed } from '@preact/signals';
import { BundlesList } from './components/BundlesList';
import { EventListView } from './components/EventListView';
import { UploadQueue } from './components/UploadQueue';
import { Toast } from './components/Toast';
import { ImageGallery } from './components/ImageGallery';
import { MetadataList } from './components/MetadataList';
import type { Bundle, EventListItem, QueueItem } from './components/types';

// ============================================================================
// Signals for reactive state
// ============================================================================

// Core data signals
export const bundlesSignal = signal<Bundle[]>([]);
export const eventListSignal = signal<EventListItem[]>([]);
export const uploadQueueSignal = signal<QueueItem[]>([]);

// UI state signals
export const currentBundleIdSignal = signal<string | null>(null);
export const isEventListLoadingSignal = signal(false);
export const eventListEmptyMessageSignal = signal('No events match your filters');
export const toastSignal = signal<{ message: string; type: 'success' | 'error'; visible: boolean }>(
  {
    message: '',
    type: 'success',
    visible: false,
  }
);

// Image gallery signals
export const imagesSignal = signal<string[]>([]);
export const selectedImagesSignal = signal<Set<string>>(new Set());

// Metadata signal
export const metadataSignal = signal<Record<string, string>>({});

// Upload queue visibility
export const uploadQueueVisibleSignal = computed(() => uploadQueueSignal.value.length > 0);

// ============================================================================
// Callback holders (set by main.ts)
// ============================================================================

export interface AppCallbacks {
  onToggleBundleExpanded: (bundleId: string) => void;
  onDeleteBundle: (bundleId: string) => void;
  onCopyBundle: (bundleId: string) => void;
  onPageClick: (bundleId: string, pageIndex: number) => void;
  onRemovePage: (bundleId: string, pageIndex: number) => void;
  onBundleDragStart: (bundleId: string, pageIndex: number) => void;
  onBundleDragEnd: () => void;
  onBundleDrop: (targetBundleId: string) => void;
  onEventClick: (event: EventListItem) => void;
  onCopyUrl: (url: string) => void;
  onUploadRetry: (id: string) => void;
  onToggleImage: (url: string) => void;
}

let callbacks: AppCallbacks = {
  onToggleBundleExpanded: () => {},
  onDeleteBundle: () => {},
  onCopyBundle: () => {},
  onPageClick: () => {},
  onRemovePage: () => {},
  onBundleDragStart: () => {},
  onBundleDragEnd: () => {},
  onBundleDrop: () => {},
  onEventClick: () => {},
  onCopyUrl: () => {},
  onUploadRetry: () => {},
  onToggleImage: () => {},
};

export function setCallbacks(newCallbacks: Partial<AppCallbacks>): void {
  callbacks = { ...callbacks, ...newCallbacks };
}

// ============================================================================
// Toast helpers
// ============================================================================

export function showToastMessage(message: string, type: 'success' | 'error' = 'success'): void {
  toastSignal.value = { message, type, visible: true };
}

export function hideToast(): void {
  toastSignal.value = { ...toastSignal.value, visible: false };
}

// ============================================================================
// Component wrappers for mounting to specific DOM elements
// ============================================================================

function BundlesListWrapper(): preact.JSX.Element {
  return (
    <BundlesList
      bundles={bundlesSignal.value}
      currentBundleId={currentBundleIdSignal.value}
      onToggleExpanded={callbacks.onToggleBundleExpanded}
      onDeleteBundle={callbacks.onDeleteBundle}
      onCopyBundle={callbacks.onCopyBundle}
      onPageClick={callbacks.onPageClick}
      onRemovePage={callbacks.onRemovePage}
      onDragStart={callbacks.onBundleDragStart}
      onDragEnd={callbacks.onBundleDragEnd}
      onDrop={callbacks.onBundleDrop}
    />
  );
}

function EventListWrapper(): preact.JSX.Element {
  return (
    <EventListView
      events={eventListSignal.value}
      isLoading={isEventListLoadingSignal.value}
      emptyMessage={eventListEmptyMessageSignal.value}
      onEventClick={callbacks.onEventClick}
      onCopyUrl={callbacks.onCopyUrl}
    />
  );
}

function UploadQueueWrapper(): preact.JSX.Element {
  return (
    <UploadQueue
      items={uploadQueueSignal.value}
      visible={uploadQueueVisibleSignal.value}
      onRetry={callbacks.onUploadRetry}
    />
  );
}

function ToastWrapper(): preact.JSX.Element {
  return (
    <Toast
      message={toastSignal.value.message}
      type={toastSignal.value.type}
      visible={toastSignal.value.visible}
      onHide={hideToast}
    />
  );
}

function ImageGalleryWrapper(): preact.JSX.Element {
  return (
    <ImageGallery
      images={imagesSignal.value}
      selectedImages={selectedImagesSignal.value}
      onToggleImage={callbacks.onToggleImage}
    />
  );
}

function MetadataListWrapper(): preact.JSX.Element {
  return <MetadataList metadata={metadataSignal.value} />;
}

// ============================================================================
// Mount functions
// ============================================================================

export function mountBundlesList(container: HTMLElement): void {
  render(<BundlesListWrapper />, container);
}

export function mountEventList(container: HTMLElement): void {
  render(<EventListWrapper />, container);
}

export function mountUploadQueue(container: HTMLElement): void {
  render(<UploadQueueWrapper />, container);
}

export function mountToast(container: HTMLElement): void {
  render(<ToastWrapper />, container);
}

export function mountImageGallery(container: HTMLElement): void {
  render(<ImageGalleryWrapper />, container);
}

export function mountMetadataList(container: HTMLElement): void {
  render(<MetadataListWrapper />, container);
}

// ============================================================================
// Update functions (called from main.ts when state changes)
// ============================================================================

export function updateBundles(bundles: Bundle[]): void {
  bundlesSignal.value = [...bundles];
}

export function updateCurrentBundleId(id: string | null): void {
  currentBundleIdSignal.value = id;
}

export function updateEventList(events: EventListItem[]): void {
  eventListSignal.value = [...events];
}

export function setEventListLoading(loading: boolean): void {
  isEventListLoadingSignal.value = loading;
}

export function setEventListEmptyMessage(message: string): void {
  eventListEmptyMessageSignal.value = message;
}

export function updateUploadQueue(items: QueueItem[]): void {
  uploadQueueSignal.value = [...items];
}

export function updateImages(images: string[]): void {
  imagesSignal.value = images;
}

export function updateSelectedImages(selected: Set<string>): void {
  selectedImagesSignal.value = new Set(selected);
}

export function updateMetadata(metadata: Record<string, string>): void {
  metadataSignal.value = { ...metadata };
}
