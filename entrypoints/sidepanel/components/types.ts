/**
 * Shared types for Preact components
 */

export interface Bundle {
  id: string;
  name: string;
  pages: Capture[];
  createdAt: string;
  expanded?: boolean;
}

export interface Capture {
  title?: string;
  editedTitle?: string;
  url?: string;
  editedUrl?: string;
  screenshot?: string;
  images?: string[];
  selectedImages?: string[];
  html?: string;
  text?: string;
  metadata?: Record<string, string>;
  includeHtml?: boolean;
  includeImages?: boolean;
  includeScreenshot?: boolean;
}

export interface EventListItem {
  id: number;
  name: string;
  primary_url?: string;
  primary_link_id?: number;
  start_datetime?: string;
  event_type?: string;
  tags?: string[];
  distances?: number[];
  missing?: string[];
}

export interface QueueItem {
  id: string;
  eventId: number;
  thumbnail: string;
  status: 'pending' | 'uploading' | 'complete' | 'failed';
  progress: number;
  filename: string;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error';
}

export interface Tag {
  id: number;
  name: string;
  events_count?: number;
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

export interface MediaAsset {
  id: number;
  name?: string;
  type: string;
  file_url: string;
  thumbnail_url?: string;
}

export interface MatchedEvent {
  id: number;
  title?: string;
  name?: string;
  event_type_id?: number;
  tags?: Tag[];
  distances_km?: number[];
  notes?: string;
  media?: MediaAsset[];
}

export interface PendingScreenshot {
  id: string;
  data: string;
  filename: string;
}
