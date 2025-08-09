import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onDrop: (files: File[]) => void;
  accept?: Record<string, string[]>;
  maxSize?: number;
  multiple?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function FileUpload({
  onDrop,
  accept = {
    "application/pdf": [".pdf"],
    "image/*": [".png", ".jpg", ".jpeg", ".webp"],
  },
  maxSize = 10 * 1024 * 1024, // 10MB
  multiple = true,
  className,
  children,
}: FileUploadProps) {
  const onDropCallback = useCallback(
    (acceptedFiles: File[]) => {
      onDrop(acceptedFiles);
    },
    [onDrop]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropCallback,
    accept,
    maxSize,
    multiple,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer transition-colors",
        isDragActive && "border-primary bg-blue-50",
        className
      )}
    >
      <input {...getInputProps()} />
      {children}
    </div>
  );
}
