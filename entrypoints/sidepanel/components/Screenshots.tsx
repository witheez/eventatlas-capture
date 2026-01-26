/**
 * Screenshots gallery component for event editor
 */
import { useState, useCallback } from 'preact/hooks';
import type { MediaAsset, PendingScreenshot, QueueItem } from './types';

export interface ScreenshotsProps {
  savedMedia: MediaAsset[];
  pendingScreenshots: PendingScreenshot[];
  uploadingItems: QueueItem[];
  onDeleteScreenshot: (mediaId: number) => void;
  onRemovePending: (id: string) => void;
  onOpenModal: (url: string) => void;
}

export function Screenshots({
  savedMedia,
  pendingScreenshots,
  uploadingItems,
  onDeleteScreenshot,
  onRemovePending,
  onOpenModal,
}: ScreenshotsProps): preact.JSX.Element {
  const screenshots = savedMedia.filter((m) => m.type === 'screenshot' || m.type === 'Screenshot');

  if (screenshots.length === 0 && pendingScreenshots.length === 0 && uploadingItems.length === 0) {
    return (
      <div class="saved-screenshots">
        <div class="no-screenshots">No screenshots yet</div>
      </div>
    );
  }

  return (
    <div class="saved-screenshots">
      {screenshots.map((item) => (
        <SavedScreenshotItem
          key={item.id}
          item={item}
          onDelete={onDeleteScreenshot}
          onOpenModal={onOpenModal}
        />
      ))}
      {uploadingItems.map((item) => (
        <UploadingScreenshotItem key={item.id} item={item} />
      ))}
      {pendingScreenshots.length > 0 && (
        <PendingScreenshotsSection items={pendingScreenshots} onRemove={onRemovePending} />
      )}
    </div>
  );
}

interface SavedScreenshotItemProps {
  item: MediaAsset;
  onDelete: (mediaId: number) => void;
  onOpenModal: (url: string) => void;
}

function SavedScreenshotItem({
  item,
  onDelete,
  onOpenModal,
}: SavedScreenshotItemProps): preact.JSX.Element {
  const [hasError, setHasError] = useState(false);

  const handleClick = useCallback(() => {
    onOpenModal(item.file_url);
  }, [item.file_url, onOpenModal]);

  const handleDeleteClick = useCallback(
    (e: Event) => {
      e.stopPropagation();
      onDelete(item.id);
    },
    [item.id, onDelete]
  );

  const handleImageError = useCallback(() => {
    setHasError(true);
  }, []);

  return (
    <div class="saved-screenshot-item" onClick={handleClick}>
      {hasError ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: '#9ca3af',
            fontSize: '10px',
          }}
        >
          Failed
        </div>
      ) : (
        <img
          src={item.thumbnail_url || item.file_url}
          alt={item.name || 'Screenshot'}
          onError={handleImageError}
        />
      )}
      <button class="screenshot-delete-btn" title="Delete screenshot" onClick={handleDeleteClick}>
        {'\u00D7'}
      </button>
    </div>
  );
}

interface UploadingScreenshotItemProps {
  item: QueueItem;
}

function UploadingScreenshotItem({ item }: UploadingScreenshotItemProps): preact.JSX.Element {
  return (
    <div class="saved-screenshot-item uploading" data-queue-id={item.id}>
      <img src={item.thumbnail} alt="Uploading..." />
      <div class="upload-overlay">
        <span>{item.progress}%</span>
      </div>
    </div>
  );
}

interface PendingScreenshotsSectionProps {
  items: PendingScreenshot[];
  onRemove: (id: string) => void;
}

function PendingScreenshotsSection({
  items,
  onRemove,
}: PendingScreenshotsSectionProps): preact.JSX.Element {
  return (
    <div class="pending-screenshots-section">
      <div class="pending-screenshots-header">
        <span class="pending-screenshots-title">Pending Upload</span>
        <span class="pending-screenshots-count">{items.length}</span>
      </div>
      <div class="pending-screenshots-grid">
        {items.map((item) => (
          <PendingScreenshotItem key={item.id} item={item} onRemove={onRemove} />
        ))}
      </div>
    </div>
  );
}

interface PendingScreenshotItemProps {
  item: PendingScreenshot;
  onRemove: (id: string) => void;
}

function PendingScreenshotItem({ item, onRemove }: PendingScreenshotItemProps): preact.JSX.Element {
  const handleRemoveClick = useCallback(
    (e: Event) => {
      e.stopPropagation();
      onRemove(item.id);
    },
    [item.id, onRemove]
  );

  return (
    <div class="pending-screenshot-item">
      <img src={item.data} alt="Pending screenshot" />
      <span class="pending-badge">Pending</span>
      <button
        class="pending-screenshot-remove"
        title="Remove pending screenshot"
        onClick={handleRemoveClick}
      >
        {'\u00D7'}
      </button>
    </div>
  );
}
