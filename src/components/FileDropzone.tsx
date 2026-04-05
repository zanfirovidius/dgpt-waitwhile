'use client';

import { AlertCircle, UploadCloud } from 'lucide-react';
import { useRef, useState } from 'react';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const openFilePicker = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

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
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        className={`ui-dropzone group rounded-2xl border-2 border-dashed p-8 text-center transition-[background-color,border-color,box-shadow,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100 ${
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer active:scale-[0.995]'
        } ${isDragActive ? 'ui-dropzone-active shadow-sm' : ''}`}
        onClick={openFilePicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openFilePicker();
          }
        }}
	      >
		        <UploadCloud className="ui-dropzone-icon mx-auto mb-4 transition-colors" size={48} />
	        <h3 className="ui-section-title mb-1 text-base-content">{title}</h3>
	        <p className="ui-body mx-auto text-base-content/60">{subtitle}</p>
	        {hint ? <p className="mt-3 text-[0.8rem] leading-5 text-base-content/45">{hint}</p> : null}
	        <input
          ref={inputRef}
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
	        <div className="flex items-start gap-2 rounded-xl border border-error/20 bg-error/5 px-3 py-2 text-[0.94rem] leading-6 text-base-content">
	          <AlertCircle size={16} />
	          <span>{error}</span>
	        </div>
      ) : null}
    </div>
  );
}
