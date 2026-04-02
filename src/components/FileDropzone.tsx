'use client';

import { AlertCircle, UploadCloud } from 'lucide-react';
import { useId, useState } from 'react';

type FileDropzoneProps = {
  accept: string;
  title: string;
  subtitle: string;
  hint?: string;
  error?: string | null;
  disabled?: boolean;
  onFileSelected: (file: File) => void | Promise<void>;
};

export function FileDropzone({
  accept,
  title,
  subtitle,
  hint,
  error,
  disabled = false,
  onFileSelected,
}: FileDropzoneProps) {
  const inputId = useId();
  const [isDragActive, setIsDragActive] = useState(false);

  const handleFileUpload = async (file?: File | null) => {
    if (!file || disabled) {
      return;
    }

    await onFileSelected(file);
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (!disabled) {
      setIsDragActive(true);
    }
  };

  const onDragLeave = () => {
    setIsDragActive(false);
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragActive(false);

    if (disabled || !event.dataTransfer.files?.length) {
      return;
    }

    void handleFileUpload(event.dataTransfer.files[0]);
  };

  return (
    <div className="flex flex-col gap-4">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors group ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-primary hover:bg-base-200/50'} ${isDragActive ? 'border-primary bg-primary/10' : 'border-base-300'}`}
        onClick={() => {
          if (!disabled) {
            document.getElementById(inputId)?.click();
          }
        }}
      >
        <UploadCloud className={`mx-auto mb-4 transition-colors ${isDragActive ? 'text-primary' : 'text-base-content/40 group-hover:text-primary'}`} size={48} />
        <h3 className="mb-1 font-bold text-lg">{title}</h3>
        <p className="text-sm text-base-content/60">{subtitle}</p>
        {hint ? <p className="mt-2 text-xs text-base-content/40">{hint}</p> : null}
        <input
          id={inputId}
          type="file"
          accept={accept}
          className="hidden"
          disabled={disabled}
          onChange={(event) => {
            if (event.target.files?.length) {
              void handleFileUpload(event.target.files[0]);
              event.target.value = '';
            }
          }}
        />
      </div>

      {error ? (
        <div className="alert alert-error rounded-xl py-2 text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      ) : null}
    </div>
  );
}
