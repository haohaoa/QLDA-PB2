import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { getImagePreviewUrl } from '../utils/driveImageUtils';

interface ViolationPhotoImageProps {
  src: string;
  alt: string;
  className: string;
  width?: number;
}

export const ViolationPhotoImage: React.FC<ViolationPhotoImageProps> = ({
  src,
  alt,
  className,
  width,
}) => {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [src]);

  if (hasError) {
    return (
      <div
        role="img"
        aria-label={`${alt} (không tải được)`}
        className={`flex items-center justify-center gap-2 bg-slate-100 p-3 text-center text-xs font-semibold text-slate-500 ${className}`}
      >
        <ImageOff className="h-4 w-4 shrink-0" />
        Không tải được ảnh. Kiểm tra quyền chia sẻ trên Google Drive.
      </div>
    );
  }

  return (
    <img
      src={getImagePreviewUrl(src, width)}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  );
};
