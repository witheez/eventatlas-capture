/**
 * Single bundle accordion item component
 */
import { useState, useCallback } from 'preact/hooks';
import type { Bundle } from './types';
import { PageItem } from './PageItem';

export interface BundleItemProps {
  bundle: Bundle;
  isCurrentBundle: boolean;
  onToggleExpanded: (bundleId: string) => void;
  onDeleteBundle: (bundleId: string) => void;
  onCopyBundle: (bundleId: string) => void;
  onPageClick: (bundleId: string, pageIndex: number) => void;
  onRemovePage: (bundleId: string, pageIndex: number) => void;
  onDragStart: (bundleId: string, pageIndex: number) => void;
  onDragEnd: () => void;
  onDrop: (targetBundleId: string) => void;
}

function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function BundleItem({
  bundle,
  isCurrentBundle: _isCurrentBundle,
  onToggleExpanded,
  onDeleteBundle,
  onCopyBundle,
  onPageClick,
  onRemovePage,
  onDragStart,
  onDragEnd,
  onDrop,
}: BundleItemProps): preact.JSX.Element {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleHeaderClick = useCallback(() => {
    onToggleExpanded(bundle.id);
  }, [bundle.id, onToggleExpanded]);

  const handleDeleteClick = useCallback(
    (e: Event) => {
      e.stopPropagation();
      onDeleteBundle(bundle.id);
    },
    [bundle.id, onDeleteBundle]
  );

  const handleCopyClick = useCallback(
    (e: Event) => {
      e.stopPropagation();
      onCopyBundle(bundle.id);
    },
    [bundle.id, onCopyBundle]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    const relatedTarget = e.relatedTarget as Node | null;
    const currentTarget = e.currentTarget as HTMLElement;
    if (!currentTarget.contains(relatedTarget)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      onDrop(bundle.id);
    },
    [bundle.id, onDrop]
  );

  const pageCount = bundle.pages?.length || 0;
  const wrapperClass = `accordion-bundle${bundle.expanded ? ' expanded' : ''}${isDragOver ? ' drag-over' : ''}`;

  return (
    <div
      class={wrapperClass}
      data-bundle-id={bundle.id}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div class="accordion-header" onClick={handleHeaderClick}>
        <span class="accordion-chevron">{'\u25B6'}</span>
        <span class="accordion-icon">{'\u{1F4C1}'}</span>
        <div class="accordion-info">
          <div class="accordion-name">{bundle.name || 'Unnamed Bundle'}</div>
          <div class="accordion-meta">
            {pageCount} page{pageCount !== 1 ? 's' : ''}
          </div>
        </div>
        <div class="accordion-actions">
          <button
            class="accordion-action-btn"
            title="Copy bundle to clipboard"
            onClick={handleCopyClick}
          >
            {'\u{1F4CB}'}
          </button>
          <button
            class="accordion-action-btn delete"
            title="Delete bundle"
            onClick={handleDeleteClick}
          >
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
              <PageItem
                key={`${bundle.id}-${index}`}
                bundleId={bundle.id}
                capture={capture}
                index={index}
                onPageClick={onPageClick}
                onRemove={onRemovePage}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                getDomain={getDomain}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
