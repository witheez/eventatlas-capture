/**
 * Page item component within a bundle accordion
 */
import { useState, useCallback } from 'preact/hooks';
import type { Capture } from './types';

export interface PageItemProps {
  bundleId: string;
  capture: Capture;
  index: number;
  onPageClick: (bundleId: string, pageIndex: number) => void;
  onRemove: (bundleId: string, pageIndex: number) => void;
  onDragStart: (bundleId: string, pageIndex: number) => void;
  onDragEnd: () => void;
  getDomain: (url: string) => string;
}

export function PageItem({
  bundleId,
  capture,
  index,
  onPageClick,
  onRemove,
  onDragStart,
  onDragEnd,
  getDomain,
}: PageItemProps): preact.JSX.Element {
  const [isDragging, setIsDragging] = useState(false);
  const [imageError, setImageError] = useState(false);

  const handleClick = useCallback(
    (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest('.accordion-page-remove') || target.closest('.accordion-page-drag')) {
        return;
      }
      onPageClick(bundleId, index);
    },
    [bundleId, index, onPageClick]
  );

  const handleRemoveClick = useCallback(
    (e: Event) => {
      e.stopPropagation();
      onRemove(bundleId, index);
    },
    [bundleId, index, onRemove]
  );

  const handleDragStart = useCallback(
    (e: DragEvent) => {
      setIsDragging(true);
      onDragStart(bundleId, index);
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', JSON.stringify({ bundleId, pageIndex: index }));
      }
    },
    [bundleId, index, onDragStart]
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    onDragEnd();
  }, [onDragEnd]);

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  const thumbUrl = capture.screenshot || capture.images?.[0] || capture.selectedImages?.[0];
  const title = capture.editedTitle || capture.title || 'Untitled';
  const domain = getDomain(capture.editedUrl || capture.url || '');

  return (
    <div
      class={`accordion-page${isDragging ? ' dragging' : ''}`}
      draggable
      data-bundle-id={bundleId}
      data-page-index={index}
      onClick={handleClick}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <span class="accordion-page-drag">{'\u22EE\u22EE'}</span>
      <div class="accordion-page-thumb">
        {thumbUrl && !imageError ? (
          <img src={thumbUrl} alt="" onError={handleImageError} />
        ) : (
          '\u{1F4C4}'
        )}
      </div>
      <div class="accordion-page-info">
        <div class="accordion-page-title">{title}</div>
        <div class="accordion-page-domain">{domain}</div>
      </div>
      <button class="accordion-page-remove" title="Remove from bundle" onClick={handleRemoveClick}>
        {'\u00D7'}
      </button>
    </div>
  );
}
