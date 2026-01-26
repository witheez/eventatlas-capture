/**
 * Image gallery component for page detail view
 */
import { useState, useCallback } from 'preact/hooks';

export interface ImageGalleryProps {
  images: string[];
  selectedImages: Set<string>;
  onToggleImage: (url: string) => void;
}

export function ImageGallery({
  images,
  selectedImages,
  onToggleImage,
}: ImageGalleryProps): preact.JSX.Element {
  if (images.length === 0) {
    return (
      <div class="image-gallery">
        <div class="image-gallery-empty">No images found on this page</div>
      </div>
    );
  }

  return (
    <div class="image-gallery">
      {images.map((url, index) => (
        <ImageGalleryItem
          key={`${url}-${index}`}
          url={url}
          isSelected={selectedImages.has(url)}
          onToggle={onToggleImage}
        />
      ))}
    </div>
  );
}

interface ImageGalleryItemProps {
  url: string;
  isSelected: boolean;
  onToggle: (url: string) => void;
}

function ImageGalleryItem({
  url,
  isSelected,
  onToggle,
}: ImageGalleryItemProps): preact.JSX.Element {
  const [hasError, setHasError] = useState(false);

  const handleClick = useCallback(() => {
    onToggle(url);
  }, [url, onToggle]);

  const handleImageError = useCallback(() => {
    setHasError(true);
  }, []);

  return (
    <div class="image-gallery-item" onClick={handleClick}>
      {hasError ? (
        <div class="image-gallery-error">Failed to load</div>
      ) : (
        <img src={url} alt="" onError={handleImageError} />
      )}
      <input
        type="checkbox"
        class="image-gallery-checkbox"
        checked={isSelected}
        onChange={handleClick}
      />
    </div>
  );
}
