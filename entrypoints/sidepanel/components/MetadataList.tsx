/**
 * Metadata list component for page detail view
 */

export interface MetadataListProps {
  metadata: Record<string, string>;
}

export function MetadataList({ metadata }: MetadataListProps): preact.JSX.Element {
  const entries = Object.entries(metadata);

  if (entries.length === 0) {
    return <div class="metadata-list" />;
  }

  return (
    <div class="metadata-list">
      {entries.map(([key, value]) => (
        <MetadataItem key={key} itemKey={key} value={value} />
      ))}
    </div>
  );
}

interface MetadataItemProps {
  itemKey: string;
  value: string;
}

function MetadataItem({ itemKey, value }: MetadataItemProps): preact.JSX.Element {
  return (
    <div class="metadata-item">
      <span class="metadata-key">{itemKey}</span>
      <span class="metadata-value">{value}</span>
    </div>
  );
}
