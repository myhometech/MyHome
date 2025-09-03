/**
 * THMB-4: Responsive thumbnail image component with srcset, fallbacks, and real-time updates
 */

import { useState, useRef, useEffect } from 'react';
import { FileText, Image, File, Loader2 } from 'lucide-react';
import { useThumbnail } from '@/hooks/useThumbnail';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ThumbnailImageProps {
  documentId: string;
  sourceHash: string;
  documentName: string;
  mimeType: string;
  className?: string;
  aspectRatio?: 'square' | 'document' | 'auto';
  size?: 'sm' | 'md' | 'lg';
  fallbackIcon?: 'auto' | 'pdf' | 'image' | 'document';
  showSpinner?: boolean;
  priority?: boolean; // For above-the-fold images
}

const MIME_TYPE_COLORS = {
  'application/pdf': 'text-red-500 bg-red-50',
  'image/': 'text-emerald-500 bg-emerald-50',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'text-blue-500 bg-blue-50',
  'default': 'text-gray-500 bg-gray-50'
};

const SIZE_CLASSES = {
  sm: 'w-12 h-16',
  md: 'w-16 h-20', 
  lg: 'w-24 h-32'
};

const ICON_SIZES = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-12 w-12'
};

/**
 * Get appropriate fallback icon based on MIME type
 */
function getFallbackIcon(mimeType: string, fallbackIcon?: string) {
  if (fallbackIcon && fallbackIcon !== 'auto') {
    const iconMap = {
      pdf: FileText,
      image: Image,
      document: File
    };
    return iconMap[fallbackIcon as keyof typeof iconMap] || File;
  }

  if (mimeType === 'application/pdf') {
    return FileText;
  } else if (mimeType.startsWith('image/')) {
    return Image;
  } else {
    return File;
  }
}

/**
 * Get appropriate color classes based on MIME type
 */
function getColorClasses(mimeType: string): string {
  for (const [prefix, classes] of Object.entries(MIME_TYPE_COLORS)) {
    if (prefix === 'default') continue;
    if (mimeType.startsWith(prefix)) {
      return classes;
    }
  }
  return MIME_TYPE_COLORS.default;
}

/**
 * Get error message for display
 */
function getErrorMessage(errorCode?: string): string {
  const errorMessages: Record<string, string> = {
    'PDF_PASSWORD': 'PDF is password protected',
    'UNSUPPORTED_TYPE': 'File type not supported for preview',
    'SIZE_OVER_LIMIT': 'File too large for preview',
    'HTTP_403': 'Access denied',
    'HTTP_404': 'Thumbnail not found',
    'HTTP_500': 'Server error generating preview'
  };

  return errorMessages[errorCode || ''] || 'Preview unavailable';
}

/**
 * Responsive thumbnail image component
 */
export function ThumbnailImage({
  documentId,
  sourceHash,
  documentName,
  mimeType,
  className,
  aspectRatio = 'document',
  size = 'md',
  fallbackIcon = 'auto',
  showSpinner = true,
  priority = false
}: ThumbnailImageProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [layoutShiftPrevented, setLayoutShiftPrevented] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  
  const {
    status,
    urls,
    errorCode,
    isPolling,
    handleImageError,
    handleThumbnailCreated
  } = useThumbnail(documentId, sourceHash);

  // Set up real-time event handling (simplified for this implementation)
  // In a real app, this would connect to WebSocket/SSE
  useEffect(() => {
    // Placeholder for real-time event subscription
    // TODO: Connect to WebSocket/SSE for thumbnail.created events
    // window.addEventListener('thumbnail.created', handleThumbnailCreated);
    // return () => window.removeEventListener('thumbnail.created', handleThumbnailCreated);
  }, [handleThumbnailCreated]);

  // Handle image load success
  const handleImageLoad = () => {
    setImageLoaded(true);
    if (!layoutShiftPrevented) {
      setLayoutShiftPrevented(true);
    }
  };

  // Handle image error and attempt recovery
  const handleImageErrorWithRecovery = () => {
    console.log(`🔄 [THUMBNAIL] Image failed to load, attempting recovery`);
    setImageLoaded(false);
    handleImageError(240); // Try to recover the primary variant
  };

  // Get aspect ratio classes
  const getAspectRatioClasses = () => {
    switch (aspectRatio) {
      case 'square':
        return 'aspect-square';
      case 'document':
        return 'aspect-[3/4]'; // Typical document ratio
      case 'auto':
        return '';
      default:
        return 'aspect-[3/4]';
    }
  };

  // Build srcset for responsive images
  const buildSrcSet = () => {
    if (!urls) return '';
    
    const srcSetParts: string[] = [];
    
    if (urls[96]) srcSetParts.push(`${urls[96]} 96w`);
    if (urls[240]) srcSetParts.push(`${urls[240]} 240w`);
    if (urls[480]) srcSetParts.push(`${urls[480]} 480w`);
    
    return srcSetParts.join(', ');
  };

  // Get sizes attribute for responsive loading
  const getSizes = () => {
    switch (size) {
      case 'sm':
        return '96px';
      case 'md':
        return '(max-width: 400px) 240px, 240px';
      case 'lg':
        return '(max-width: 400px) 240px, 480px';
      default:
        return '240px';
    }
  };

  const FallbackIcon = getFallbackIcon(mimeType, fallbackIcon);
  const colorClasses = getColorClasses(mimeType);
  const sizeClasses = SIZE_CLASSES[size];
  const iconSizeClasses = ICON_SIZES[size];
  const aspectRatioClasses = getAspectRatioClasses();

  // Main container classes
  const containerClasses = cn(
    'relative overflow-hidden rounded-lg bg-gray-50 flex items-center justify-center',
    sizeClasses,
    aspectRatioClasses,
    className
  );

  // Show image if ready and has URLs
  if (status === 'ready' && urls?.['240']) {
    return (
      <div className={containerClasses}>
        {/* Prevent layout shift with skeleton during load */}
        {!imageLoaded && (
          <div className="absolute inset-0 bg-gray-100 animate-pulse" />
        )}
        
        {/* Responsive thumbnail image */}
        <img
          ref={imgRef}
          src={urls['240']}
          srcSet={buildSrcSet()}
          sizes={getSizes()}
          alt={`Thumbnail for ${documentName}`}
          className={cn(
            'w-full h-full object-cover transition-opacity duration-200',
            imageLoaded ? 'opacity-100' : 'opacity-0'
          )}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={handleImageLoad}
          onError={handleImageErrorWithRecovery}
          data-testid={`thumbnail-image-${documentId}`}
        />
        
        {/* Loading overlay during recovery */}
        {!imageLoaded && isPolling && showSpinner && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80">
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          </div>
        )}
      </div>
    );
  }

  // Show failed state with tooltip
  if (status === 'failed') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(containerClasses, colorClasses)}>
              <div className="flex flex-col items-center justify-center p-2">
                <FallbackIcon className={cn(iconSizeClasses, 'mb-1')} />
                {size !== 'sm' && (
                  <div className="text-xs text-center text-gray-500 leading-tight">
                    Preview unavailable
                  </div>
                )}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getErrorMessage(errorCode)}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Show loading state (idle, queued, or polling)
  return (
    <div className={cn(containerClasses, colorClasses)}>
      <div className="flex flex-col items-center justify-center p-2">
        {/* Show spinner only during active polling */}
        {isPolling && showSpinner ? (
          <div className="relative">
            <FallbackIcon className={cn(iconSizeClasses, 'mb-1')} />
            <Loader2 className="absolute -top-1 -right-1 h-3 w-3 animate-spin" />
          </div>
        ) : (
          <FallbackIcon className={cn(iconSizeClasses, 'mb-1')} />
        )}
        
        {size !== 'sm' && (
          <div className="text-xs text-center text-gray-500 leading-tight">
            {status === 'queued' || isPolling ? 'Generating...' : 'Preview'}
          </div>
        )}
      </div>
      
      {/* Subtle skeleton animation during initial load */}
      {status === 'idle' && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
      )}
    </div>
  );
}