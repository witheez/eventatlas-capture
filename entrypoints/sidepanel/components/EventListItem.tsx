/**
 * Individual event list item component
 */
import { useState, useCallback } from 'preact/hooks';
import type { EventListItem } from './types';

export interface EventListItemProps {
  event: EventListItem;
  onClick: (event: EventListItem) => void;
  onCopyUrl: (url: string) => void;
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

export function EventListItemComponent({
  event,
  onClick,
  onCopyUrl,
}: EventListItemProps): preact.JSX.Element {
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  const handleClick = useCallback(() => {
    onClick(event);
  }, [event, onClick]);

  const handleCopyClick = useCallback((e: Event) => {
    e.stopPropagation();
    const url = fixUrl(event.primary_url || '');
    onCopyUrl(url);
    setCopyState('copied');
    setTimeout(() => setCopyState('idle'), 1500);
  }, [event.primary_url, onCopyUrl]);

  const startDate = formatEventDate(event.start_datetime);
  const eventUrl = fixUrl(event.primary_url || '');

  return (
    <div class="event-list-item" onClick={handleClick}>
      <div class="event-list-item-header">
        <div class="event-list-item-title">{event.name}</div>
        {startDate && <div class="event-list-item-date">{startDate}</div>}
      </div>
      <div class="event-list-item-url-row">
        <div class="event-list-item-url">{eventUrl}</div>
        <button
          class="copy-url-btn"
          title="Copy URL"
          onClick={handleCopyClick}
        >
          {copyState === 'copied' ? '\u2713' : '\u{1F4CB}'}
        </button>
      </div>
      <div class="event-list-item-meta">
        {event.event_type && (
          <span class="meta-badge meta-type">{event.event_type}</span>
        )}
        {event.tags && event.tags.length > 0 && (
          <>
            <span class="meta-badge meta-tag">{event.tags[0]}</span>
            {event.tags.length > 1 && (
              <span class="meta-more">+{event.tags.length - 1}</span>
            )}
          </>
        )}
        {event.distances && event.distances.length > 0 && (
          <span class="meta-badge meta-distance">
            {event.distances.map(d => `${d}km`).join(', ')}
          </span>
        )}
      </div>
      {event.missing && event.missing.length > 0 && (
        <div class="event-list-item-missing">
          {event.missing.map((m, i) => (
            <span key={i} class="missing-badge">{m}</span>
          ))}
        </div>
      )}
    </div>
  );
}
