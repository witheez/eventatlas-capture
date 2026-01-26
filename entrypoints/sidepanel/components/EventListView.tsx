/**
 * Event list view component
 */
import type { EventListItem } from './types';
import { EventListItemComponent } from './EventListItem';

export interface EventListViewProps {
  events: EventListItem[];
  isLoading: boolean;
  emptyMessage: string;
  onEventClick: (event: EventListItem) => void;
  onCopyUrl: (url: string) => void;
}

export function EventListView({
  events,
  isLoading,
  emptyMessage,
  onEventClick,
  onCopyUrl,
}: EventListViewProps): preact.JSX.Element {
  if (isLoading) {
    return (
      <div class="event-list-loading" style={{ display: 'block' }}>
        Loading events...
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div class="event-list-empty" style={{ display: 'block' }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <div class="event-list">
      {events.map((event) => (
        <EventListItemComponent
          key={event.id}
          event={event}
          onClick={onEventClick}
          onCopyUrl={onCopyUrl}
        />
      ))}
    </div>
  );
}
