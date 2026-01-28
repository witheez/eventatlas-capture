/**
 * EventAtlas Capture - Centralized State Store
 *
 * Single source of truth for all application state.
 * Modules import getters/setters from here instead of maintaining local state.
 */

import type { Settings, Bundle, FilterState } from './storage';
import type { MatchedEvent, PendingScreenshot } from './event-editor';
import type { QueueItem } from './upload-queue';
import type { LinkDiscoveryData } from './api';

// ============================================================================
// Type Definitions
// ============================================================================

export interface EventListItem {
  id: number;
  name: string;
  primary_url?: string;
  primary_link_id?: number;
  start_datetime?: string;
  last_scraped_at?: string;
  event_type?: { name: string };
  tags?: Array<{ name: string }>;
  distances?: Array<{ value: number; label: string }>;
  missing?: string[];
}

export interface Tag {
  id: number;
  name: string;
}

export interface EventType {
  id: number;
  name: string;
}

export interface Distance {
  value: number;
  label: string;
  isUserPreset?: boolean;
}

export interface DraggedPage {
  bundleId: string;
  pageIndex: number;
}

export interface PendingCaptureData {
  capture: import('./storage').Capture;
  bundleId: string;
  duplicateIndex: number;
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULT_SETTINGS: Settings = {
  autoGroupByDomain: true,
  captureScreenshotByDefault: false,
  apiUrl: '',
  apiToken: '',
  syncMode: 'both',
  distancePresets: {
    defaults: {
      5: true,
      10: true,
      21: true,
      42: true,
      50: true,
      100: true,
      161: true,
    },
    custom: [],
  },
  screenshotUploadTiming: 'immediate',
  autoSwitchTab: true,
  eventListRefreshInterval: 0,
  autoAnalyzeSites: false,
};

export const DEFAULT_FILTER_STATE: FilterState = {
  missingTags: false,
  missingDistances: false,
  mode: 'any',
  startsFrom: null,
};

// ============================================================================
// Internal State (private to this module)
// ============================================================================

// Core data
let _bundles: Bundle[] = [];
let _settings: Settings = { ...DEFAULT_SETTINGS };
let _filterState: FilterState = { ...DEFAULT_FILTER_STATE };

// View state
let _currentView: 'bundles' | 'detail' = 'bundles';
let _currentBundleId: string | null = null;
let _currentPageIndex: number | null = null;
let _activeTab: 'current' | 'event-list' | 'site-analysis' = 'current';

// Detail view state
let _selectedImages: Set<string> = new Set();
let _textExpanded = false;

// Pending operations
let _pendingCapture: PendingCaptureData | null = null;
let _draggedPage: DraggedPage | null = null;

// Event list state
let _eventListCache: EventListItem[] = [];
let _eventListLastFetched: number | null = null;
let _eventListRefreshTimer: ReturnType<typeof setInterval> | null = null;

// Event editor state
let _currentMatchedEvent: MatchedEvent | null = null;
let _availableTags: Tag[] = [];
let _availableEventTypes: EventType[] = [];
let _availableDistances: Distance[] = [];
let _selectedEventTypeId: number | null = null;
let _selectedTagIds: Set<number> = new Set();
let _selectedDistanceValues: number[] = [];
let _eventEditorExpanded = true;
let _pendingScreenshots: PendingScreenshot[] = [];

// URL tracking
let _lastKnownUrl: string | null = null;
let _pendingUrlChange: string | null = null;

// Link discovery state
let _currentLinkDiscovery: LinkDiscoveryData | null = null;
let _extractedPageLinks: string[] = [];
let _newDiscoveredLinks: string[] = [];
let _selectedNewLinks: Set<string> = new Set();

// Upload queue state
let _uploadQueue: QueueItem[] = [];

// ============================================================================
// Core Data Accessors
// ============================================================================

export function getBundles(): Bundle[] {
  return _bundles;
}

export function setBundles(bundles: Bundle[]): void {
  _bundles = bundles;
}

export function getBundleById(id: string): Bundle | undefined {
  return _bundles.find((b) => b.id === id);
}

export function getSettings(): Settings {
  return _settings;
}

export function setSettings(settings: Settings): void {
  _settings = settings;
}

export function getFilterState(): FilterState {
  return _filterState;
}

export function setFilterState(filterState: FilterState): void {
  _filterState = filterState;
}

// ============================================================================
// View State Accessors
// ============================================================================

export function getCurrentView(): 'bundles' | 'detail' {
  return _currentView;
}

export function setCurrentView(view: 'bundles' | 'detail'): void {
  _currentView = view;
}

export function getCurrentBundleId(): string | null {
  return _currentBundleId;
}

export function setCurrentBundleId(id: string | null): void {
  _currentBundleId = id;
}

export function getCurrentBundle(): Bundle | null {
  return _currentBundleId ? getBundleById(_currentBundleId) || null : null;
}

export function getCurrentPageIndex(): number | null {
  return _currentPageIndex;
}

export function setCurrentPageIndex(index: number | null): void {
  _currentPageIndex = index;
}

export function getActiveTab(): 'current' | 'event-list' | 'site-analysis' {
  return _activeTab;
}

export function setActiveTab(tab: 'current' | 'event-list' | 'site-analysis'): void {
  _activeTab = tab;
}

// ============================================================================
// Detail View State Accessors
// ============================================================================

export function getSelectedImages(): Set<string> {
  return _selectedImages;
}

export function setSelectedImages(images: Set<string>): void {
  _selectedImages = images;
}

export function getTextExpanded(): boolean {
  return _textExpanded;
}

export function setTextExpanded(expanded: boolean): void {
  _textExpanded = expanded;
}

// ============================================================================
// Pending Operations Accessors
// ============================================================================

export function getPendingCapture(): PendingCaptureData | null {
  return _pendingCapture;
}

export function setPendingCapture(capture: PendingCaptureData | null): void {
  _pendingCapture = capture;
}

export function getDraggedPage(): DraggedPage | null {
  return _draggedPage;
}

export function setDraggedPage(page: DraggedPage | null): void {
  _draggedPage = page;
}

// ============================================================================
// Event List State Accessors
// ============================================================================

export function getEventListCache(): EventListItem[] {
  return _eventListCache;
}

export function setEventListCache(cache: EventListItem[]): void {
  _eventListCache = cache;
}

export function getEventListLastFetched(): number | null {
  return _eventListLastFetched;
}

export function setEventListLastFetched(timestamp: number | null): void {
  _eventListLastFetched = timestamp;
}

export function getEventListRefreshTimer(): ReturnType<typeof setInterval> | null {
  return _eventListRefreshTimer;
}

export function setEventListRefreshTimer(timer: ReturnType<typeof setInterval> | null): void {
  _eventListRefreshTimer = timer;
}

// ============================================================================
// Event Editor State Accessors
// ============================================================================

export function getCurrentMatchedEvent(): MatchedEvent | null {
  return _currentMatchedEvent;
}

export function setCurrentMatchedEvent(event: MatchedEvent | null): void {
  _currentMatchedEvent = event;
}

export function getAvailableTags(): Tag[] {
  return _availableTags;
}

export function setAvailableTags(tags: Tag[]): void {
  _availableTags = tags;
}

export function getAvailableEventTypes(): EventType[] {
  return _availableEventTypes;
}

export function setAvailableEventTypes(types: EventType[]): void {
  _availableEventTypes = types;
}

export function getAvailableDistances(): Distance[] {
  return _availableDistances;
}

export function setAvailableDistances(distances: Distance[]): void {
  _availableDistances = distances;
}

export function getSelectedEventTypeId(): number | null {
  return _selectedEventTypeId;
}

export function setSelectedEventTypeId(id: number | null): void {
  _selectedEventTypeId = id;
}

export function getSelectedTagIds(): Set<number> {
  return _selectedTagIds;
}

export function setSelectedTagIds(ids: Set<number>): void {
  _selectedTagIds = ids;
}

export function getSelectedDistanceValues(): number[] {
  return _selectedDistanceValues;
}

export function setSelectedDistanceValues(values: number[]): void {
  _selectedDistanceValues = values;
}

export function getEventEditorExpanded(): boolean {
  return _eventEditorExpanded;
}

export function setEventEditorExpanded(expanded: boolean): void {
  _eventEditorExpanded = expanded;
}

export function getPendingScreenshots(): PendingScreenshot[] {
  return _pendingScreenshots;
}

export function setPendingScreenshots(screenshots: PendingScreenshot[]): void {
  _pendingScreenshots = screenshots;
}

// ============================================================================
// URL Tracking Accessors
// ============================================================================

export function getLastKnownUrl(): string | null {
  return _lastKnownUrl;
}

export function setLastKnownUrl(url: string | null): void {
  _lastKnownUrl = url;
}

export function getPendingUrlChange(): string | null {
  return _pendingUrlChange;
}

export function setPendingUrlChange(url: string | null): void {
  _pendingUrlChange = url;
}

// ============================================================================
// Link Discovery State Accessors
// ============================================================================

export function getCurrentLinkDiscovery(): LinkDiscoveryData | null {
  return _currentLinkDiscovery;
}

export function setCurrentLinkDiscovery(data: LinkDiscoveryData | null): void {
  _currentLinkDiscovery = data;
}

export function getExtractedPageLinks(): string[] {
  return _extractedPageLinks;
}

export function setExtractedPageLinks(links: string[]): void {
  _extractedPageLinks = links;
}

export function getNewDiscoveredLinks(): string[] {
  return _newDiscoveredLinks;
}

export function setNewDiscoveredLinks(links: string[]): void {
  _newDiscoveredLinks = links;
}

export function getSelectedNewLinks(): Set<string> {
  return _selectedNewLinks;
}

export function setSelectedNewLinks(links: Set<string>): void {
  _selectedNewLinks = links;
}

// ============================================================================
// Upload Queue State Accessors
// ============================================================================

export function getUploadQueue(): QueueItem[] {
  return _uploadQueue;
}

export function setUploadQueue(queue: QueueItem[]): void {
  _uploadQueue = queue;
}

export function addToUploadQueueState(item: QueueItem): void {
  _uploadQueue.push(item);
}

export function removeFromUploadQueueState(id: string): void {
  _uploadQueue = _uploadQueue.filter((q) => q.id !== id);
}

export function getUploadQueueItem(id: string): QueueItem | undefined {
  return _uploadQueue.find((q) => q.id === id);
}

// ============================================================================
// Reset Functions (for testing)
// ============================================================================

export function resetStore(): void {
  _bundles = [];
  _settings = { ...DEFAULT_SETTINGS };
  _filterState = { ...DEFAULT_FILTER_STATE };
  _currentView = 'bundles';
  _currentBundleId = null;
  _currentPageIndex = null;
  _activeTab = 'current';
  _selectedImages = new Set();
  _textExpanded = false;
  _pendingCapture = null;
  _draggedPage = null;
  _eventListCache = [];
  _eventListLastFetched = null;
  _eventListRefreshTimer = null;
  _currentMatchedEvent = null;
  _availableTags = [];
  _availableEventTypes = [];
  _availableDistances = [];
  _selectedEventTypeId = null;
  _selectedTagIds = new Set();
  _selectedDistanceValues = [];
  _eventEditorExpanded = true;
  _pendingScreenshots = [];
  _lastKnownUrl = null;
  _pendingUrlChange = null;
  _currentLinkDiscovery = null;
  _extractedPageLinks = [];
  _newDiscoveredLinks = [];
  _selectedNewLinks = new Set();
  _uploadQueue = [];
}
