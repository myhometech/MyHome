import imageCompression from 'browser-image-compression';

interface CompressionOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  useWebWorker?: boolean;
  quality?: number;
}

const DEFAULT_OPTIONS: CompressionOptions = {
  maxSizeMB: 2, // Maximum file size in MB
  maxWidthOrHeight: 1920, // Maximum width or height in pixels
  useWebWorker: true, // Use web worker for better performance
  quality: 0.8, // JPEG quality (0-1)
};

export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  
  try {
    // Check if file is already small enough
    if (file.size <= (config.maxSizeMB! * 1024 * 1024)) {
      // Image within size limit
      return file;
    }

    // Compressing image - debug info removed

    const compressedFile = await imageCompression(file, {
      maxSizeMB: config.maxSizeMB!,
      maxWidthOrHeight: config.maxWidthOrHeight!,
      useWebWorker: config.useWebWorker!,
      initialQuality: config.quality!,
    });

    // Image compression completed - debug info removed

    return compressedFile;
  } catch (error) {
    // Image compression failed - error logging removed
    // Return original file if compression fails
    return file;
  }
}

export async function createThumbnail(
  file: File,
  maxSize: number = 300
): Promise<File> {
  return compressImage(file, {
    maxSizeMB: 0.5, // Smaller size for thumbnails
    maxWidthOrHeight: maxSize,
    quality: 0.7,
  });
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') && 
         ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type);
}

export function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}