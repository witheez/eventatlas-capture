/**
 * Bundles list component with accordion functionality
 */
import type { Bundle } from './types';
import { BundleItem } from './BundleItem';

export interface BundlesListProps {
  bundles: Bundle[];
  currentBundleId: string | null;
  onToggleExpanded: (bundleId: string) => void;
  onDeleteBundle: (bundleId: string) => void;
  onCopyBundle: (bundleId: string) => void;
  onPageClick: (bundleId: string, pageIndex: number) => void;
  onRemovePage: (bundleId: string, pageIndex: number) => void;
  onDragStart: (bundleId: string, pageIndex: number) => void;
  onDragEnd: () => void;
  onDrop: (targetBundleId: string) => void;
}

export function BundlesList({
  bundles,
  currentBundleId,
  onToggleExpanded,
  onDeleteBundle,
  onCopyBundle,
  onPageClick,
  onRemovePage,
  onDragStart,
  onDragEnd,
  onDrop,
}: BundlesListProps): preact.JSX.Element {
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
        <BundleItem
          key={bundle.id}
          bundle={bundle}
          isCurrentBundle={bundle.id === currentBundleId}
          onToggleExpanded={onToggleExpanded}
          onDeleteBundle={onDeleteBundle}
          onCopyBundle={onCopyBundle}
          onPageClick={onPageClick}
          onRemovePage={onRemovePage}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDrop={onDrop}
        />
      ))}
    </>
  );
}
