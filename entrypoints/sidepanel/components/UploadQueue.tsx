/**
 * Upload queue component for screenshot uploads
 */
import { useCallback } from 'preact/hooks';
import type { QueueItem } from './types';

export interface UploadQueueProps {
  items: QueueItem[];
  visible: boolean;
  onRetry: (id: string) => void;
}

export function UploadQueue({
  items,
  visible,
  onRetry,
}: UploadQueueProps): preact.JSX.Element | null {
  if (!visible || items.length === 0) {
    return null;
  }

  return (
    <div class="upload-queue" style={{ display: 'block' }}>
      <div class="upload-queue-header">
        <span class="upload-queue-title">Uploading...</span>
        <span class="upload-queue-count">{items.length}</span>
      </div>
      <div class="upload-queue-items">
        {items.map((item) => (
          <UploadQueueItem
            key={item.id}
            item={item}
            onRetry={onRetry}
          />
        ))}
      </div>
    </div>
  );
}

interface UploadQueueItemProps {
  item: QueueItem;
  onRetry: (id: string) => void;
}

function UploadQueueItem({ item, onRetry }: UploadQueueItemProps): preact.JSX.Element {
  const handleRetryClick = useCallback(() => {
    onRetry(item.id);
  }, [item.id, onRetry]);

  const statusClass = `upload-queue-item ${item.status}`;

  return (
    <div class={statusClass} data-queue-id={item.id}>
      <img class="upload-queue-thumb" src={item.thumbnail} alt="" />
      {item.status === 'complete' && (
        <span class="upload-queue-check">{'\u2713'}</span>
      )}
      {item.status === 'failed' && (
        <button
          class="upload-queue-retry"
          title="Retry upload"
          onClick={handleRetryClick}
        >
          {'\u21BB'}
        </button>
      )}
      <span class="upload-queue-label">
        {item.status === 'uploading' ? `${item.progress}%` : item.status}
      </span>
    </div>
  );
}
